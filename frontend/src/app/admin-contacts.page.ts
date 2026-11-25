import { Component, signal } from '@angular/core';

interface Contact {
  id: string;
  customName: string | null;
  phone: string;
  optOutAt: string | null;
  outcomeType: string | null;
  outcomeDueAt: string | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  attempts: { attempts: number; hasInbound: boolean };
  daysLate: number;
}

interface ContactsResponse {
  contacts: Contact[];
  tags: { id: string; name: string; color: string }[];
}

@Component({
  selector: 'app-admin-contacts-page',
  standalone: true,
  template: `
    @if (loading()) { <div class="contacts-loading">Cargando contactos…</div> }
    @else if (error()) { <section class="contacts-error" role="alert"><h1>No pudimos cargar los contactos</h1><p>{{ error() }}</p><a href="/panel/login">Iniciar sesión</a></section> }
    @else {
      <header class="contacts-heading"><div><p class="contacts-eyebrow">DIRECTORIO</p><h1>Contactos</h1><p>Administra la información y el estado de contacto de tu cartera.</p></div><a class="contacts-create" href="/panel/admin/contacts/new">＋ Nuevo contacto</a></header>
      <form class="contacts-filters" (submit)="$event.preventDefault(); load()">
        <input type="search" placeholder="Nombre o teléfono" [value]="search()" (input)="search.set(($any($event.target)).value)" aria-label="Buscar contactos">
        <select [value]="tagId()" (change)="tagId.set(($any($event.target)).value)" aria-label="Filtrar por etiqueta"><option value="">Todas las etiquetas</option>@for (tag of tags(); track tag.id) { <option [value]="tag.id">{{ tag.name }}</option> }</select>
        <select [value]="outcome()" (change)="outcome.set(($any($event.target)).value)" aria-label="Filtrar por resultado"><option value="">Todos los resultados</option><option value="NO_ANSWER">Sin contestación</option><option value="PROMISE">Promesa</option><option value="PAID">Pagado</option><option value="DISPUTED">Cuenta en disputa</option><option value="CONVENIO">Convenio</option><option value="REPORTED_PAYMENT">Pago reportado</option><option value="WRONG_NUMBER">Número inválido</option><option value="CALLBACK">Volver a llamar</option></select>
        <label><input type="checkbox" [checked]="optedOut()" (change)="optedOut.set(($any($event.target)).checked)"> Solo bajas</label>
        <label><input type="checkbox" [checked]="overdue()" (change)="overdue.set(($any($event.target)).checked)"> Promesas vencidas</label>
        <label><input type="checkbox" [checked]="withoutOutcome()" (change)="withoutOutcome.set(($any($event.target)).checked)"> Sin resultado</label>
        <label><input type="checkbox" [checked]="neverAnswered()" (change)="neverAnswered.set(($any($event.target)).checked)"> Nunca respondió</label>
        <label class="attempt-filter">Intentos mínimos <input type="number" min="1" max="99" [value]="minAttempts()" (input)="minAttempts.set(($any($event.target)).value)"></label>
        <button type="submit">Filtrar</button>
      </form>
      <section class="contacts-card"><header><h2>Contactos <span>{{ contacts().length }}</span></h2><a href="/panel/admin/contacts">Actualizar</a></header>
        @if (!contacts().length) { <div class="contacts-empty">No hay contactos que coincidan con estos filtros.</div> }
        @for (contact of contacts(); track contact.id) {
          <article class="contact-row"><div class="contact-identity"><span class="contact-avatar">{{ initials(contact.customName || contact.phone) }}</span><span><strong>{{ contact.customName || contact.phone }}</strong><small>{{ contact.phone }}</small></span></div>
            <div class="contact-meta"><span>{{ outcomeLabel(contact.outcomeType) }}</span>@if (contact.daysLate > 0) { <span class="contact-late">{{ contact.daysLate }} días vencido</span> }@if (contact.optOutAt) { <span class="contact-optout">BAJA</span> }</div>
            <div class="contact-tags">@for (item of contact.tags; track item.tag.id) { <span [style.border-color]="item.tag.color">{{ item.tag.name }}</span> }<small>{{ contact.attempts.attempts }} intentos</small></div>
            <div class="contact-actions">
              @if (!contact.optOutAt) {
                <form [action]="'/admin/conversations/from-contact/' + contact.id" method="post"><button type="submit" class="contact-start" title="Abrir conversación y enviar una plantilla aprobada">Iniciar conversación</button></form>
              }
              <a class="contact-edit" [href]="'/panel/admin/contacts/' + contact.id">Ver ficha</a>
            </div></article>
        }
      </section>
    }
  `,
  styleUrl: './admin-contacts.page.css'
})
export class AdminContactsPage {
  protected readonly contacts = signal<Contact[]>([]);
  protected readonly tags = signal<ContactsResponse['tags']>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly search = signal('');
  protected readonly tagId = signal('');
  protected readonly outcome = signal('');
  protected readonly optedOut = signal(false);
  protected readonly overdue = signal(false);
  protected readonly withoutOutcome = signal(false);
  protected readonly neverAnswered = signal(false);
  protected readonly minAttempts = signal('');

  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.search.set(params.get('search') || '');
    this.tagId.set(params.get('tagId') || '');
    this.outcome.set(params.get('resultado') || '');
    this.optedOut.set(params.get('bajas') === '1');
    this.overdue.set(params.get('vencidas') === '1');
    this.withoutOutcome.set(params.get('sinResultado') === '1');
    this.neverAnswered.set(params.get('nuncaRespondio') === '1');
    this.minAttempts.set(params.get('intentos') || '');
    void this.load();
  }

  protected initials(name: string): string { return name.trim().slice(0, 1).toUpperCase(); }
  protected outcomeLabel(value: string | null): string { return ({ PROMISE: 'Promesa de pago', PAID: 'Pagado', REPORTED_PAYMENT: 'Pago reportado', CONVENIO: 'Convenio', PROMISE_BROKEN: 'Promesa incumplida', NO_ANSWER: 'Sin contestación', WRONG_NUMBER: 'Número inválido', DISPUTED: 'Cuenta en disputa', NOT_INTERESTED: 'No le interesa', CALLBACK: 'Volver a llamar', OTHER: 'Otro' } as Record<string, string>)[value || ''] || 'Sin resultado'; }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const params = new URLSearchParams();
    if (this.search()) params.set('search', this.search());
    if (this.tagId()) params.set('tagId', this.tagId());
    if (this.outcome()) params.set('resultado', this.outcome());
    if (this.optedOut()) params.set('bajas', '1');
    if (this.overdue()) params.set('vencidas', '1');
    if (this.withoutOutcome()) params.set('sinResultado', '1');
    if (this.neverAnswered()) params.set('nuncaRespondio', '1');
    if (Number(this.minAttempts()) > 0) params.set('intentos', this.minAttempts());
    try {
      const response = await fetch(`/admin/contacts?${params}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció o no tienes permiso para consultar contactos.');
      const result = await response.json() as ContactsResponse;
      this.contacts.set(result.contacts);
      this.tags.set(result.tags);
      window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally { this.loading.set(false); }
  }
}
