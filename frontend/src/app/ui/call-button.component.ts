import { Component, inject, input, OnInit, signal } from '@angular/core';
import { CallFeatureService } from './call-feature.service';
import { ToastService } from './toast.service';
import { IconComponent } from './icon.component';
type CallState='enabled'|'disabled'|'loading'|'permission-required';
@Component({
  selector: 'ui-call-button',
  standalone: true,
  imports: [IconComponent],
  template: `<button type="button" class="call-button" [disabled]="state()==='loading'" (click)="start()" [attr.aria-label]="label()" [title]="label()"><ui-icon name="phone"/><span>{{ state()==='loading' ? 'Conectando' : 'Llamar' }}</span></button>`,
  styles: [`
    .call-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:8px 13px;border:1px solid var(--ui-border);border-radius:9px;color:var(--ui-text);background:var(--ui-raised);font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:transform var(--motion-fast) var(--motion-ease),background var(--motion-base) var(--motion-ease)}
    .call-button:hover{transform:translateY(-1px);background:var(--ui-surface)}.call-button:active{transform:translateY(1px)}.call-button:disabled{opacity:.65;cursor:wait}
    @media(max-width:540px){.call-button{min-height:40px;padding:8px 10px}.call-button span{display:none}}
  `]
})
export class CallButtonComponent implements OnInit {
  readonly conversationId=input.required<string>();
  private readonly feature=inject(CallFeatureService);
  private readonly toast=inject(ToastService);
  readonly state=signal<CallState>('loading');
  label(): string {
    if (this.state() === 'enabled') return 'Llamar al contacto';
    if (this.state() === 'loading') return 'Conectando con el servicio de llamadas';
    return this.feature.unavailableReason() || 'Llamadas no disponibles';
  }
  ngOnInit(): void {
    void this.feature.prepare(this.conversationId()).then((available) => this.state.set(available ? 'enabled' : 'disabled'));
  }
  async start():Promise<void>{
    if(this.state()==='disabled'){this.toast.show(this.feature.unavailableReason(),'info');return;}
    this.state.set('loading');
    try { await this.feature.startCall(this.conversationId()); this.state.set('enabled'); }
    catch (error) { this.state.set('permission-required'); this.toast.show(error instanceof Error?error.message:'No se pudo iniciar la llamada.','error'); }
  }
}
