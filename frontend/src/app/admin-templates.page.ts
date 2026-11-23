import { Component, signal } from '@angular/core';

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  metaTemplateId: string | null;
  lastSyncedAt: string | null;
  hasVariablesOrUrl: boolean;
}

interface TemplatesResponse {
  templates: MetaTemplate[];
  syncResult: number | null;
  syncError: boolean;
}

@Component({
  selector: 'app-admin-templates-page',
  standalone: true,
  template: `
    @if (loading()) {
      <p class="templates-loading">Cargando plantillas de Meta…</p>
    } @else if (!data()) {
      <section class="templates-error" role="alert">
        <h1>No pudimos cargar tus plantillas</h1>
        <p>{{ error() }}</p>
      </section>
    } @else {
      <header class="templates-heading">
        <div><p>WHATSAPP BUSINESS</p><h1>Plantillas de Meta</h1>
          <span>Consulta, crea y sincroniza plantillas de tu cuenta de WhatsApp Business.</span>
        </div>
        <div class="templates-header-actions">
          <details class="template-create">
            <summary>Nueva plantilla</summary>
            <form (submit)="createTemplate($event)" class="template-create-form">
              <b>Crear plantilla</b>
              <label>Nombre<input name="name" required maxlength="512" pattern="[a-z0-9_]+" placeholder="aviso_pago"></label>
              <label>Idioma<input name="language" required maxlength="5" placeholder="es_MX"></label>
              <label>Categoría<select name="category"><option value="UTILITY">UTILITY</option><option value="MARKETING">MARKETING</option></select></label>
              <label>Encabezado (opcional)<input name="header" maxlength="60" placeholder="Margarita"></label>
              <label>Cuerpo<textarea name="body" required maxlength="1024" rows="4" placeholder="Hola {{1}}, tu pago está listo."></textarea></label>
              <label>Pie (opcional)<input name="footer" maxlength="60" placeholder="No responder a este mensaje"></label>
              <button type="submit" [disabled]="creating()">{{ creating() ? 'Creando…' : 'Crear en Meta' }}</button>
            </form>
          </details>
          <button type="button" (click)="sync()" [disabled]="syncing()">
            {{ syncing() ? 'Sincronizando…' : 'Sincronizar desde Meta' }}
          </button>
        </div>
      </header>
      @if (success()) { <p class="templates-success" role="status">{{ success() }}</p> }
      @if (error()) { <p class="templates-error-banner" role="alert">{{ error() }}</p> }
      <section class="templates-card" aria-labelledby="meta-templates-title">
        <div class="templates-card-heading">
          <div><h2 id="meta-templates-title">Plantillas de tu cuenta</h2>
            <p>El estado se actualiza al sincronizar con Meta.</p>
          </div>
          <span>{{ data()?.templates?.length || 0 }} plantilla(s)</span>
        </div>
        <div class="templates-table-wrap">
          <table><thead><tr><th>Nombre</th><th>Idioma</th><th>Categoría</th><th>Estado en Meta</th><th>Última sincronización</th><th></th></tr></thead>
            <tbody>
              @if (!data()?.templates?.length) {
                <tr><td colspan="6" class="templates-empty">No hay plantillas sincronizadas. Adminístralas en Meta y pulsa “Sincronizar desde Meta”.</td></tr>
              }
              @for (template of data()?.templates || []; track template.id) {
                <tr>
                  <td><strong>{{ template.name }}</strong>@if (template.metaTemplateId) { <small>ID: {{ template.metaTemplateId }}</small> }</td>
                  <td>{{ template.language }}</td>
                  <td>{{ template.category || '—' }}@if (template.hasVariablesOrUrl) { <small class="template-chip">Variables o botón URL</small> }</td>
                  <td><span [class]="'template-status ' + template.status.toLowerCase()">{{ statusLabel(template.status) }}</span></td>
                  <td>{{ template.lastSyncedAt ? dateLabel(template.lastSyncedAt) : '—' }}</td>
                  <td><button type="button" class="template-delete" (click)="removeTemplate(template)">Eliminar</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styleUrl: './admin-templates.page.css'
})
export class AdminTemplatesPage {
  protected readonly data = signal<TemplatesResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly syncing = signal(false);
  protected readonly creating = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  constructor() {
    void this.load();
  }

  protected statusLabel(status: string): string {
    return ({ APPROVED: 'Aprobada', REJECTED: 'Rechazada', PENDING: 'Pendiente', PAUSED: 'Pausada', DISABLED: 'Deshabilitada' } as Record<string, string>)[status] || status;
  }

  protected dateLabel(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await fetch('/admin/templates', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error('La sesión venció o no tienes permiso para consultar las plantillas.');
      }
      const result = await response.json() as TemplatesResponse;
      if (!Array.isArray(result.templates)) throw new Error('La respuesta de plantillas no tiene el formato esperado.');
      this.data.set(result);
      if (result.syncResult !== null) this.success.set(`Plantillas sincronizadas desde Meta: ${result.syncResult}.`);
      if (result.syncError) this.error.set('No se pudieron sincronizar las plantillas. Revisa la conexión de WhatsApp.');
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async createTemplate(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const values = new FormData(form);
    this.creating.set(true);
    this.error.set('');
    this.success.set('');

    try {
      const response = await fetch('/admin/templates', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: values.get('name'),
          language: values.get('language'),
          category: values.get('category'),
          header: values.get('header'),
          body: values.get('body'),
          footer: values.get('footer')
        })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || 'No se pudo crear la plantilla.');
      }

      this.success.set('Plantilla creada en Meta. Queda pendiente de aprobación.');
      form.reset();
      await this.load();
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'No se pudo crear la plantilla.');
    } finally {
      this.creating.set(false);
    }
  }

  protected async removeTemplate(template: MetaTemplate): Promise<void> {
    if (!window.confirm(`¿Eliminar la plantilla ${template.name} de Meta?`)) return;

    this.error.set('');
    this.success.set('');
    try {
      const response = await fetch(`/admin/templates/${encodeURIComponent(template.id)}/delete`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar la plantilla.');
      this.success.set('Plantilla eliminada.');
      await this.load();
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'No se pudo eliminar la plantilla.');
    }
  }

  protected async sync(): Promise<void> {
    this.syncing.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const response = await fetch('/admin/templates/sync', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error('La sesión venció o no se permite sincronizar plantillas.');
      }
      const result = await response.json() as { count?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudieron sincronizar las plantillas.');
      this.success.set(`Plantillas de Meta sincronizadas: ${result.count || 0}.`);
      await this.load();
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally {
      this.syncing.set(false);
    }
  }
}
