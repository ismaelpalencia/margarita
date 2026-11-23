import { Component, signal } from '@angular/core';

interface LeadRow { id: string; contactId: string | null; conversationId: string | null; name: string | null; phone: string | null; email: string | null; interest: string | null; notes: string | null; fields: Record<string, unknown> | null; source: string; status: string; webhookSentAt: string | null; webhookFailedAt: string | null; webhookAttempts: number; createdAt: string }
interface LeadContact { id: string; profileName: string | null; customName: string | null; phone: string; conversationId: string | null; hasLead: boolean }
interface LeadsData { leads: LeadRow[]; statuses: string[]; currentStatus: string; settings: { leadsEnabled: boolean; leadWebhookUrl: string; hasWebhookSecret: boolean; leadSheetsWebhookUrl: string; hasSheetsSecret: boolean }; contacts: LeadContact[]; csvColumns: string[] }
const csvLabels: Record<string, string> = { nombre: 'Nombre', telefono: 'Teléfono', email: 'Correo', interes: 'Interés', notas: 'Comentarios', origen: 'Origen', estado: 'Estado', creado: 'Creado', id: 'ID' };
type LeadColumn = 'name' | 'phone' | 'email' | 'interest' | 'notes' | 'fields' | 'status' | 'webhook';
const leadColumns: Array<{ key: LeadColumn; label: string }> = [
  { key: 'name', label: 'Nombre' }, { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Correo' }, { key: 'interest', label: 'Interés' },
  { key: 'notes', label: 'Comentarios' }, { key: 'fields', label: 'Datos del flujo' },
  { key: 'status', label: 'Estado' }, { key: 'webhook', label: 'Webhook' },
];
const leadColumnsStorageKey = 'margarita-leads-columns';
type LeadColumnVisibility = Record<LeadColumn, boolean>;
const defaultLeadColumnVisibility: LeadColumnVisibility = {
  name: true, phone: true, email: true, interest: true, notes: true, fields: true, status: true, webhook: true,
};

@Component({
  selector: 'app-admin-leads-page', standalone: true,
  template: `
    @if (loading()) { <p class="leads-loading">Cargando leads…</p> }
    @else if (error()) { <p class="leads-notice error" role="alert">{{ error() }}</p> }
    @else if (data(); as model) {
      <header class="leads-heading"><div><p>OPERACIÓN</p><h1>Leads</h1><span>Contactos capturados con nombre y teléfono; correo, interés y datos del flujo son opcionales. Los datos sensibles se guardan cifrados.</span></div><div class="leads-header-actions">
        <details><summary>Columnas</summary><form class="lead-columns-form" aria-label="Columnas visibles"><b>Columnas de la tabla</b>@for (column of leadColumns; track column.key) { <label class="lead-column-option"><input type="checkbox" [checked]="leadColumnVisible(column.key)" (change)="toggleLeadColumn(column.key, $event)"> {{ column.label }}</label> }<small>Acciones siempre visible.</small></form></details>
        <details><summary>Exportar CSV</summary><form action="/admin/leads/export" method="get"><b>Columnas</b><div class="csv-options">@for (column of model.csvColumns; track column) { <label><input type="checkbox" name="columns" [value]="column" [checked]="column !== 'id'"> {{ csvLabel(column) }}</label> }</div><label class="csv-fields"><input type="checkbox" name="fields" value="1"> Incluir campos capturados por el flujo (dato_*)</label><button>Descargar CSV</button></form></details>
        <details><summary class="delete-all-summary">Borrar todos</summary><form action="/admin/leads/delete-all" method="post" (submit)="confirmDeleteAll($event)"><b>Borrar todos los leads</b><p>Se conservan contactos y conversaciones. Las filas ya escritas en Google Sheets no se borran.</p><label>Escribe BORRAR para confirmar<input name="confirm" required autocomplete="off"></label><button>Borrar todos los leads</button></form></details>
      </div></header>
      @if (notice()) { <p class="leads-notice" role="status">{{ notice() }}</p> }
      <section class="leads-card"><h2>Configuración</h2><form action="/admin/leads/settings" method="post" class="leads-settings"><label class="lead-check"><input type="checkbox" name="leadsEnabled" value="true" [checked]="model.settings.leadsEnabled"><span><b>Activar captura de leads</b><small>Cuando un mensaje incluye un correo, se crea el lead automáticamente.</small></span></label><label>URL del webhook (opcional)<input name="leadWebhookUrl" [value]="model.settings.leadWebhookUrl" placeholder="https://tu-crm.com/webhooks/leads"></label><label>Secreto de firma (opcional)<input type="password" name="leadWebhookSecret" autocomplete="new-password" [placeholder]="model.settings.hasWebhookSecret ? 'Ya configurado; vacío para conservar' : 'Opcional'"><small>Se envía la cabecera x-margarita-signature con HMAC-SHA256.</small></label><div class="sheets-config"><b>Google Sheets (opcional)</b><p>Pega la URL del Web App de Google Apps Script. Cada lead nuevo se agrega como una fila.</p><label>URL del Web App<input name="leadSheetsWebhookUrl" [value]="model.settings.leadSheetsWebhookUrl" placeholder="https://script.google.com/macros/s/.../exec"></label><label>Secreto de la hoja<input type="password" name="leadSheetsWebhookSecret" autocomplete="new-password" [placeholder]="model.settings.hasSheetsSecret ? 'Ya configurado; vacío para conservar' : 'Opcional'"></label></div><button>Guardar configuración</button></form></section>
      <section class="leads-card"><h2>Agregar lead</h2><form action="/admin/leads" method="post" class="lead-create"><label class="contact-select">Desde un contacto del chat<select name="contactId" (change)="selectContact($event)"><option value="">— Escribir datos manualmente —</option>@for (contact of model.contacts; track contact.id) { <option [value]="contact.id" [disabled]="contact.hasLead">{{ contact.customName || contact.profileName || contact.phone }} · {{ contact.phone }}{{ contact.hasLead ? ' (ya tiene lead)' : '' }}</option> }</select><small>Elige un contacto con conversación para evitar capturarlo de nuevo.</small></label><label>Nombre<input name="name" required [value]="createName()" (input)="createName.set(value($event))" placeholder="Nombre"></label><label>Teléfono<input name="phone" required [value]="createPhone()" (input)="createPhone.set(value($event))" placeholder="Teléfono"></label><label>Correo<input type="email" name="email" placeholder="Opcional"></label><label>Interés<input name="interest" placeholder="Interés"></label><label class="lead-notes">Comentarios<textarea name="notes" rows="3" maxlength="4000" placeholder="Qué dijo, qué necesita, mejor horario…"></textarea></label><button>Guardar lead</button></form></section>
      <section class="leads-card lead-table-card">
        <nav class="lead-status-filter"><a [href]="'/panel/admin/leads'" [class.selected]="model.currentStatus === 'ALL'">Todos</a>@for (status of model.statuses; track status) { <a [href]="'/panel/admin/leads?status=' + status" [class.selected]="model.currentStatus === status">{{ status }}</a> }</nav>
        <div class="leads-table-wrap"><table><thead><tr>
          @for (column of leadColumns; track column.key) { <th [attr.data-lead-column]="column.key" [hidden]="!leadColumnVisible(column.key)">{{ column.label }}</th> }
          <th data-lead-column="actions">Acciones</th>
        </tr></thead><tbody>
          @for (lead of model.leads; track lead.id) { <tr>
            <td data-lead-column="name" [hidden]="!leadColumnVisible('name')">{{ lead.name || '—' }}</td>
            <td data-lead-column="phone" [hidden]="!leadColumnVisible('phone')">{{ lead.phone || '—' }}</td>
            <td data-lead-column="email" [hidden]="!leadColumnVisible('email')">{{ lead.email || '—' }}</td>
            <td data-lead-column="interest" [hidden]="!leadColumnVisible('interest')">{{ lead.interest || '—' }}</td>
            <td data-lead-column="notes" [hidden]="!leadColumnVisible('notes')" class="lead-notes-cell" [title]="lead.notes || ''">{{ lead.notes || '—' }}</td>
            <td data-lead-column="fields" [hidden]="!leadColumnVisible('fields')">@if (lead.fields && Object.keys(lead.fields).length) { <details><summary>Ver datos</summary><div class="lead-fields">@for (entry of entries(lead.fields); track entry[0]) { <p><b>{{ entry[0] }}:</b> {{ pretty(entry[1]) }}</p> }</div></details> } @else { — }</td>
            <td data-lead-column="status" [hidden]="!leadColumnVisible('status')"><form [action]="'/admin/leads/' + lead.id + '/status'" method="post" class="status-form"><select name="status">@for (status of model.statuses; track status) { <option [value]="status" [selected]="lead.status === status">{{ status }}</option> }</select><button>Guardar</button></form></td>
            <td data-lead-column="webhook" [hidden]="!leadColumnVisible('webhook')" [class.webhook-failed]="!!lead.webhookFailedAt" [class.webhook-sent]="!!lead.webhookSentAt">{{ lead.webhookFailedAt ? 'Falló' : lead.webhookSentAt ? 'Entregado' : 'Pendiente' }}</td>
            <td data-lead-column="actions"><div class="lead-actions">@if (lead.webhookFailedAt) { <form [action]="'/admin/leads/' + lead.id + '/retry'" method="post"><button class="retry-button">Reintentar</button></form> }<form [action]="'/admin/leads/' + lead.id + '/delete'" method="post" (submit)="confirmDelete($event)"><button class="remove-button">Eliminar</button></form></div></td>
          </tr> } @empty { <tr><td [attr.colspan]="visibleLeadColumnCount() + 1" class="leads-empty">Sin leads todavía.</td></tr> }
        </tbody></table></div>
      </section>
    }
  `,
  styleUrl: './admin-leads.page.css'
})
export class AdminLeadsPage {
  protected readonly Object = Object;
  protected readonly leadColumns = leadColumns;
  protected readonly columnVisibility = signal<LeadColumnVisibility>(this.readLeadColumnVisibility());
  protected readonly data = signal<LeadsData | null>(null); protected readonly loading = signal(true); protected readonly error = signal(''); protected readonly notice = signal(''); protected readonly createName = signal(''); protected readonly createPhone = signal('');
  constructor() { void this.load(); }
  protected leadColumnVisible(column: LeadColumn): boolean { return this.columnVisibility()[column]; }
  protected visibleLeadColumnCount(): number { return leadColumns.filter(({ key }) => this.leadColumnVisible(key)).length; }
  protected toggleLeadColumn(column: LeadColumn, event: Event): void {
    const visible = (event.target as HTMLInputElement).checked;
    const next = { ...this.columnVisibility(), [column]: visible };
    this.columnVisibility.set(next);
    try { localStorage.setItem(leadColumnsStorageKey, JSON.stringify(next)); } catch { /* La selección funciona hasta cerrar esta página. */ }
  }
  private readLeadColumnVisibility(): LeadColumnVisibility {
    try {
      const saved = localStorage.getItem(leadColumnsStorageKey);
      if (!saved) return { ...defaultLeadColumnVisibility };
      const parsed = JSON.parse(saved) as Partial<LeadColumnVisibility>;
      return Object.fromEntries(leadColumns.map(({ key }) => [key, typeof parsed[key] === 'boolean' ? parsed[key] : true])) as LeadColumnVisibility;
    } catch { return { ...defaultLeadColumnVisibility }; }
  }
  protected csvLabel(column: string): string { return csvLabels[column] || column; }
  protected entries(value: Record<string, unknown>): Array<[string, unknown]> { return Object.entries(value); }
  protected pretty(value: unknown): string { if (typeof value === 'string') return value; try { return JSON.stringify(value); } catch { return String(value); } }
  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected selectContact(event: Event): void { const id = (event.target as HTMLSelectElement).value; const contact = this.data()?.contacts.find((item) => item.id === id); if (contact) { this.createName.set(contact.customName || contact.profileName || contact.phone); this.createPhone.set(contact.phone); } else { this.createName.set(''); this.createPhone.set(''); } }
  protected confirmDelete(event: Event): void { if (!window.confirm('¿Eliminar este lead? El contacto y su conversación se conservan.')) event.preventDefault(); }
  protected confirmDeleteAll(event: Event): void { if (!window.confirm('Se eliminarán todos los leads de esta empresa. Los contactos y las conversaciones se conservan. ¿Continuar?')) event.preventDefault(); }
  private async load(): Promise<void> { try { const query = new URLSearchParams(window.location.search); const status = query.get('status'); const response = await fetch(`/admin/leads${status ? `?status=${encodeURIComponent(status)}` : ''}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as LeadsData; if (!response.ok) throw new Error('No se pudieron cargar los leads.'); this.data.set(result); const success = query.get('success'); const count = query.get('count'); if (success) this.notice.set(success === 'settings' ? 'Configuración de leads guardada.' : success === 'created' ? 'Lead guardado.' : success === 'status' ? 'Estado actualizado.' : success === 'retry' ? 'Reintento enviado.' : success === 'deleted_all' ? `Se eliminaron ${count || 0} leads. Los contactos y conversaciones se conservan.` : 'Lead eliminado.'); const failure = query.get('error'); if (failure) this.error.set(failure === 'name_phone' ? 'El nombre y el teléfono son obligatorios.' : failure === 'lead_exists' ? 'Ese contacto ya tiene un lead registrado.' : failure === 'contact' ? 'El contacto ya no existe.' : failure === 'delete_all_confirm' ? 'Para borrar todos los leads escribe BORRAR.' : 'No se pudo completar la acción.'); } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'Error inesperado.'); } finally { this.loading.set(false); } }
}
