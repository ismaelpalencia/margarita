import { Component, signal } from '@angular/core';

interface Campaign { id: string; name: string; status: string; createdAt: string; template: { name: string; language: string }; recipientsCount: number }
interface CampaignsResponse { campaigns: Campaign[]; success: boolean; error: boolean }

@Component({
  selector: 'app-admin-campaigns-page', standalone: true,
  template: `
    @if (loading()) { <div class="campaign-loading">Cargando campañas…</div> }
    @else if (error()) { <section class="campaign-error" role="alert"><h1>No pudimos cargar las campañas</h1><p>{{ error() }}</p><a href="/panel/login">Iniciar sesión</a></section> }
    @else {
      <header class="campaign-heading"><div><p class="campaign-eyebrow">WHATSAPP</p><h1>Campañas</h1><p>Crea campañas con plantillas aprobadas por Meta y revisa su estado.</p></div><a class="campaign-create" href="/panel/admin/campaigns/create">＋ Nueva campaña</a></header>
      @if (created()) { <div class="campaign-notice">La campaña se creó correctamente.</div> }
      <section class="campaign-card"><header><h2>Campañas recientes <span>{{ campaigns().length }}</span></h2><a href="/panel/admin/campaigns">Actualizar</a></header>
        @if (!campaigns().length) { <div class="campaign-empty"><strong>Todavía no hay campañas.</strong><p>Crea una campaña con una plantilla aprobada.</p></div> }
        @for (campaign of campaigns(); track campaign.id) { <a class="campaign-row" [href]="'/panel/admin/campaigns/' + campaign.id"><span class="campaign-copy"><strong>{{ campaign.name }}</strong><small>Plantilla: {{ campaign.template.name }} · {{ campaign.template.language }} · {{ dateLabel(campaign.createdAt) }}</small></span><span class="campaign-stats"><span [class]="'campaign-status ' + campaign.status.toLowerCase()">{{ statusLabel(campaign.status) }}</span><span class="campaign-count">{{ campaign.recipientsCount }} destinatarios</span></span><span class="campaign-chevron">›</span></a>}
      </section>
    }
  `,
  styleUrl: './admin-campaigns.page.css'
})
export class AdminCampaignsPage {
  protected readonly campaigns = signal<Campaign[]>([]); protected readonly loading = signal(true); protected readonly error = signal(''); protected readonly created = signal(false);
  constructor() { this.created.set(new URLSearchParams(window.location.search).get('success') === 'created'); void this.load(); }
  protected dateLabel(value: string): string { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value)); }
  protected statusLabel(status: string): string { return ({ DRAFT: 'Borrador', SCHEDULED: 'Programada', VALIDATING: 'Validando', READY: 'Lista para enviar', RUNNING: 'En curso', PAUSED: 'Pausada', FINISHED: 'Finalizada', CANCELLED: 'Cancelada', FAILED: 'Con errores' } as Record<string, string>)[status] || status; }
  private async load(): Promise<void> { try { const response = await fetch('/admin/campaigns', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció o no tienes permiso para ver campañas.'); const result = await response.json() as CampaignsResponse; this.campaigns.set(result.campaigns); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
}
