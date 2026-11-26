import { inject, Injectable, signal } from '@angular/core';
import { CallToneService } from './call-tone.service';

type CallUiStatus = 'idle' | 'loading' | 'incoming' | 'connecting' | 'active' | 'error';
type CallConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type CallTokenResponse = { token: string; canCall: boolean; serviceUrl: string; reason?: string | null };
type IncomingCall = { callId: string; conversationId: string; phone: string; sdp: string };
type IceResponse = { iceServers: RTCIceServer[]; expiresAt: number };

@Injectable({ providedIn: 'root' })
export class CallFeatureService {
  private readonly callTone = inject(CallToneService);
  readonly status = signal<CallUiStatus>('idle');
  readonly connectionStatus = signal<CallConnectionStatus>('disconnected');
  readonly connectionConversation = signal('');
  readonly incoming = signal<IncomingCall | null>(null);
  readonly active = signal<{ callId: string; conversationId: string; direction: 'INBOUND' | 'OUTBOUND' } | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly muted = signal(false);
  readonly hangupRequested = signal(false);
  readonly elapsedSeconds = signal(0);
  readonly outgoingSetup = signal(false);
  readonly error = signal('');
  readonly unavailableReason = signal('Las llamadas no están configuradas.');

  isToneMuted(): boolean { return this.callTone.muted(); }
  toggleToneMute(): void { this.callTone.toggleMuted(); }
  unlockTone(): void { this.callTone.unlock(); }

  private socket: WebSocket | null = null;
  private tokenData: CallTokenResponse | null = null;
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private timerId: number | null = null;
  private refreshId: number | null = null;
  private hangupTimeoutId: number | null = null;
  private retryId: number | null = null;
  private tokenRefreshId: number | null = null;
  private retryCount = 0;
  private manuallyDisconnected = false;
  private connecting: Promise<boolean> | null = null;
  isConnectedFor(conversationId: string): boolean {
    return this.connectionStatus() === 'connected'
      && this.socket?.readyState === WebSocket.OPEN;
  }

  connectCalls(_conversationId?: string): Promise<boolean> { return this.connectPresence(); }

  async connectPresence(): Promise<boolean> {
    if (this.active() || this.incoming()) {
      this.unavailableReason.set('Termina la llamada actual antes de cambiar la conexión.');
      return false;
    }
    if (this.isConnectedFor('')) return true;
    if (this.connecting) return this.connecting;
    if (this.retryId !== null) window.clearTimeout(this.retryId);
    this.retryId = null;
    this.callTone.unlock();
    this.manuallyDisconnected = false;
    this.connectionStatus.set('connecting');
    this.status.set('loading');
    this.connecting = this.openPresence();
    const connected = await this.connecting;
    this.connecting = null;
    if (connected) {
      this.retryCount = 0;
      this.scheduleTokenRefresh();
      this.connectionStatus.set('connected');
      this.status.set('idle');
      return true;
    }
    this.connectionStatus.set('error');
    this.status.set('idle');
    return false;
  }

  disconnectCalls(): void {
    if (this.active() || this.incoming()) {
      this.unavailableReason.set('Termina la llamada antes de desconectar.');
      return;
    }
    this.callTone.stop();
    this.manuallyDisconnected = true;
    if (this.retryId !== null) window.clearTimeout(this.retryId);
    this.retryId = null;
    if (this.tokenRefreshId !== null) window.clearTimeout(this.tokenRefreshId);
    this.tokenRefreshId = null;
    const socket = this.socket;
    this.socket = null;
    this.tokenData = null;
    this.connectionConversation.set('');
    this.connectionStatus.set('disconnected');
    this.status.set('idle');
    socket?.close(1000, 'Llamadas desconectadas por el agente');
  }

  async startCall(conversationId: string): Promise<void> {
    if (this.active() || this.incoming()) throw new Error('Ya hay una llamada activa o entrante.');
    this.error.set('');
    this.outgoingSetup.set(true);
    this.status.set('loading');
    try {
      if (!this.isConnectedFor(conversationId) && !await this.connectPresence()) throw new Error(this.unavailableReason());
      if (!this.tokenData?.canCall || !this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error(this.unavailableReason());
      const eligibilityResponse = await fetch(`/panel/calls/eligibility/${encodeURIComponent(conversationId)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const eligibility = await eligibilityResponse.json() as { canCall?: boolean; reason?: string };
      if (!eligibilityResponse.ok || !eligibility.canCall) throw new Error(eligibility.reason || 'No puedes llamar desde esta conversación.');
      const pc = await this.createPeerConnection();
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await this.waitForIceGathering(pc);
      const callId = crypto.randomUUID();
      this.active.set({ callId, conversationId, direction: 'OUTBOUND' });
      this.outgoingSetup.set(false);
      this.send({ event: 'call:start', callId, conversationId, sdp: pc.localDescription?.sdp || offer.sdp });
      this.status.set('connecting');
      this.callTone.start('outgoing');
    } catch (reason) {
      this.outgoingSetup.set(false);
      this.fail(this.errorMessage(reason, 'No se pudo iniciar la llamada.'));
      throw new Error(this.error());
    }
  }

  async acceptIncoming(): Promise<void> {
    const incoming = this.incoming();
    if (!incoming) return;
    this.error.set('');
    this.status.set('connecting');
    this.callTone.stop();
    try {
      const pc = await this.createPeerConnection();
      await pc.setRemoteDescription({ type: 'offer', sdp: incoming.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.waitForIceGathering(pc);
      this.send({ event: 'call:sdp-answer', callId: incoming.callId, sdp: pc.localDescription?.sdp || answer.sdp });
      this.active.set({ callId: incoming.callId, conversationId: incoming.conversationId, direction: 'INBOUND' });
      this.incoming.set(null);
    } catch (reason) {
      try { this.send({ event: 'call:reject', callId: incoming.callId }); } catch { /* el servidor detectará la desconexión */ }
      this.fail(this.errorMessage(reason, 'No se pudo contestar la llamada.'));
    }
  }

  rejectIncoming(): void {
    const incoming = this.incoming();
    this.callTone.stop();
    if (incoming) this.send({ event: 'call:reject', callId: incoming.callId });
    this.incoming.set(null);
    this.status.set('idle');
  }

  hangup(): void {
    if (this.hangupRequested()) return;
    const call = this.active();
    if (!call?.callId) return;
    this.hangupRequested.set(true);
    try {
      this.send({ event: 'call:hangup', callId: call.callId });
      this.hangupTimeoutId = window.setTimeout(() => {
        if (!this.hangupRequested()) return;
        this.hangupRequested.set(false);
        this.error.set('No recibimos confirmación para colgar. La llamada puede seguir activa; inténtalo otra vez.');
      }, 18_000);
    } catch {
      this.hangupRequested.set(false);
      this.error.set('Se perdió la conexión con el servicio. No se confirmó el fin de la llamada.');
    }
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.localStream?.getAudioTracks().forEach((track) => track.enabled = !next);
    const callId = this.active()?.callId || this.incoming()?.callId;
    if (callId) this.send({ event: 'call:mute', callId, enabled: next });
  }

  private async openPresence(): Promise<boolean> {
    this.status.set('loading');
    try {
      const response = await fetch('/panel/calls/token', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await response.json() as CallTokenResponse & { error?: string };
      if (!response.ok || !data.token || !data.serviceUrl) throw new Error(data.error || data.reason || 'El servicio de llamadas no está disponible.');
      this.tokenData = data;
      if (!data.canCall) {
        this.unavailableReason.set(data.reason || 'No se pueden recibir llamadas con esta cuenta.');
        this.status.set('idle');
        return false;
      }
      if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
      const wsUrl = new URL(data.serviceUrl);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl.pathname = '/signal';
      wsUrl.search = `?token=${encodeURIComponent(data.token)}`;
      const socket = new WebSocket(wsUrl);
      this.socket = socket;
      const ready = await new Promise<boolean>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('No responde el servicio de llamadas.')), 8000);
        socket.addEventListener('message', (event) => {
          const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (payload['event'] === 'call:ready') {
            window.clearTimeout(timeout);
            socket.send(JSON.stringify({ event: 'call:visibility', visible: document.visibilityState === 'visible' }));
            resolve(true);
          }
          this.handleServerEvent(payload);
        });
        socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('No se pudo conectar con el servicio de llamadas.')); }, { once: true });
        socket.addEventListener('close', () => {
          if (this.socket !== socket) return;
          this.connectionStatus.set('disconnected');
          this.connectionConversation.set('');
          if (this.status() === 'incoming' || this.status() === 'active' || this.status() === 'connecting') {
            this.fail('La conexión de llamadas se interrumpió.');
            this.scheduleReconnect();
          }
          else this.scheduleReconnect();
        });
      });
      this.status.set('idle');
      this.unavailableReason.set('');
      return ready;
    } catch (reason) {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        this.socket?.close();
        this.socket = null;
      }
      this.unavailableReason.set(this.errorMessage(reason, 'El servicio de llamadas no está disponible.'));
      this.status.set('idle');
      if (!/no están configuradas|desactivadas|ya no tiene acceso|no puede recibir llamadas/i.test(this.unavailableReason())) this.scheduleReconnect();
      return false;
    }
  }

  onVisibilityChange(): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ event: 'call:visibility', visible: document.visibilityState === 'visible' }));
  }

  private scheduleReconnect(): void {
    if (this.manuallyDisconnected || this.active() || this.incoming() || this.retryId !== null) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.retryCount++, 5));
    this.retryId = window.setTimeout(() => {
      this.retryId = null;
      void this.connectPresence();
    }, delay);
  }

  private scheduleTokenRefresh(delay = 240_000): void {
    if (this.tokenRefreshId !== null) window.clearTimeout(this.tokenRefreshId);
    this.tokenRefreshId = window.setTimeout(async () => {
      this.tokenRefreshId = null;
      if (this.socket?.readyState !== WebSocket.OPEN || this.manuallyDisconnected) return;
      try {
        const response = await fetch('/panel/calls/token', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        const data = await response.json() as CallTokenResponse & { error?: string };
        if (response.ok && data.token && data.serviceUrl && data.canCall) this.tokenData = data;
        this.scheduleTokenRefresh();
      } catch {
        this.scheduleTokenRefresh(60_000);
      }
    }, delay);
  }

  private handleServerEvent(event: Record<string, unknown>): void {
    switch (event['event']) {
      case 'call:ready':
        this.error.set('');
        if (this.status() === 'error') this.status.set('idle');
        break;
      case 'call:incoming': {
        const incoming = event as unknown as IncomingCall;
        this.incoming.set(incoming);
        this.status.set('incoming');
        this.callTone.start('incoming');
        break;
      }
      case 'call:connecting':
        this.status.set('connecting');
        if (typeof event['callId'] === 'string' && this.active()) this.active.update((call) => call ? { ...call, callId: event['callId'] as string } : call);
        break;
      case 'call:answer':
        this.callTone.stop();
        if (this.peer && typeof event['sdp'] === 'string') void this.peer.setRemoteDescription({ type: 'answer', sdp: event['sdp'] }).catch(() => this.fail('Meta envió una respuesta de llamada inválida.'));
        break;
      case 'call:accepted':
        this.callTone.stop();
        this.status.set('connecting');
        break;
      case 'call:rejected':
        this.fail(this.userFacingCallError(typeof event['message'] === 'string' ? event['message'] : 'El contacto rechazó la llamada.'));
        break;
      case 'call:ended':
        this.cleanupCall();
        break;
      case 'call:error':
        if (event['clientEvent'] === 'call:hangup') {
          if (this.hangupTimeoutId !== null) window.clearTimeout(this.hangupTimeoutId);
          this.hangupTimeoutId = null;
          this.hangupRequested.set(false);
          this.error.set(this.userFacingCallError(typeof event['message'] === 'string' ? event['message'] : 'No se pudo confirmar el fin de la llamada.'));
          break;
        }
        this.fail(this.userFacingCallError(typeof event['message'] === 'string' ? event['message'] : 'La llamada no pudo completarse.'));
        break;
      default:
        break;
    }
  }

  private userFacingCallError(message: string): string {
    if (/138000/.test(message)) return 'Las llamadas aún no están habilitadas en este número de WhatsApp. Revisa su configuración en Meta.';
    if (/Meta rechazó la acción de llamada/i.test(message)) return 'No se pudo iniciar la llamada. Revisa la configuración de llamadas de WhatsApp e inténtalo de nuevo.';
    return message;
  }

  private async createPeerConnection(): Promise<RTCPeerConnection> {
    const token = this.tokenData?.token;
    const serviceUrl = this.tokenData?.serviceUrl;
    if (!token || !serviceUrl) throw new Error('La sesión de llamada expiró.');
    const iceResponse = await fetch(`${serviceUrl.replace(/\/$/, '')}/turn-credentials`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!iceResponse.ok) throw new Error('No se pudieron preparar los servidores de audio.');
    const ice = await iceResponse.json() as IceResponse;
    this.peer?.close();
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
    this.peer = pc;
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
    pc.ontrack = (event) => this.remoteStream.set(event.streams[0] || new MediaStream([event.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.callTone.stop();
        this.status.set('active');
        this.startTimer();
        const call = this.active();
        if (call?.callId) this.send({ event: 'call:media-ready', callId: call.callId });
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.fail('No fue posible establecer el audio. Comprueba la red e intenta de nuevo.');
      }
    };
    this.refreshId = window.setTimeout(() => void this.refreshIce(pc).catch(() => undefined), Math.max(30_000, ice.expiresAt - Date.now() - 60_000));
    return pc;
  }

  private async refreshIce(pc: RTCPeerConnection): Promise<void> {
    const token = this.tokenData?.token;
    const serviceUrl = this.tokenData?.serviceUrl;
    if (!token || !serviceUrl || pc !== this.peer) return;
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/turn-credentials`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const ice = await response.json() as IceResponse;
    pc.setConfiguration({ ...pc.getConfiguration(), iceServers: ice.iceServers });
    this.refreshId = window.setTimeout(() => void this.refreshIce(pc).catch(() => undefined), Math.max(30_000, ice.expiresAt - Date.now() - 60_000));
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(done, 8000);
      function done(): void { window.clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', listener); resolve(); }
      const listener = () => { if (pc.iceGatheringState === 'complete') done(); };
      pc.addEventListener('icegatheringstatechange', listener);
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
    else throw new Error('La conexión con el servicio de llamadas no está activa.');
  }

  private startTimer(): void {
    if (this.timerId !== null) window.clearInterval(this.timerId);
    const started = Date.now();
    this.elapsedSeconds.set(0);
    this.timerId = window.setInterval(() => this.elapsedSeconds.set(Math.floor((Date.now() - started) / 1000)), 1000);
  }

  private fail(message: string): void {
    this.callTone.stop();
    this.error.set(message);
    this.status.set('error');
    this.incoming.set(null);
    this.active.set(null);
    this.hangupRequested.set(false);
    this.cleanupMedia();
  }

  private errorMessage(reason: unknown, fallback: string): string {
    if (reason instanceof DOMException && reason.name === 'NotAllowedError') return 'Permite el acceso al micrófono para contestar o llamar.';
    return reason instanceof Error ? reason.message : fallback;
  }

  private cleanupMedia(): void {
    if (this.timerId !== null) window.clearInterval(this.timerId);
    if (this.refreshId !== null) window.clearTimeout(this.refreshId);
    this.timerId = null;
    this.refreshId = null;
    if (this.hangupTimeoutId !== null) window.clearTimeout(this.hangupTimeoutId);
    this.hangupTimeoutId = null;
    this.peer?.close();
    this.peer = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream.set(null);
    this.muted.set(false);
  }

  private cleanupCall(): void {
    this.callTone.stop();
    this.cleanupMedia();
    this.outgoingSetup.set(false);
    this.hangupRequested.set(false);
    this.incoming.set(null);
    this.active.set(null);
    this.status.set('idle');
  }
}
