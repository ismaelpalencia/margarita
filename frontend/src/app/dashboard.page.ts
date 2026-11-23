import { Component, signal } from '@angular/core';

interface DashboardResponse {
  user: { name: string; role: string };
  activeNumber: { displayName: string | null; phoneNumber: string } | null;
  dashboard: {
    stats: {
      openConversations: number;
      unassignedConversations: number;
      assignedConversations: number;
      inProgressConversations: number;
    };
    agents: { available: number; busy: number; break: number; offline: number };
  };
  unassignedCount: number;
  handoffCount: number;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="loading"><span class="spinner"></span>Cargando el panel…</div>
    } @else if (error()) {
      <section class="error-card" role="alert">
        <span class="error-mark">!</span>
        <div><h1>No pudimos cargar el panel</h1><p>{{ error() }}</p><a href="/panel/login">Volver a iniciar sesión</a></div>
      </section>
    } @else if (data(); as model) {
      <div class="intro">
        <div><p class="eyebrow">PANEL OPERATIVO</p><h1>Hola, {{ firstName(model.user.name) }}</h1><p class="subtitle">Este es el estado actual de tu operación.</p></div>
        @if (model.activeNumber) { <div class="number-chip"><span class="phone-icon">◉</span><span><small>NÚMERO ACTIVO</small><strong>{{ model.activeNumber.displayName || model.activeNumber.phoneNumber }}</strong></span></div> }
      </div>

      @if (model.unassignedCount > 0) {
        <a class="alert-banner" href="/panel/admin/conversations?assigned=unassigned"><span class="alert-symbol">!</span><span><strong>{{ model.unassignedCount }} conversaciones necesitan asignación</strong><small>Hay conversaciones abiertas que todavía no tienen agente.</small></span><span class="alert-action">Revisar <b>→</b></span></a>
      }

      <section class="metric-grid" aria-label="Resumen de conversaciones">
        <article class="metric-card"><div class="metric-heading"><span>Conversaciones abiertas</span><span class="metric-icon mint">◷</span></div><strong>{{ model.dashboard.stats.openConversations }}</strong><small>En todos los números activos</small></article>
        <article class="metric-card"><div class="metric-heading"><span>Sin asignar</span><span class="metric-icon amber">↗</span></div><strong>{{ model.dashboard.stats.unassignedConversations }}</strong><small>Esperando a un agente</small></article>
        <article class="metric-card"><div class="metric-heading"><span>En atención</span><span class="metric-icon blue">◎</span></div><strong>{{ model.dashboard.stats.inProgressConversations }}</strong><small>Con respuesta en curso</small></article>
        <article class="metric-card"><div class="metric-heading"><span>Entregadas por IA</span><span class="metric-icon violet">✳</span></div><strong>{{ model.handoffCount }}</strong><small>Requieren atención humana</small></article>
      </section>

      <section class="lower-grid">
        <article class="panel-card"><div class="panel-heading"><div><h2>Equipo de atención</h2><p>Disponibilidad actual de los agentes</p></div><a href="/panel/admin/users">Ver equipo <b>→</b></a></div>
          <div class="agent-grid"><div><span class="status-dot available"></span><strong>{{ model.dashboard.agents.available }}</strong><small>Disponibles</small></div><div><span class="status-dot busy"></span><strong>{{ model.dashboard.agents.busy }}</strong><small>Ocupados</small></div><div><span class="status-dot resting"></span><strong>{{ model.dashboard.agents.break }}</strong><small>En descanso</small></div><div><span class="status-dot offline"></span><strong>{{ model.dashboard.agents.offline }}</strong><small>Desconectados</small></div></div>
        </article>
        <article class="panel-card next-card"><div class="next-icon">✦</div><h2>Tu operación, en un solo lugar</h2><p>Gestiona conversaciones, contactos y campañas desde el menú lateral.</p><a href="/panel/admin/conversations">Ir a conversaciones <b>→</b></a></article>
      </section>
      <p class="updated-note">Los indicadores se actualizan al cargar el panel.</p>
    }
  `,
  styleUrl: './dashboard.page.css',
})
export class DashboardPage {
  protected readonly data = signal<DashboardResponse | null>(null);
  protected readonly error = signal('');
  protected readonly loading = signal(true);

  constructor() {
    void fetch('/admin/dashboard/data', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Tu sesión no permite consultar estos datos.');
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) throw new Error('La sesión venció. Inicia sesión para continuar.');
        this.data.set(await response.json() as DashboardResponse);
      })
      .catch((reason: unknown) => this.error.set(reason instanceof Error ? reason.message : 'Error inesperado.'))
      .finally(() => this.loading.set(false));
  }

  protected firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || 'bienvenida';
  }
}
