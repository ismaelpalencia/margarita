import { Component, OnDestroy, signal } from '@angular/core';

interface InboxTag { id: string; name: string; color: string | null }

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
    tags: InboxTag[];
  };
  lastMessage: { body: string | null; type: string; timeLabel: string } | null;
}

interface AdminInboxResponse {
  conversations: AdminInboxConversation[];
  tags: InboxTag[];
  agents: Array<{ id: string; name: string; status: string }>;
  filters: { search: string; status: string; assigned: string; onlyUnread: boolean; tagId: string };
}

interface BulkTemplateOption { id: string; name: string; language: string; shape: { body: number; header: number; url: number } }

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
        <select [value]="tagId()" (change)="setTagId($event)" aria-label="Filtrar por etiqueta"><option value="">Todas las etiquetas</option>@for (tag of tags(); track tag.id) { <option [value]="tag.id">{{ tag.name }}</option> }</select>
        <label class="unread-filter"><input type="checkbox" [checked]="onlyUnread()" (change)="toggleUnread($event)">Solo sin leer</label>
        <button type="submit">Filtrar</button>
      </form>
      <section class="bulk-toolbar" aria-label="Acciones en bloque">
        <label><input type="checkbox" [checked]="allVisibleSelected()" (change)="toggleAllVisible($event)"> Seleccionar visibles (máximo 25)</label>
        <span>{{ selectedIds().size }} seleccionadas</span>
        <select class="bulk-tag-mode" [value]="bulkTagMode()" (change)="setBulkTagMode($event)" aria-label="Acción de etiqueta"><option value="add">Agregar etiqueta</option><option value="replace">Reemplazar etiquetas</option><option value="remove">Quitar etiqueta</option></select>
        <select class="bulk-tag-select" [value]="bulkTagId()" (change)="setBulkTagId($event)" aria-label="Etiqueta para la selección"><option value="">Elige una etiqueta</option>@for (tag of tags(); track tag.id) { <option [value]="tag.id">{{ tag.name }}</option> }</select>
        <button type="button" [disabled]="selectedIds().size === 0 || !bulkTagId() || bulkTagSaving()" (click)="applyBulkTag()">{{ bulkTagSaving() ? 'Aplicando…' : 'Aplicar etiqueta' }}</button>
        <button type="button" [disabled]="selectedIds().size === 0 || bulkSaving()" (click)="openBulkTemplate()">Enviar plantilla</button>
        @if (selectedIds().size > 0) { <button type="button" class="bulk-secondary" (click)="clearSelection()">Limpiar</button> }
      </section>
      @if (selectedIds().size > 0) {
        <details class="bulk-more">
          <summary>Más acciones para {{ selectedIds().size }} conversaciones</summary>
          <div class="bulk-more-panel">
            <div class="bulk-action-row"><label>Asignar a<select [value]="bulkAgentId()" (change)="bulkAgentId.set(($any($event.target)).value)"><option value="">Sin asignar</option>@for (agent of agents(); track agent.id) { <option [value]="agent.id">{{ agent.name }} · {{ agent.status }}</option> }</select></label><button type="button" [disabled]="bulkActionSaving()" (click)="runBulkAction('assign')">Asignar</button></div>
            <div class="bulk-action-row"><button type="button" [disabled]="bulkActionSaving()" (click)="runBulkAction('read')">Marcar como leídas</button><button type="button" class="bulk-danger" [disabled]="bulkActionSaving()" (click)="runBulkAction('close')">Cerrar conversaciones</button></div>
            <div class="bulk-action-row bulk-note-row"><input [value]="bulkNote()" (input)="bulkNote.set($any($event.target).value)" maxlength="4000" placeholder="Nota interna para todas las seleccionadas"><button type="button" [disabled]="bulkActionSaving() || !bulkNote().trim()" (click)="runBulkAction('note')">Agregar nota</button></div>
          </div>
        </details>
      }
      @if (bulkNotice()) { <p class="bulk-notice" role="status">{{ bulkNotice() }}</p> }
      @if (bulkOpen()) {
        <form class="bulk-template-form" (submit)="sendBulkTemplate($event)">
          <div class="bulk-form-heading"><div><strong>Enviar plantilla aprobada</strong><small>Se enviará individualmente a {{ selectedIds().size }} conversaciones.</small></div><button type="button" class="bulk-close" (click)="bulkOpen.set(false)" aria-label="Cerrar">×</button></div>
          @if (bulkLoading()) { <p>Cargando plantillas aprobadas…</p> }
          @else if (bulkTemplates().length === 0) { <p>No hay plantillas aprobadas para este espacio.</p> }
          @else {
            <label class="bulk-field">Plantilla<select [value]="bulkTemplateId()" (change)="selectBulkTemplate($event)" required><option value="">Selecciona una plantilla</option>@for (template of bulkTemplates(); track template.id) { <option [value]="template.id">{{ template.name }} · {{ template.language }}</option> }</select></label>
            @if (selectedTemplate(); as template) {
              @for (index of bodyVariableIndexes(); track index) { <label class="bulk-field">Variable {{ index + 1 }} del cuerpo<input [name]="'variable' + (index + 1)" required placeholder="Valor para todas las conversaciones"></label> }
              @if (template.shape.header) { <label class="bulk-field">Variable del encabezado<input name="headerVariable" required placeholder="Valor para todas las conversaciones"></label> }
              @if (template.shape.url) { <label class="bulk-field">Variable del botón de enlace<input name="buttonVariable" required placeholder="Valor para todas las conversaciones"></label> }
              <p class="bulk-warning">Los valores se usarán en todas las conversaciones seleccionadas. Los contactos dados de baja o que no puedas atender se omitirán.</p>
              <button type="submit" [disabled]="bulkSaving()">{{ bulkSaving() ? 'Enviando…' : 'Enviar a ' + selectedIds().size + ' conversaciones' }}</button>
            }
          }
        </form>
      }
      <section class="inbox-card">
        <header class="inbox-card-heading"><h2>Bandeja <span>{{ conversations().length }}</span></h2><p>Ordenadas por actividad reciente</p></header>
        @if (conversations().length === 0) {
          <div class="inbox-empty"><span>◷</span><strong>No hay conversaciones para mostrar</strong><p>Ajusta los filtros o espera un nuevo mensaje.</p></div>
        } @else {
          @for (conversation of conversations(); track conversation.id) {
            <article class="inbox-row">
              <label class="conversation-select"><input type="checkbox" [checked]="selectedIds().has(conversation.id)" [disabled]="!selectedIds().has(conversation.id) && selectedIds().size >= 25" (change)="toggleConversation(conversation.id, $event)" [attr.aria-label]="'Seleccionar ' + contactName(conversation)"></label>
              <a class="conversation-link" [href]="'/panel/admin/conversations/' + conversation.id">
                <span class="conversation-avatar">{{ initials(contactName(conversation)) }}</span>
                <span class="conversation-copy"><span class="conversation-title"><strong [class.unread]="conversation.unreadCount > 0">{{ contactName(conversation) }}</strong><time>{{ conversation.lastMessage?.timeLabel || '' }}</time></span><small class="preview">{{ conversation.lastMessage?.body || (conversation.lastMessage ? '[' + conversation.lastMessage.type + ']' : 'Sin mensajes todavía') }}</small><span class="badges">@for (tag of conversation.contact.tags; track tag.id) { <span class="badge contact-tag" [style.border-color]="tag.color || '#b9d7c4'" [style.color]="tag.color || '#28684d'">{{ tag.name }}</span> }<span class="badge" [class.open]="conversation.status === 'OPEN'">{{ statusLabel(conversation.operationalStatus) }}</span>@if (conversation.aiHandoffAt) { <span class="badge handoff">IA necesita atención</span> }@if (!conversation.assignedUser) { <span class="badge unassigned">Sin asignar</span> }@if (conversation.contact.optOutAt) { <span class="badge opted-out">BAJA</span> }</span></span>
              </a>
              <span class="row-actions">@if (conversation.unreadCount > 0) { <span class="unread-count">{{ conversation.unreadCount }}</span> }<span class="assigned-label">{{ conversation.assignedUser?.name || 'Sin asignar' }}</span><details class="tag-quick" (toggle)="openTagEditor(conversation, $event)"><summary>Etiquetar</summary><div class="tag-quick-menu">@if (!tags().length) { <small>No hay etiquetas configuradas.</small> }@for (tag of tags(); track tag.id) { <label><input type="checkbox" [checked]="draftTagIds(conversation).has(tag.id)" (change)="toggleDraftTag(conversation, tag.id, $event)"> {{ tag.name }}</label> }<button type="button" [disabled]="tagSavingId() === conversation.id" (click)="saveTags(conversation)">{{ tagSavingId() === conversation.id ? 'Guardando…' : 'Guardar' }}</button></div></details><a class="open-button" [href]="'/panel/admin/conversations/' + conversation.id">Abrir</a></span>
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
  protected readonly tagId = signal('');
  protected readonly tags = signal<InboxTag[]>([]);
  protected readonly agents = signal<Array<{ id: string; name: string; status: string }>>([]);
  protected readonly bulkAgentId = signal('');
  protected readonly bulkNote = signal('');
  protected readonly bulkActionSaving = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly bulkTemplates = signal<BulkTemplateOption[]>([]);
  protected readonly bulkTemplateId = signal('');
  protected readonly bulkOpen = signal(false);
  protected readonly bulkLoading = signal(false);
  protected readonly bulkSaving = signal(false);
  protected readonly bulkNotice = signal('');
  protected readonly tagDrafts = signal<Record<string, Set<string>>>({});
  protected readonly tagSavingId = signal('');
  protected readonly bulkTagMode = signal<'add' | 'replace' | 'remove'>('add');
  protected readonly bulkTagId = signal('');
  protected readonly bulkTagSaving = signal(false);
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
    this.tagId.set(params.get('tagId') || '');
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
  protected setTagId(event: Event): void { this.tagId.set((event.target as HTMLSelectElement).value); }
  protected setBulkTagMode(event: Event): void { this.bulkTagMode.set((event.target as HTMLSelectElement).value as 'add' | 'replace' | 'remove'); }
  protected setBulkTagId(event: Event): void { this.bulkTagId.set((event.target as HTMLSelectElement).value); }
  protected async runBulkAction(action: 'assign' | 'read' | 'note' | 'close'): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    if (action === 'close' && !window.confirm(`¿Cerrar ${ids.length} conversaciones? Después podrás reabrirlas.`)) return;
    if (action === 'note' && !this.bulkNote().trim()) return;
    this.bulkActionSaving.set(true);
    this.bulkNotice.set('');
    try {
      const response = await fetch('/admin/conversations/bulk/actions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationIds: ids,
          action,
          agentId: action === 'assign' ? this.bulkAgentId() || null : undefined,
          body: action === 'note' ? this.bulkNote().trim() : undefined
        })
      });
      const result = await response.json() as { updated?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo completar la acción.');
      this.bulkNotice.set(`Acción terminada: ${result.updated || 0} actualizadas, ${result.failed || 0} con error.`);
      if (action === 'note') this.bulkNote.set('');
      await this.loadConversations(false);
    } catch (error) {
      this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudo completar la acción.');
    } finally {
      this.bulkActionSaving.set(false);
    }
  }
  protected async applyBulkTag(): Promise<void> {
    const tagId = this.bulkTagId();
    const ids = [...this.selectedIds()];
    if (!tagId || !ids.length) return;
    const tag = this.tags().find((item) => item.id === tagId);
    const action = this.bulkTagMode() === 'replace' ? 'Reemplazar todas las etiquetas' : this.bulkTagMode() === 'remove' ? 'Quitar la etiqueta' : 'Agregar la etiqueta';
    if (!window.confirm(`¿${action} «${tag?.name || 'seleccionada'}» en ${ids.length} conversaciones?`)) return;
    this.bulkTagSaving.set(true);
    this.bulkNotice.set('');
    try {
      const response = await fetch('/admin/conversations/bulk/tags', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationIds: ids, tagIds: [tagId], mode: this.bulkTagMode() })
      });
      const result = await response.json() as { updated?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudieron actualizar las etiquetas.');
      this.bulkNotice.set(`Etiquetas: ${result.updated || 0} actualizadas, ${result.failed || 0} con error.`);
      await this.loadConversations(false);
    } catch (error) {
      this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudieron actualizar las etiquetas.');
    } finally {
      this.bulkTagSaving.set(false);
    }
  }
  protected draftTagIds(conversation: AdminInboxConversation): Set<string> {
    return this.tagDrafts()[conversation.id] || new Set(conversation.contact.tags.map((tag) => tag.id));
  }
  protected openTagEditor(conversation: AdminInboxConversation, event: Event): void {
    if (!(event.target as HTMLDetailsElement).open || this.tagDrafts()[conversation.id]) return;
    this.tagDrafts.set({ ...this.tagDrafts(), [conversation.id]: new Set(conversation.contact.tags.map((tag) => tag.id)) });
  }
  protected toggleDraftTag(conversation: AdminInboxConversation, tagId: string, event: Event): void {
    const next = new Set(this.draftTagIds(conversation));
    if ((event.target as HTMLInputElement).checked) next.add(tagId); else next.delete(tagId);
    this.tagDrafts.set({ ...this.tagDrafts(), [conversation.id]: next });
  }
  protected async saveTags(conversation: AdminInboxConversation): Promise<void> {
    const tagIds = [...this.draftTagIds(conversation)];
    this.tagSavingId.set(conversation.id);
    this.bulkNotice.set('');
    try {
      const response = await fetch(`/admin/conversations/${encodeURIComponent(conversation.id)}/tags`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds })
      });
      const result = await response.json() as { tags?: InboxTag[]; error?: string };
      if (!response.ok || !result.tags) throw new Error(result.error || 'No se pudieron guardar las etiquetas.');
      this.conversations.set(this.conversations().map((item) => item.id === conversation.id ? { ...item, contact: { ...item.contact, tags: result.tags! } } : item));
      const nextDrafts = { ...this.tagDrafts() };
      delete nextDrafts[conversation.id];
      this.tagDrafts.set(nextDrafts);
      this.bulkNotice.set('Etiquetas actualizadas.');
    } catch (error) {
      this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudieron guardar las etiquetas.');
    } finally {
      this.tagSavingId.set('');
    }
  }
  protected toggleConversation(id: string, event: Event): void {
    const next = new Set(this.selectedIds());
    (event.target as HTMLInputElement).checked ? next.add(id) : next.delete(id);
    this.selectedIds.set(next);
  }
  protected allVisibleSelected(): boolean { return this.conversations().length > 0 && this.conversations().slice(0, 25).every(({ id }) => this.selectedIds().has(id)); }
  protected toggleAllVisible(event: Event): void {
    this.selectedIds.set((event.target as HTMLInputElement).checked ? new Set(this.conversations().slice(0, 25).map(({ id }) => id)) : new Set());
  }
  protected clearSelection(): void { this.selectedIds.set(new Set()); this.bulkOpen.set(false); this.bulkNotice.set(''); }
  protected selectedTemplate(): BulkTemplateOption | null { return this.bulkTemplates().find(({ id }) => id === this.bulkTemplateId()) || null; }
  protected bodyVariableIndexes(): number[] { return Array.from({ length: Math.min(this.selectedTemplate()?.shape.body || 0, 3) }, (_, index) => index); }
  protected selectBulkTemplate(event: Event): void { this.bulkTemplateId.set((event.target as HTMLSelectElement).value); }
  protected async openBulkTemplate(): Promise<void> {
    this.bulkOpen.set(true); this.bulkNotice.set('');
    if (this.bulkTemplates().length) return;
    this.bulkLoading.set(true);
    try {
      const response = await fetch('/admin/conversations/bulk/template-options', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await response.json() as { templates?: BulkTemplateOption[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las plantillas.');
      this.bulkTemplates.set(data.templates || []);
    } catch (error) { this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudieron cargar las plantillas.'); }
    finally { this.bulkLoading.set(false); }
  }
  protected async sendBulkTemplate(event: Event): Promise<void> {
    event.preventDefault();
    const template = this.selectedTemplate();
    const ids = [...this.selectedIds()];
    const form = event.target as HTMLFormElement;
    if (!template || !ids.length || this.bulkSaving()) return;
    if (!window.confirm(`¿Enviar «${template.name}» a ${ids.length} conversaciones?`)) return;
    const values = new FormData(form);
      const value = (name: string): string => String(values.get(name) ?? '');
    this.bulkSaving.set(true); this.bulkNotice.set('');
    try {
      const response = await fetch('/admin/conversations/bulk/template-send', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ conversationIds: ids, templateId: template.id, variable1: value('variable1'), variable2: value('variable2'), variable3: value('variable3'), headerVariable: value('headerVariable'), buttonVariable: value('buttonVariable') })
      });
      const result = await response.json() as { sent?: number; failed?: number; error?: string; results?: Array<{ conversationId: string; sent: boolean; error?: string }> };
      if (!response.ok) throw new Error(result.error || 'No se pudo procesar el envío.');
      const failureDetails = (result.results || []).filter(({ sent }) => !sent).slice(0, 3).map(({ conversationId, error }) => {
        const conversation = this.conversations().find(({ id }) => id === conversationId);
        return `${conversation ? this.contactName(conversation) : 'Contacto'}: ${error || 'no enviado'}`;
      });
      this.bulkNotice.set(`Envío terminado: ${result.sent || 0} enviados, ${result.failed || 0} no enviados.${failureDetails.length ? ` ${failureDetails.join(' · ')}` : ''}`);
      this.selectedIds.set(new Set());
      this.bulkOpen.set(false); form.reset(); this.bulkTemplateId.set('');
      await this.loadConversations(false);
    } catch (error) { this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudo procesar el envío.'); }
    finally { this.bulkSaving.set(false); }
  }
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
    if (this.tagId()) params.set('tagId', this.tagId());
    try {
      const response = await fetch(`/admin/conversations/data?${params}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Tu sesión no permite consultar la bandeja.');
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció. Inicia sesión para continuar.');
      const result = await response.json() as AdminInboxResponse;
      this.conversations.set(result.conversations);
      this.tags.set(result.tags || []);
      this.agents.set(result.agents || []);
      const visibleIds = new Set(result.conversations.map(({ id }) => id));
      this.selectedIds.set(new Set([...this.selectedIds()].filter((id) => visibleIds.has(id))));
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
