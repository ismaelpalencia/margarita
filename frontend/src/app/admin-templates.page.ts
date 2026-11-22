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
          <span>Consulta el estado de tus plantillas y sincroniza los cambios desde Meta.</span>
        </div>
        <button type="button" (click)="sync()" [disabled]="syncing()">
          {{ syncing() ? 'Sincronizando…' : 'Sincronizar desde Meta' }}
        </button>
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
          <table><thead><tr><th>Nombre</th><th>Idioma</th><th>Categoría</th><th>Estado en Meta</th><th>Última sincronización</th></tr></thead>
            <tbody>
              @if (!data()?.templates?.length) {
                <tr><td colspan="5" class="templates-empty">No hay plantillas sincronizadas. Adminístralas en Meta y pulsa “Sincronizar desde Meta”.</td></tr>
              }
              @for (template of data()?.templates || []; track template.id) {
                <tr>
                  <td><strong>{{ template.name }}</strong>@if (template.metaTemplateId) { <small>ID: {{ template.metaTemplateId }}</small> }</td>
                  <td>{{ template.language }}</td>
                  <td>{{ template.category || '—' }}@if (template.hasVariablesOrUrl) { <small class="template-chip">Variables o botón URL</small> }</td>
                  <td><span [class]="'template-status ' + template.status.toLowerCase()">{{ statusLabel(template.status) }}</span></td>
                  <td>{{ template.lastSyncedAt ? dateLabel(template.lastSyncedAt) : '—' }}</td>
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
