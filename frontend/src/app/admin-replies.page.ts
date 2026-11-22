import { Component, signal } from '@angular/core';

interface ReplyRule { id: string; replyId: string; replyTitle: string | null; outcomeType: string; effect: string; note: string | null; isActive: boolean }
interface RepliesResponse { rules: ReplyRule[]; outcomeTypes: string[]; outcomeLabels: Record<string, string>; effects: string[]; effectLabels: Record<string, string> }

@Component({
  selector: 'app-admin-replies-page', standalone: true,
  template: `
    @if (loading()) { <div class="reply-loading">Cargando reglas…</div> }
    @else if (error() && !data()) { <section class="reply-error"><h1>No pudimos cargar las reglas</h1><p>{{ error() }}</p><a href="/panel/admin/dashboard">Volver al panel</a></section> }
    @else if (data(); as model) {
      <header class="reply-heading"><div><p class="reply-eyebrow">COBRANZA</p><h1>Botones y listas</h1><p>Define cómo se registra cada respuesta estructurada que toca un cliente.</p></div></header>
      @if (error()) { <div class="reply-alert" role="alert">{{ error() }}</div> } @if (success()) { <div class="reply-success">{{ success() }}</div> }
      <section class="reply-guide"><h2>Qué hacen las reglas recomendadas</h2><ul><li><strong>«Ya pagué»</strong> se registra como pago reportado, pendiente de confirmar.</li><li><strong>«No reconozco la deuda»</strong> pausa la cuenta para que el equipo la revise.</li><li><strong>«No quiero ser contactado»</strong> marca la baja y detiene los mensajes.</li></ul><button type="button" (click)="createRecommended()" [disabled]="saving()">Crear reglas recomendadas</button><small>Agrega las que faltan sin reemplazar tus ajustes actuales.</small></section>
      <section class="reply-card"><header><h2>Reglas configuradas <span>{{ model.rules.length }}</span></h2><button type="button" (click)="load()">Actualizar</button></header>
        @if (!model.rules.length) { <div class="reply-empty">Todavía no hay reglas. Crea las recomendadas y ajústalas.</div> }
        @for (rule of model.rules; track rule.id) { <article class="reply-row" [class.inactive]="!rule.isActive"><div class="reply-id"><code>{{ rule.replyId }}</code>@if (!rule.isActive) { <small>Inactiva</small> }</div><div>{{ rule.replyTitle || '—' }}</div><div><span class="reply-outcome">{{ model.outcomeLabels[rule.outcomeType] || rule.outcomeType }}</span></div><div class="reply-effect">{{ model.effectLabels[rule.effect] || rule.effect }}</div><div class="reply-actions"><button type="button" (click)="toggle(rule)">{{ rule.isActive ? 'Desactivar' : 'Activar' }}</button><button type="button" class="delete-action" (click)="remove(rule)">Eliminar</button></div></article> }
      </section>
      <form class="reply-editor" (submit)="save($event)"><h2>Agregar o corregir una regla</h2><p>Si el identificador ya existe, se actualizará. El texto sirve como respaldo cuando Meta no devuelve el identificador.</p><div class="reply-fields"><label>Identificador<input name="replyId" required maxlength="100" placeholder="YA_PAGUE" [value]="replyId()" (input)="replyId.set(($any($event.target)).value)"></label><label>Texto del botón<input name="replyTitle" maxlength="250" placeholder="Ya pagué" [value]="replyTitle()" (input)="replyTitle.set(($any($event.target)).value)"></label><label>Resultado<select name="outcomeType" [value]="outcomeType()" (change)="outcomeType.set(($any($event.target)).value)">@for (type of model.outcomeTypes; track type) { <option [value]="type">{{ model.outcomeLabels[type] }}</option> }</select></label><label>Efecto automático<select name="effect" [value]="effect()" (change)="effect.set(($any($event.target)).value)">@for (effect of model.effects; track effect) { <option [value]="effect">{{ model.effectLabels[effect] }}</option> }</select></label><label class="wide-field">Nota para el historial<input name="note" maxlength="500" placeholder="Nota opcional" [value]="note()" (input)="note.set(($any($event.target)).value)"></label></div><button class="reply-save" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar regla' }}</button></form>
    }
  `,
  styleUrl: './admin-replies.page.css'
})
export class AdminRepliesPage {
  protected readonly data = signal<RepliesResponse | null>(null); protected readonly loading = signal(true); protected readonly saving = signal(false);
  protected readonly error = signal(''); protected readonly success = signal(''); protected readonly replyId = signal(''); protected readonly replyTitle = signal('');
  protected readonly outcomeType = signal('REPORTED_PAYMENT'); protected readonly effect = signal('NONE'); protected readonly note = signal('');
  constructor() { void this.load(); }
  protected async load(): Promise<void> { this.loading.set(true); this.error.set(''); try { const response = await fetch('/admin/replies', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Este módulo está desactivado para el perfil actual o tu sesión venció.'); this.data.set(await response.json() as RepliesResponse); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
  protected async save(event: Event): Promise<void> { event.preventDefault(); await this.post('/admin/replies', { replyId: this.replyId(), replyTitle: this.replyTitle(), outcomeType: this.outcomeType(), effect: this.effect(), note: this.note() }, 'Regla guardada.'); if (!this.error()) { this.replyId.set(''); this.replyTitle.set(''); this.note.set(''); } }
  protected async createRecommended(): Promise<void> { await this.post('/admin/replies/recommended', {}, 'Reglas recomendadas agregadas.'); }
  protected async toggle(rule: ReplyRule): Promise<void> { await this.post(`/admin/replies/${encodeURIComponent(rule.id)}/active`, { isActive: !rule.isActive }, rule.isActive ? 'Regla desactivada.' : 'Regla activada.'); }
  protected async remove(rule: ReplyRule): Promise<void> { if (!window.confirm(`¿Eliminar la regla «${rule.replyId}»? Sus respuestas dejarán de registrarse automáticamente.`)) return; await this.post(`/admin/replies/${encodeURIComponent(rule.id)}/delete`, {}, 'Regla eliminada.'); }
  private async post(url: string, values: Record<string, string | boolean>, message: string): Promise<void> { this.saving.set(true); this.error.set(''); this.success.set(''); try { const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo guardar el cambio.'); this.success.set(message); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); } }
}
