import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

interface ContactDetail {
  id: string; customName: string | null; profileName: string | null; phone: string; notes: string | null;
  optOutAt: string | null; optOutSource: string | null; optInAt: string | null; optInSource: string | null;
  optInRecordedBy: { name: string } | null; pausedAt: string | null; pausedReason: string | null;
  outcomeType: string | null; outcomeAmount: string | number | null; outcomeDueAt: string | null; outcomePaidAt: string | null;
  tags: { tagId: string; tag: { id: string; name: string; color: string } }[];
}
interface DetailResponse {
  contact: ContactDetail; tags: { id: string; name: string; color: string }[];
  history: { id: string; type: string; amount: string | number | null; dueAt: string | null; paidAt: string | null; note: string | null; userName: string | null; source: string; createdAt: string }[];
  attempts: { attempts: number; hasInbound: boolean }; outcomeTypes: string[]; outcomeLabels: Record<string, string>;
  daysLate: number; collectionsEnabled: boolean;
}

@Component({
  selector: 'app-admin-contact-detail-page', standalone: true,
  template: `
    @if (loading()) { <div class="detail-loading">Cargando ficha…</div> }
    @else if (error()) { <section class="detail-error" role="alert"><h1>No pudimos abrir el contacto</h1><p>{{ error() }}</p><a href="/panel/admin/contacts">Volver a contactos</a></section> }
    @else if (data(); as result) {
      <header class="detail-heading"><a href="/panel/admin/contacts">← Contactos</a><div><p class="detail-eyebrow">FICHA DE CONTACTO</p><h1>{{ result.contact.customName || result.contact.profileName || result.contact.phone }}</h1><p>{{ result.contact.phone }}</p></div><button class="deactivate-button" (click)="deactivate()">Archivar</button></header>
      <div class="detail-grid">
        <main class="detail-main">
          <section class="detail-card"><h2>Información</h2><label>Nombre personalizado<input [value]="name()" (input)="name.set(($any($event.target)).value)"></label><label>Notas<textarea rows="4" [value]="notes()" (input)="notes.set(($any($event.target)).value)"></textarea></label><fieldset><legend>Etiquetas</legend><div class="detail-tags">@for (tag of result.tags; track tag.id) { <label><input type="checkbox" [checked]="selectedTags().has(tag.id)" (change)="toggleTag(tag.id, $event)"><span [style.border-color]="tag.color">{{ tag.name }}</span></label> } @empty { <small>No hay etiquetas configuradas.</small> }</div></fieldset><button class="primary-button" (click)="save()" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button></section>
          @if (result.collectionsEnabled) {
            <section class="detail-card"><h2>Resultado de gestión</h2><p class="detail-summary">{{ result.outcomeLabels[result.contact.outcomeType || ''] || 'Sin resultado' }} · {{ result.attempts.attempts }} intento{{ result.attempts.attempts === 1 ? '' : 's' }}{{ result.attempts.hasInbound ? '' : ' · Nunca ha respondido' }}</p>@if (result.daysLate > 0) { <p class="detail-late">Promesa vencida: {{ result.daysLate }} días de atraso</p> }
              <form class="outcome-form" (submit)="markOutcome($event)"><label>Resultado<select name="type"><option value="">Selecciona…</option>@for (type of result.outcomeTypes; track type) { <option [value]="type">{{ result.outcomeLabels[type] }}</option> }</select></label><div class="outcome-fields"><label>Monto<input name="amount" inputmode="decimal" placeholder="1250.00"></label><label>Fecha compromiso<input name="dueDate" type="date"></label><label>Fecha de pago<input name="paidDate" type="date"></label></div><input name="note" placeholder="Nota de la gestión (opcional)"><p>Promesas y convenios necesitan fecha compromiso.</p><button class="primary-button" [disabled]="saving()">Guardar resultado</button></form>
              @if (result.history.length) { <h3>Historial</h3><div class="history-list">@for (item of result.history; track item.id) { <article><strong>{{ result.outcomeLabels[item.type] || item.type }}</strong>@if (item.amount) { <span>{{ item.amount }}</span> }<time>{{ dateLabel(item.createdAt) }} · {{ item.userName || 'Sistema' }}</time>@if (item.note) { <p>{{ item.note }}</p> }</article> }</div> }
            </section>
          }
        </main>
        <aside class="detail-side">
          <section class="detail-card"><h2>Consentimiento</h2>@if (result.contact.optOutAt) { <p class="detail-danger">Pidió la baja. No recibe mensajes ni campañas.</p><button class="primary-button" (click)="action('opt-in', { source: 'REACTIVACION' }, '¿Confirmas que autorizó de nuevo?')">Registrar nueva autorización</button> } @else { @if (result.contact.optInAt) { <p>Autorización registrada {{ dateLabel(result.contact.optInAt) }} por {{ result.contact.optInRecordedBy?.name || 'el equipo' }}.</p> } @else { <p>Sin autorización registrada. Registra solo un consentimiento confirmado.</p><select #source><option value="FORMULARIO">Formulario o contrato firmado</option><option value="WHATSAPP">Por WhatsApp</option><option value="LLAMADA">Por teléfono</option><option value="IMPORTACION">En cartera importada</option><option value="OTRO">Otro</option></select><button class="primary-button" (click)="action('opt-in', { source: source.value })">Registrar consentimiento</button> }<button class="secondary-button" (click)="action('opt-out', {}, '¿Marcar la baja? Dejará de recibir mensajes y campañas.')">Marcar baja</button> }</section>
          <section class="detail-card"><h2>Pausa</h2>@if (result.contact.pausedAt) { <p class="detail-warning">En pausa: {{ result.contact.pausedReason || 'Sin motivo registrado' }}. No recibe mensajes ni campañas.</p><button class="primary-button" (click)="action('resume', {}, '¿Quitar la pausa?')">Quitar pausa</button> } @else { <p>Detiene temporalmente los mensajes y campañas mientras se revisa el caso.</p><input #reason placeholder="Motivo de la pausa"><button class="secondary-button" (click)="action('pause', { reason: reason.value })">Pausar contacto</button> }</section>
        </aside>
      </div>
    }
  `,
  styleUrl: './admin-contact-detail.page.css'
})
export class AdminContactDetailPage {
  protected readonly data = signal<DetailResponse | null>(null);
  protected readonly loading = signal(true); protected readonly error = signal(''); protected readonly saving = signal(false);
  protected readonly name = signal(''); protected readonly notes = signal(''); protected readonly selectedTags = signal(new Set<string>());
  private readonly id: string;
  constructor(route: ActivatedRoute, private readonly router: Router) { this.id = route.snapshot.paramMap.get('id') || ''; void this.load(); }
  protected toggleTag(id: string, event: Event): void { const next = new Set(this.selectedTags()); if ((event.target as HTMLInputElement).checked) next.add(id); else next.delete(id); this.selectedTags.set(next); }
  protected dateLabel(value: string): string { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value)); }
  protected async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { const response = await fetch(`/admin/contacts/${encodeURIComponent(this.id)}/edit`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || 'No tienes acceso a este contacto.'); } const result = await response.json() as DetailResponse; this.data.set(result); this.name.set(result.contact.customName || ''); this.notes.set(result.contact.notes || ''); this.selectedTags.set(new Set(result.contact.tags.map((item) => item.tagId))); }
    catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); }
  }
  protected async save(): Promise<void> { await this.run(async () => { const response = await fetch(`/admin/contacts/${encodeURIComponent(this.id)}`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ customName: this.name(), notes: this.notes(), tagIds: [...this.selectedTags()] }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || 'No se pudo guardar.'); }); }
  protected async action(path: string, values: Record<string, string>, confirmText?: string): Promise<void> { if (confirmText && !window.confirm(confirmText)) return; await this.run(async () => { const body = new URLSearchParams({ ...values, redirectTo: `/panel/admin/contacts/${this.id}` }); const response = await fetch(`/admin/contacts/${encodeURIComponent(this.id)}/${path}`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body }); const result = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo completar la acción.'); }); }
  protected async markOutcome(event: Event): Promise<void> { event.preventDefault(); const form = event.target as HTMLFormElement; const formData = new FormData(form); const body = new URLSearchParams(); for (const [key, value] of formData.entries()) body.set(key, String(value)); await this.run(async () => { const response = await fetch(`/admin/contacts/${encodeURIComponent(this.id)}/outcome`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body }); const result = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo guardar el resultado.'); form.reset(); }); }
  protected async deactivate(): Promise<void> { if (!window.confirm('¿Archivar este contacto?')) return; await this.run(async () => { const response = await fetch(`/admin/contacts/${encodeURIComponent(this.id)}/deactivate`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error('No se pudo archivar el contacto.'); await this.router.navigateByUrl('/panel/admin/contacts'); }); }
  private async run(action: () => Promise<void>): Promise<void> { this.saving.set(true); this.error.set(''); try { await action(); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); } }
}
