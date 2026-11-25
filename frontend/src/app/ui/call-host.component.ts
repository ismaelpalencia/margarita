import { Component, HostListener, inject } from '@angular/core';
import { CallFeatureService } from './call-feature.service';

@Component({
  selector: 'ui-call-host',
  standalone: true,
  template: `
    @if (feature.incoming(); as incoming) {
      <div class="call-backdrop" role="presentation">
        <section class="call-card" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
          <span class="call-kicker">LLAMADA DE WHATSAPP</span>
          <h2 id="incoming-call-title">Llamada entrante</h2>
          <p>{{ incoming.phone || 'Contacto de WhatsApp' }}</p>
          <div class="call-actions"><button type="button" class="call-reject" (click)="feature.rejectIncoming()">Rechazar</button><button type="button" class="call-accept" (click)="feature.acceptIncoming()">Contestar</button></div>
          @if (feature.status() === 'connecting') { <p class="call-note" role="status">Preparando el audio; puede tardar unos segundos…</p> }
        </section>
      </div>
    }
    @if (feature.active(); as call) {
      <div class="call-backdrop" role="presentation">
        <section class="call-card active-call" role="dialog" aria-modal="true" aria-labelledby="active-call-title">
          <span class="call-kicker">LLAMADA DE WHATSAPP</span>
          <h2 id="active-call-title">{{ feature.status() === 'active' ? 'Llamada activa' : 'Conectando…' }}</h2>
          <p>{{ feature.status() === 'active' ? formatTime(feature.elapsedSeconds()) : (call.direction === 'INBOUND' ? 'Llamada entrante' : 'Llamando al contacto') }}</p>
          @if (feature.error()) { <p class="call-error" role="alert">{{ feature.error() }}</p> }
          <div class="call-actions"><button type="button" class="call-mute" (click)="feature.toggleMute()">{{ feature.muted() ? 'Activar micrófono' : 'Silenciar' }}</button><button type="button" class="call-reject" (click)="feature.hangup()">Colgar</button></div>
          <audio autoplay [srcObject]="feature.remoteStream()"></audio>
        </section>
      </div>
    } @else if (feature.status() === 'error' && feature.error()) {
      <div class="call-backdrop" role="presentation"><section class="call-card" role="alertdialog" aria-modal="true" aria-labelledby="call-error-title"><h2 id="call-error-title">No se pudo establecer la llamada</h2><p class="call-error">{{ feature.error() }}</p><button type="button" class="call-mute" (click)="feature.error.set(''); feature.status.set('idle')">Cerrar</button></section></div>
    }
  `,
  styles: [`
    :host{display:contents}.call-backdrop{position:fixed;z-index:120;inset:0;display:grid;place-items:center;padding:18px;background:#10251d99;animation:call-fade 160ms ease-out}.call-card{width:min(100%,420px);padding:26px;border:1px solid var(--ui-border,#d9e2dc);border-radius:18px;color:var(--ui-text,#21372d);background:var(--ui-surface,#fffdf8);box-shadow:0 20px 60px #06150f40;text-align:center;animation:call-pop 180ms ease-out}.call-kicker{color:#748078;font-size:11px;font-weight:750;letter-spacing:.12em}.call-card h2{margin:8px 0;font-family:Georgia,"Times New Roman",serif;font-size:26px}.call-card p{color:var(--ui-text-secondary,#64726a);font-size:15px}.call-actions{display:flex;justify-content:center;gap:10px;margin-top:22px}.call-actions button,.call-card>button{min-height:44px;padding:10px 18px;border:1px solid transparent;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}.call-accept{color:white;background:#176b4e}.call-reject{color:white;background:#a4443c}.call-mute{color:var(--ui-text,#21372d);border-color:var(--ui-border,#d9e2dc)!important;background:var(--ui-raised,#f3f5f0)}.call-error{color:#9a3533!important}.call-note{font-size:13px!important}audio{display:none}@keyframes call-fade{from{opacity:0}to{opacity:1}}@keyframes call-pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.call-backdrop,.call-card{animation:none}}
  `]
})
export class CallHostComponent {
  protected readonly feature = inject(CallFeatureService);
  protected formatTime(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

  @HostListener('window:beforeunload', ['$event'])
  protected protectActiveCall(event: BeforeUnloadEvent): void {
    if (!this.feature.active() && !this.feature.incoming() && !this.feature.outgoingSetup()) return;
    event.preventDefault();
    event.returnValue = '';
  }
}
