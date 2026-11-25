import { Component, inject, input, signal } from '@angular/core';
import { CallFeatureService } from './call-feature.service';
import { ToastService } from './toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ui-call-button',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="call-controls" role="group" aria-label="Controles de llamadas">
      @if (feature.connectionStatus() === 'connecting') {
        <button type="button" class="call-button primary" disabled aria-label="Conectando llamadas"><span class="spinner" aria-hidden="true"></span><span>Conectando…</span></button>
      } @else if (feature.isConnectedFor(conversationId())) {
        <button type="button" class="call-button primary" [disabled]="!!feature.active() || !!feature.incoming() || busy()" (click)="start()" aria-label="Llamar al contacto">
          <ui-icon name="phone"/><span>{{ feature.active() || feature.incoming() ? 'En llamada' : busy() ? 'Preparando…' : 'Llamar' }}</span>
        </button>
        <button type="button" class="call-button secondary" [disabled]="!!feature.active() || !!feature.incoming()" (click)="disconnect()" aria-label="Desconectar llamadas" title="Desconectar llamadas">
          <ui-icon name="close"/><span>Desconectar</span>
        </button>
      } @else {
        <button type="button" class="call-button primary" [disabled]="!!feature.active() || !!feature.incoming() || busy()" (click)="connect()" aria-label="Conectar llamadas para esta conversación">
          <ui-icon name="phone"/><span>{{ feature.connectionStatus() === 'connected' ? 'Conectar aquí' : 'Conectar llamadas' }}</span>
        </button>
      }
      @if (feature.connectionStatus() === 'connected' && !feature.isConnectedFor(conversationId())) {
        <span class="connection-note" role="status">Conectado a otra conversación</span>
      }
    </div>
  `,
  styles: [`
    .call-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.call-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:8px 12px;border:1px solid var(--ui-border);border-radius:9px;color:var(--ui-text);background:var(--ui-raised);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:transform var(--motion-fast) var(--motion-ease),background var(--motion-base) var(--motion-ease),box-shadow var(--motion-base) var(--motion-ease)}
    .call-button:hover:not(:disabled){transform:translateY(-1px);box-shadow:var(--shadow-soft)}.call-button:active:not(:disabled){transform:translateY(1px)}.call-button:focus-visible{outline:3px solid var(--ui-focus,#b77c25);outline-offset:2px}.call-button:disabled{opacity:.62;cursor:not-allowed}.call-button.primary{color:var(--ui-on-brand,#fff);border-color:var(--brand-800,#176b4e);background:var(--brand-800,#176b4e)}.call-button.secondary{background:var(--ui-surface)}.connection-note{color:var(--ui-text-secondary);font-size:12px}
    .spinner{width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:call-spin 700ms linear infinite}@keyframes call-spin{to{transform:rotate(360deg)}}
    @media(max-width:540px){.call-controls{gap:6px}.call-button{min-height:42px;padding:8px 10px}.call-button span{white-space:nowrap}.connection-note{width:100%}}@media(prefers-reduced-motion:reduce){.call-button{transition:none}.spinner{animation:none;border-right-color:currentColor}}
  `]
})
export class CallButtonComponent {
  readonly conversationId = input.required<string>();
  protected readonly feature = inject(CallFeatureService);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);

  protected async connect(): Promise<void> {
    this.busy.set(true);
    const connected = await this.feature.connectCalls(this.conversationId());
    this.busy.set(false);
    if (connected) this.toast.show('Llamadas conectadas para esta conversación. Ya puedes recibir llamadas mientras el panel siga abierto.', 'success');
    else this.toast.show(this.feature.unavailableReason(), 'error');
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    try { await this.feature.startCall(this.conversationId()); }
    catch (error) { this.toast.show(error instanceof Error ? error.message : 'No se pudo iniciar la llamada.', 'error'); }
    finally { this.busy.set(false); }
  }

  protected disconnect(): void {
    this.feature.disconnectCalls();
    this.toast.show('Se desconectó la recepción de llamadas.', 'info');
  }
}
