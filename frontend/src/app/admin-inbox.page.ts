import { Component, OnDestroy, signal } from '@angular/core';

interface AdminInboxConversation {
  id: string;
  status: string;
  operationalStatus: string;
  unreadCount: number;
  aiHandoffAt: string | null;
  assignedUser: { id: string; name: string } | null;
  contact: {
    customName: string | null;
    profileName: string | null;
    phone: string;
    optOutAt: string | null;
  };
  lastMessage: { body: string | null; type: string; timeLabel: string } | null;
}

interface AdminInboxResponse {
  conversations: AdminInboxConversation[];
  filters: { search: string; status: string; assigned: string; onlyUnread: boolean };
}

@Component({
  selector: 'app-admin-inbox-page',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="inbox-loading"><span class="spinner"></span>Cargando conversaciones…</div>
    } @else if (error()) {
      <section class="inbox-error" role="alert"><b>!</b><div><h1>No pudimos cargar la bandeja</h1><p>{{ error() }}</p><a href="/panel/login">Iniciar sesión</a></div></section>
    } @else {
      <header class="inbox-intro"><div><p class="inbox-eyebrow">PANEL OPERATIVO</p><h1>Conversaciones</h1><p>Supervisa la atención y encuentra cada conversación de tu equipo.</p></div><a class="refresh-button" href="/panel/admin/conversations" aria-label="Actualizar bandeja">↻</a></header>
      <form class="filters" (submit)="$event.preventDefault(); loadConversations()">
        <label class="search-field"><span aria-hidden="true">⌕</span><input type="search" placeholder="Buscar por nombre o teléfono" [value]="search()" (input)="setSearch($event)" aria-label="Buscar conversaciones"></label>
        <select [value]="status()" (change)="setStatus($event)" aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="OPEN">Abiertas</option><option value="CLOSED">Cerradas</option></select>
        <select [value]="assigned()" (change)="setAssigned($event)" aria-label="Filtrar por asignación"><option value="">Cualquier agente</option><option value="unassigned">Sin asignar</option><option value="mine">Asignadas a mí</option></select>
        <label class="unread-filter"><input type="checkbox" [checked]="onlyUnread()" (change)="toggleUnread($event)">Solo sin leer</label>
        <button type="submit">Filtrar</button>
      </form>
      <section class="inbox-card">
        <header class="inbox-card-heading"><h2>Bandeja <span>{{ conversations().length }}</span></h2><p>Ordenadas por actividad reciente</p></header>
        @if (conversations().length === 0) {
          <div class="inbox-empty"><span>◷</span><strong>No hay conversaciones para mostrar</strong><p>Ajusta los filtros o espera un nuevo mensaje.</p></div>
        } @else {
          @for (conversation of conversations(); track conversation.id) {
            <article class="inbox-row">
              <a class="conversation-link" [href]="'/panel/admin/conversations/' + conversation.id">
                <span class="conversation-avatar">{{ initials(contactName(conversation)) }}</span>
                <span class="conversation-copy"><span class="conversation-title"><strong [class.unread]="conversation.unreadCount > 0">{{ contactName(conversation) }}</strong><time>{{ conversation.lastMessage?.timeLabel || '' }}</time></span><small class="preview">{{ conversation.lastMessage?.body || (conversation.lastMessage ? '[' + conversation.lastMessage.type + ']' : 'Sin mensajes todavía') }}</small><span class="badges"><span class="badge" [class.open]="conversation.status === 'OPEN'">{{ statusLabel(conversation.operationalStatus) }}</span>@if (conversation.aiHandoffAt) { <span class="badge handoff">IA necesita atención</span> }@if (!conversation.assignedUser) { <span class="badge unassigned">Sin asignar</span> }@if (conversation.contact.optOutAt) { <span class="badge opted-out">BAJA</span> }</span></span>
              </a>
              <span class="row-actions">@if (conversation.unreadCount > 0) { <span class="unread-count">{{ conversation.unreadCount }}</span> }<span class="assigned-label">{{ conversation.assignedUser?.name || 'Sin asignar' }}</span><a class="open-button" [href]="'/panel/admin/conversations/' + conversation.id">Abrir</a></span>
            </article>
          }
        }
      </section>
    }
  `,
  styleUrl: './agent-inbox.page.css',
})
export class AdminInboxPage implements OnDestroy {
  protected readonly conversations = signal<AdminInboxConversation[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly assigned = signal('');
  protected readonly onlyUnread = signal(false);
  private readonly socket = window.io?.({ withCredentials: true });
  private connectedBefore = false;
  private readonly refreshTimer = window.setInterval(() => {
    if (!this.socket?.connected) void this.loadConversations(false);
  }, 20000);

  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.search.set(params.get('search') || '');
    this.status.set(params.get('status') || '');
    this.assigned.set(params.get('assigned') || '');
    this.onlyUnread.set(params.get('unread') === '1');
    this.socket?.on('connect', () => {
      if (this.connectedBefore) void this.loadConversations(false);
      this.connectedBefore = true;
    });
    for (const eventName of ['conversation:message', 'conversation:assigned', 'conversation:unassigned', 'conversation:read', 'conversation:handoff']) {
      this.socket?.on(eventName, () => void this.loadConversations(false));
    }
    void this.loadConversations();
  }

  ngOnDestroy(): void {
    window.clearInterval(this.refreshTimer);
    this.socket?.disconnect();
  }

  protected setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  protected setStatus(event: Event): void { this.status.set((event.target as HTMLSelectElement).value); }
  protected setAssigned(event: Event): void { this.assigned.set((event.target as HTMLSelectElement).value); }
  protected toggleUnread(event: Event): void { this.onlyUnread.set((event.target as HTMLInputElement).checked); }
  protected contactName(conversation: AdminInboxConversation): string { return conversation.contact.customName || conversation.contact.profileName || conversation.contact.phone; }
  protected initials(name: string): string { return name.trim().slice(0, 1).toUpperCase(); }
  protected statusLabel(status: string): string { return ({ UNASSIGNED: 'Sin asignar', ASSIGNED: 'Asignada', IN_PROGRESS: 'En progreso' } as Record<string, string>)[status] || status; }

  protected async loadConversations(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    const params = new URLSearchParams();
    if (this.search()) params.set('search', this.search());
    if (this.status()) params.set('status', this.status());
    if (this.assigned()) params.set('assigned', this.assigned());
    if (this.onlyUnread()) params.set('unread', '1');
    try {
      const response = await fetch(`/admin/conversations/data?${params}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Tu sesión no permite consultar la bandeja.');
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció. Inicia sesión para continuar.');
      const result = await response.json() as AdminInboxResponse;
      this.conversations.set(result.conversations);
      const next = new URLSearchParams();
      if (this.search()) next.set('search', this.search());
      if (this.status()) next.set('status', this.status());
      if (this.assigned()) next.set('assigned', this.assigned());
      if (this.onlyUnread()) next.set('unread', '1');
      window.history.replaceState({}, '', `${window.location.pathname}${next.size ? `?${next}` : ''}`);
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally {
      this.loading.set(false);
    }
  }
}
