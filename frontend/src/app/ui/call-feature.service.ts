import { Injectable, signal } from '@angular/core';

type CallUiStatus = 'idle' | 'loading' | 'incoming' | 'connecting' | 'active' | 'error';
type CallTokenResponse = { token: string; canCall: boolean; serviceUrl: string; reason?: string | null };
type IncomingCall = { callId: string; conversationId: string; phone: string; sdp: string };
type IceResponse = { iceServers: RTCIceServer[]; expiresAt: number };

@Injectable({ providedIn: 'root' })
export class CallFeatureService {
  readonly status = signal<CallUiStatus>('idle');
  readonly incoming = signal<IncomingCall | null>(null);
  readonly active = signal<{ callId: string; conversationId: string; direction: 'INBOUND' | 'OUTBOUND' } | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly muted = signal(false);
  readonly elapsedSeconds = signal(0);
  readonly outgoingSetup = signal(false);
  readonly error = signal('');
  readonly enabledForConversation = signal(false);
  readonly unavailableReason = signal('Las llamadas no están configuradas.');

  private socket: WebSocket | null = null;
  private tokenData: CallTokenResponse | null = null;
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private timerId: number | null = null;
  private refreshId: number | null = null;
  private preparedConversation = '';
  private preparePromise: Promise<boolean> | null = null;

  async prepare(conversationId: string): Promise<boolean> {
    this.preparedConversation = conversationId;
    this.preparePromise = this.preparePromise || this.connect(conversationId);
    const available = await this.preparePromise;
    this.preparePromise = null;
    this.enabledForConversation.set(available);
    return available;
  }

  async startCall(conversationId: string): Promise<void> {
    this.error.set('');
    this.outgoingSetup.set(true);
    this.status.set('loading');
    try {
      if (this.preparedConversation !== conversationId || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        const ready = await this.connect(conversationId);
        if (!ready) throw new Error(this.unavailableReason());
      }
      if (!this.tokenData?.canCall || !this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error(this.unavailableReason());
      const pc = await this.createPeerConnection();
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await this.waitForIceGathering(pc);
      const callId = crypto.randomUUID();
      this.active.set({ callId, conversationId, direction: 'OUTBOUND' });
      this.outgoingSetup.set(false);
      this.send({ event: 'call:start', callId, conversationId, sdp: pc.localDescription?.sdp || offer.sdp });
      this.status.set('connecting');
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
    if (incoming) this.send({ event: 'call:reject', callId: incoming.callId });
    this.incoming.set(null);
    this.status.set('idle');
  }

  hangup(): void {
    const call = this.active();
    if (call?.callId) this.send({ event: 'call:hangup', callId: call.callId });
    this.cleanupCall();
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.localStream?.getAudioTracks().forEach((track) => track.enabled = !next);
    const callId = this.active()?.callId || this.incoming()?.callId;
    if (callId) this.send({ event: 'call:mute', callId, enabled: next });
  }

  private async connect(conversationId: string): Promise<boolean> {
    this.status.set('loading');
    try {
      const response = await fetch(`/panel/calls/token?conversationId=${encodeURIComponent(conversationId)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await response.json() as CallTokenResponse & { error?: string };
      if (!response.ok || !data.token || !data.serviceUrl) throw new Error(data.error || data.reason || 'El servicio de llamadas no está disponible.');
      this.tokenData = data;
      this.preparedConversation = conversationId;
      if (!data.canCall) {
        this.unavailableReason.set(data.reason || 'No se puede llamar desde esta conversación.');
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
          if (payload['event'] === 'call:ready') { window.clearTimeout(timeout); resolve(true); }
          this.handleServerEvent(payload);
        });
        socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('No se pudo conectar con el servicio de llamadas.')); }, { once: true });
        socket.addEventListener('close', () => {
          if (this.status() === 'incoming' || this.status() === 'active' || this.status() === 'connecting') this.fail('La conexión de llamadas se interrumpió.');
        });
      });
      this.status.set('idle');
      this.unavailableReason.set('');
      return ready;
    } catch (reason) {
      this.unavailableReason.set(this.errorMessage(reason, 'El servicio de llamadas no está disponible.'));
      this.status.set('idle');
      return false;
    }
  }

  private handleServerEvent(event: Record<string, unknown>): void {
    switch (event['event']) {
      case 'call:incoming': {
        const incoming = event as unknown as IncomingCall;
        this.incoming.set(incoming);
        this.status.set('incoming');
        break;
      }
      case 'call:connecting':
        this.status.set('connecting');
        if (typeof event['callId'] === 'string' && this.active()) this.active.update((call) => call ? { ...call, callId: event['callId'] as string } : call);
        break;
      case 'call:answer':
        if (this.peer && typeof event['sdp'] === 'string') void this.peer.setRemoteDescription({ type: 'answer', sdp: event['sdp'] }).catch(() => this.fail('Meta envió una respuesta de llamada inválida.'));
        break;
      case 'call:accepted':
        this.status.set('connecting');
        break;
      case 'call:rejected':
        this.fail(this.userFacingCallError(typeof event['message'] === 'string' ? event['message'] : 'El contacto rechazó la llamada.'));
        break;
      case 'call:ended':
        this.cleanupCall();
        break;
      case 'call:error':
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
        this.status.set('active');
        this.startTimer();
        const call = this.active();
        if (call?.direction === 'OUTBOUND' && call.callId) this.send({ event: 'call:media-ready', callId: call.callId });
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
    this.error.set(message);
    this.status.set('error');
    this.incoming.set(null);
    this.active.set(null);
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
    this.peer?.close();
    this.peer = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.remoteStream.set(null);
    this.muted.set(false);
  }

  private cleanupCall(): void {
    this.cleanupMedia();
    this.outgoingSetup.set(false);
    this.incoming.set(null);
    this.active.set(null);
    this.status.set('idle');
  }
}
