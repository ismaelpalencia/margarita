import { Component, signal } from '@angular/core';

interface AgentDashboardResponse {
  user: { name: string; role: string };
  unassignedCount: number;
  dashboard: {
    currentAgent: { status: string } | null;
    stats: {
      assignedOpenConversations: number;
      inProgressConversations: number;
      manualMessagesToday: number;
      manualMessageLimit: number | null;
    };
    recentConversations: Array<{
      id: string;
      operationalStatus: string;
      contact: { customName?: string | null; profileName?: string | null; phone: string };
      messages: Array<{ body: string | null; type: string }>;
    }>;
    recentMessages: Array<{
      direction: string;
      body: string | null;
      type: string;
      conversation: {
        id: string;
        contact: { customName?: string | null; profileName?: string | null; phone: string };
      };
    }>;
  };
}

@Component({
  selector: 'app-agent-dashboard-page',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="agent-loading"><span class="spinner"></span>Cargando el panel…</div>
    } @else if (error()) {
      <section class="agent-error" role="alert"><b>!</b><div><h1>No pudimos cargar tu panel</h1><p>{{ error() }}</p><a href="/auth/login">Iniciar sesión</a></div></section>
    } @else if (data(); as model) {
      <div class="agent-intro"><p class="agent-eyebrow">PANEL DE AGENTE</p><h1>Hola, {{ firstName(model.user.name) }}</h1><p>Aquí puedes ver tu carga actual y cambiar tu estado operativo.</p></div>

      @if (model.unassignedCount > 0) {
        <a class="agent-alert" href="/panel/agent/conversations?assigned=unassigned"><span>!</span><span><strong>{{ model.unassignedCount }} conversaciones sin asignar</strong><small>Reclama una para empezar a atenderla.</small></span><b>Ver conversaciones →</b></a>
      }

      <section class="agent-layout">
        <article class="status-card">
          <div class="status-card-heading"><span class="status-symbol">◉</span><div><small>TU DISPONIBILIDAD</small><h2>{{ statusLabel(model.dashboard.currentAgent?.status || 'UNKNOWN') }}</h2></div></div>
          <p>Elige el estado que verán tus compañeros.</p>
          <div class="status-actions">
            <button [class.selected]="model.dashboard.currentAgent?.status === 'AVAILABLE'" [disabled]="savingStatus()" (click)="updateStatus('AVAILABLE')"><i class="dot online"></i>Disponible</button>
            <button [class.selected]="model.dashboard.currentAgent?.status === 'BUSY'" [disabled]="savingStatus()" (click)="updateStatus('BUSY')"><i class="dot busy"></i>Ocupado</button>
            <button [class.selected]="model.dashboard.currentAgent?.status === 'BREAK'" [disabled]="savingStatus()" (click)="updateStatus('BREAK')"><i class="dot break"></i>En descanso</button>
            <button [class.selected]="model.dashboard.currentAgent?.status === 'OFFLINE'" [disabled]="savingStatus()" (click)="updateStatus('OFFLINE')"><i class="dot offline"></i>Offline</button>
          </div>
          @if (statusError()) { <p class="status-error" role="alert">{{ statusError() }}</p> }
        </article>

        <section class="agent-metrics" aria-label="Tu actividad">
          <article class="agent-metric"><span>Conversaciones asignadas</span><strong>{{ model.dashboard.stats.assignedOpenConversations }}</strong><small>Abiertas a tu nombre</small></article>
          <article class="agent-metric"><span>En progreso</span><strong>{{ model.dashboard.stats.inProgressConversations }}</strong><small>Con atención en curso</small></article>
          <article class="agent-metric"><span>Mensajes manuales hoy</span><strong>{{ model.dashboard.stats.manualMessagesToday }}<small class="limit">/ {{ model.dashboard.stats.manualMessageLimit === null ? 'sin tope' : model.dashboard.stats.manualMessageLimit }}</small></strong><small>Las notas internas no cuentan</small></article>
        </section>
      </section>

      <section class="agent-lists">
        <article class="agent-list-card"><header><div><h2>Tus conversaciones recientes</h2><p>Hilos abiertos asignados a ti</p></div><a href="/panel/agent/conversations">Ver todas →</a></header>
          @if (model.dashboard.recentConversations.length === 0) { <p class="agent-empty">Todavía no tienes conversaciones asignadas.</p> }
          @for (conversation of model.dashboard.recentConversations; track conversation.id) {
            <a class="agent-row" [href]="'/panel/agent/conversations/' + conversation.id"><span class="contact-avatar">{{ initials(contactName(conversation.contact)) }}</span><span class="row-copy"><strong>{{ contactName(conversation.contact) }}</strong><small>{{ conversation.messages[0]?.body || (conversation.messages[0] ? '[' + conversation.messages[0].type + ']' : 'Sin mensajes todavía') }}</small></span><span class="conversation-status">{{ conversation.operationalStatus }}</span></a>
          }
        </article>

        <article class="agent-list-card"><header><div><h2>Mensajes recientes</h2><p>Actividad de tus conversaciones</p></div></header>
          @if (model.dashboard.recentMessages.length === 0) { <p class="agent-empty">No hay mensajes recientes.</p> }
          @for (message of model.dashboard.recentMessages; track $index) {
            <a class="message-row" [href]="'/panel/agent/conversations/' + message.conversation.id"><span class="direction" [class.inbound]="message.direction === 'IN'">{{ message.direction === 'IN' ? 'RECIBIDO' : 'ENVIADO' }}</span><strong>{{ contactName(message.conversation.contact) }}</strong><small>{{ message.body || '[' + message.type + ']' }}</small></a>
          }
        </article>
      </section>
      <p class="agent-footnote">Tu actividad se actualiza al cargar el panel.</p>
    }
  `,
  styleUrl: './agent-dashboard.page.css',
})
export class AgentDashboardPage {
  protected readonly data = signal<AgentDashboardResponse | null>(null);
  protected readonly error = signal('');
  protected readonly loading = signal(true);
  protected readonly savingStatus = signal(false);
  protected readonly statusError = signal('');

  constructor() {
    void this.load();
  }

  protected async updateStatus(status: string): Promise<void> {
    this.savingStatus.set(true);
    this.statusError.set('');
    try {
      const response = await fetch('/agent/status', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ status }),
      });
      if (!response.ok) throw new Error('No se pudo guardar el estado.');
      await this.load();
    } catch {
      this.statusError.set('No se pudo guardar el estado. Inténtalo de nuevo.');
    } finally {
      this.savingStatus.set(false);
    }
  }

  protected firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || 'bienvenido';
  }

  protected contactName(contact: { customName?: string | null; profileName?: string | null; phone: string }): string {
    return contact.customName || contact.profileName || contact.phone;
  }

  protected initials(name: string): string {
    return name.trim().slice(0, 1).toUpperCase();
  }

  protected statusLabel(status: string): string {
    return ({ AVAILABLE: 'Disponible', BUSY: 'Ocupado', BREAK: 'En descanso', OFFLINE: 'Offline' } as Record<string, string>)[status] || 'Sin estado';
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch('/agent/dashboard/data', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Tu sesión no permite consultar estos datos.');
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) throw new Error('La sesión venció. Inicia sesión para continuar.');
      this.data.set(await response.json() as AgentDashboardResponse);
      this.error.set('');
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally {
      this.loading.set(false);
    }
  }
}
