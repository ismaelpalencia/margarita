import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ConfirmDialogService } from './ui/confirm-dialog.service';
import { EmptyStateComponent } from './ui/empty-state.component';
import { ToastService } from './ui/toast.service';

interface InboxTag { id: string; name: string; color: string | null }

interface AdminInboxConversation {
  id: string;
  status: string;
  archivedAt: string | null;
  operationalStatus: string;
  unreadCount: number;
  lastIncomingMessageAt: string | null;
  aiHandoffAt: string | null;
  assignedUser: { id: string; name: string } | null;
  contact: {
    customName: string | null;
    profileName: string | null;
    phone: string;
    optOutAt: string | null;
    tags: InboxTag[];
  };
  lastMessage: { body: string | null; type: string; timeLabel: string; dateLabel: string } | null;
}

interface AdminInboxResponse {
  conversations: AdminInboxConversation[];
  tags: InboxTag[];
  agents: Array<{ id: string; name: string; status: string }>;
  filters: { search: string; status: string; assigned: string; onlyUnread: boolean; tagId: string; archivedOnly: boolean };
}

interface BulkTemplateOption { id: string; name: string; language: string; shape: { body: number; header: number; url: number } }
interface BulkQuickReplyOption { id: string; title: string; type: 'TEXT' | 'BUTTONS' | 'LIST'; body: string }

interface PreviewMessage { id: string; direction: string; type: string; body: string | null; createdAt: string; isInternalNote?: boolean; deletedAt?: string | null }
interface PreviewData { timezone: string; hasOpenWindow: boolean; conversation: { id: string; status: string; assignedUser: { name: string } | null; contact: { customName: string | null; profileName: string | null; phone: string; optOutAt: string | null; tags: InboxTag[] }; messages: PreviewMessage[] } }

@Component({
  selector: 'app-admin-inbox-page',
  standalone: true,
  imports: [EmptyStateComponent],
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
        <select [value]="windowFilter()" (change)="setWindowFilter($event)" aria-label="Filtrar por ventana de mensajería"><option value="all">Ventana: todas</option><option value="open">Abierta · mensaje libre</option><option value="closed">Cerrada · usar plantilla</option></select>
        <label class="unread-filter"><input type="checkbox" [checked]="onlyUnread()" (change)="toggleUnread($event)">Solo sin leer</label>
        <label class="unread-filter"><input type="checkbox" [checked]="archivedOnly()" (change)="archivedOnly.set(($any($event.target)).checked)">Archivadas</label>
        <button type="submit">Filtrar</button>
      </form>
      <section class="bulk-toolbar" aria-label="Acciones en bloque">
        <label><input type="checkbox" [checked]="allVisibleSelected()" (change)="toggleAllVisible($event)"> Seleccionar visibles (máximo 25)</label>
        <span>{{ selectedIds().size }} seleccionadas</span>
        <button type="button" class="bulk-menu-toggle" [disabled]="selectedIds().size === 0" [attr.aria-expanded]="bulkMenuOpen()" (click)="toggleBulkMenu()">Acciones <span aria-hidden="true">▾</span></button>
        @if (selectedIds().size > 0) { <button type="button" class="bulk-secondary" (click)="clearSelection()">Limpiar</button> }
      </section>
      @if (bulkMenuOpen() && selectedIds().size > 0) {
        <div class="bulk-menu-panel" role="menu">
          <section class="bulk-menu-section"><h3>Etiquetas</h3><div class="bulk-action-row"><select class="bulk-tag-mode" [value]="bulkTagMode()" (change)="setBulkTagMode($event)" aria-label="Acción de etiqueta"><option value="add">Agregar etiqueta</option><option value="replace">Reemplazar etiquetas</option><option value="remove">Quitar etiqueta</option></select><select class="bulk-tag-select" [value]="bulkTagId()" (change)="setBulkTagId($event)" aria-label="Etiqueta para la selección"><option value="">Elige una etiqueta</option>@for (tag of tags(); track tag.id) { <option [value]="tag.id">{{ tag.name }}</option> }</select><button type="button" [disabled]="!bulkTagId() || bulkTagSaving()" (click)="applyBulkTag()">{{ bulkTagSaving() ? 'Aplicando…' : 'Aplicar etiqueta' }}</button></div></section>
          <section class="bulk-menu-section"><h3>Plantilla</h3><div class="bulk-action-row"><button type="button" [disabled]="bulkSaving()" (click)="openBulkTemplate()">Enviar plantilla aprobada</button></div></section>
          <section class="bulk-menu-section"><h3>Respuesta rápida</h3>@if (!bulkQuickReplyOpen()) { <div class="bulk-action-row"><button type="button" [disabled]="bulkQuickReplyLoading() || bulkQuickReplySaving()" (click)="openBulkQuickReplies()">{{ bulkQuickReplyLoading() ? 'Cargando…' : 'Elegir respuesta rápida' }}</button></div> } @else { <div class="bulk-action-row bulk-quick-reply-row"><select [value]="bulkQuickReplyId()" (change)="bulkQuickReplyId.set(($any($event.target)).value)" aria-label="Respuesta rápida"><option value="">Selecciona una respuesta</option>@for (reply of bulkQuickReplies(); track reply.id) { <option [value]="reply.id">{{ reply.title }} · {{ reply.type === 'TEXT' ? 'texto' : reply.type === 'BUTTONS' ? 'botones' : 'lista' }}</option> }</select><button type="button" [disabled]="!bulkQuickReplyId() || !eligibleSelectedCount() || bulkQuickReplySaving()" (click)="sendBulkQuickReply()">{{ bulkQuickReplySaving() ? 'Enviando…' : 'Enviar a ' + eligibleSelectedCount() }}</button></div><small class="bulk-window-hint">{{ eligibleSelectedCount() }} con ventana abierta · {{ selectedIds().size - eligibleSelectedCount() }} requieren plantilla y se omitirán.</small> @if (selectedBulkQuickReply(); as reply) { <p class="bulk-quick-preview"><b>{{ reply.title }}</b><span>{{ reply.body }}</span></p> } @if (!bulkQuickReplyLoading() && !bulkQuickReplies().length) { <small>No hay respuestas rápidas activas.</small> } }</section>
          <section class="bulk-menu-section"><h3>Asignación</h3><div class="bulk-action-row"><select [value]="bulkAgentId()" (change)="bulkAgentId.set(($any($event.target)).value)"><option value="">Sin asignar</option>@for (agent of agents(); track agent.id) { <option [value]="agent.id">{{ agent.name }} · {{ agent.status }}</option> }</select><button type="button" [disabled]="bulkActionSaving()" (click)="runBulkAction('assign')">Asignar</button></div></section>
          <section class="bulk-menu-section"><h3>Estado</h3><div class="bulk-action-row"><button type="button" [disabled]="bulkActionSaving()" (click)="runBulkAction('read')">Marcar como leídas</button><button type="button" class="bulk-danger" [disabled]="bulkActionSaving()" (click)="runBulkAction('close')">Cerrar conversaciones</button></div></section>
          <section class="bulk-menu-section"><h3>Nota interna</h3><div class="bulk-action-row bulk-note-row"><input [value]="bulkNote()" (input)="bulkNote.set($any($event.target).value)" maxlength="4000" placeholder="Nota para todas las seleccionadas"><button type="button" [disabled]="bulkActionSaving() || !bulkNote().trim()" (click)="runBulkAction('note')">Agregar nota</button></div></section>
        </div>
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
        <header class="inbox-card-heading"><h2>Bandeja <span>{{ visibleConversations().length }}</span></h2><p>Ordenadas por actividad reciente</p></header>
        @if (visibleConversations().length === 0) {
          <ui-empty-state icon="inbox" title="No hay conversaciones para mostrar" [description]="conversations().length ? 'Ningún chat coincide con los filtros actuales.' : 'Ajusta los filtros o espera un nuevo mensaje.'" />
        } @else {
          @for (conversation of visibleConversations(); track conversation.id) {
            <article class="inbox-row">
              <label class="conversation-select"><input type="checkbox" [checked]="selectedIds().has(conversation.id)" [disabled]="!selectedIds().has(conversation.id) && selectedIds().size >= 25" (change)="toggleConversation(conversation.id, $event)" [attr.aria-label]="'Seleccionar ' + contactName(conversation)"></label>
              <a class="conversation-link" [href]="'/panel/admin/conversations/' + conversation.id">
                <span class="conversation-avatar">{{ initials(contactName(conversation)) }}</span>
                <span class="conversation-copy"><span class="conversation-title"><strong [class.unread]="conversation.unreadCount > 0">{{ contactName(conversation) }}</strong><time>{{ conversation.lastMessage?.dateLabel || '' }} · {{ conversation.lastMessage?.timeLabel || '' }}</time></span><small class="preview">{{ conversation.lastMessage?.body || (conversation.lastMessage ? '[' + conversation.lastMessage.type + ']' : 'Sin mensajes todavía') }}</small><span class="badges">@for (tag of conversation.contact.tags; track tag.id) { <span class="badge contact-tag" [style.border-color]="tag.color || '#b9d7c4'" [style.color]="tag.color || '#28684d'">{{ tag.name }}</span> }<span class="badge" [class.open]="conversation.status === 'OPEN'">{{ statusLabel(conversation.operationalStatus) }}</span><span class="badge window-status" [class.window-open]="isWindowOpen(conversation)" [attr.title]="isWindowOpen(conversation) ? 'Puede recibir mensajes libres' : 'Necesita una plantilla aprobada'" [attr.aria-label]="isWindowOpen(conversation) ? 'Ventana abierta; admite mensaje libre' : 'Ventana cerrada; requiere plantilla aprobada'">{{ isWindowOpen(conversation) ? '24 h libre' : 'Plantilla' }}</span>@if (conversation.aiHandoffAt) { <span class="badge handoff">IA necesita atención</span> }@if (!conversation.assignedUser) { <span class="badge unassigned">Sin asignar</span> }@if (conversation.contact.optOutAt) { <span class="badge opted-out">BAJA</span> }</span></span>
              </a>
              <span class="row-actions">@if (conversation.unreadCount > 0) { <span class="unread-count">{{ conversation.unreadCount }}</span> }<span class="assigned-label">{{ conversation.assignedUser?.name || 'Sin asignar' }}</span><button type="button" class="preview-button" (click)="openPreview(conversation)">Vista previa</button><button type="button" class="preview-button" (click)="toggleArchive(conversation)">{{ conversation.archivedAt ? 'Desarchivar' : 'Archivar' }}</button><details class="tag-quick" (toggle)="openTagEditor(conversation, $event)"><summary>Etiquetar</summary><div class="tag-quick-menu">@if (!tags().length) { <small>No hay etiquetas configuradas.</small> }@for (tag of tags(); track tag.id) { <label><input type="checkbox" [checked]="draftTagIds(conversation).has(tag.id)" (change)="toggleDraftTag(conversation, tag.id, $event)"> {{ tag.name }}</label> }<button type="button" [disabled]="tagSavingId() === conversation.id" (click)="saveTags(conversation)">{{ tagSavingId() === conversation.id ? 'Guardando…' : 'Guardar' }}</button></div></details><a class="open-button" [href]="'/panel/admin/conversations/' + conversation.id">Abrir</a></span>
            </article>
          }
        }
      </section>
      @if (previewConversation(); as preview) {
        <div class="conversation-preview-backdrop" (click)="closePreview()">
          <aside class="conversation-preview" role="dialog" aria-modal="true" aria-label="Vista previa de la conversación" (click)="$event.stopPropagation()">
            <header class="preview-heading"><div><small>VISTA PREVIA</small><h2>{{ contactName(preview) }}</h2><p>{{ preview.contact.phone }}</p></div><button type="button" class="preview-close" (click)="closePreview()" aria-label="Cerrar vista previa">×</button></header>
            @if (previewLoading()) { <p class="preview-loading">Cargando conversación…</p> }
            @else if (previewError()) { <p class="preview-error" role="alert">{{ previewError() }}</p> }
            @else if (previewData(); as detail) {
              <div class="preview-tags">@for (tag of detail.conversation.contact.tags; track tag.id) { <span [style.border-color]="tag.color || '#b9d7c4'" [style.color]="tag.color || '#28684d'">{{ tag.name }}</span> }<details class="tag-quick" (toggle)="openPreviewTagEditor(preview, $event)"><summary>Etiquetar</summary><div class="tag-quick-menu">@if (!tags().length) { <small>No hay etiquetas configuradas.</small> }@for (tag of tags(); track tag.id) { <label><input type="checkbox" [checked]="draftTagIds(preview).has(tag.id)" (change)="toggleDraftTag(preview, tag.id, $event)"> {{ tag.name }}</label> }<button type="button" [disabled]="tagSavingId() === preview.id" (click)="saveTags(preview)">{{ tagSavingId() === preview.id ? 'Guardando…' : 'Guardar' }}</button></div></details></div>
              <div class="preview-thread">@for (message of previewMessages(); track message.id) { <article class="preview-message" [class.incoming]="message.direction === 'IN'" [class.outgoing]="message.direction === 'OUT' && !message.isInternalNote" [class.internal]="message.isInternalNote"><small>{{ message.isInternalNote ? 'NOTA INTERNA' : (message.direction === 'IN' ? 'Cliente' : 'Equipo') }} · {{ dateLabel(message.createdAt, detail.timezone) }}</small><p>{{ message.body || '[' + message.type + ']' }}</p></article> }</div>
              <footer class="preview-footer"><button type="button" (click)="togglePreviewSelection(preview)">{{ selectedIds().has(preview.id) ? 'Quitar selección' : 'Seleccionar conversación' }}</button><a [href]="'/panel/admin/conversations/' + preview.id">Abrir conversación completa</a></footer>
            }
          </aside>
        </div>
      }
    }
  `,
  styleUrl: './agent-inbox.page.css',
})
export class AdminInboxPage implements OnDestroy {
  private readonly confirmDialog=inject(ConfirmDialogService);
  private readonly toast=inject(ToastService);
  protected readonly conversations = signal<AdminInboxConversation[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly windowFilter = signal<'all' | 'open' | 'closed'>('all');
  protected readonly windowNow = signal(Date.now());
  protected readonly assigned = signal('');
  protected readonly onlyUnread = signal(false);
  protected readonly archivedOnly = signal(false);
  protected readonly tagId = signal('');
  protected readonly tags = signal<InboxTag[]>([]);
  protected readonly agents = signal<Array<{ id: string; name: string; status: string }>>([]);
  protected readonly bulkAgentId = signal('');
  protected readonly bulkNote = signal('');
  protected readonly bulkActionSaving = signal(false);
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly bulkTemplates = signal<BulkTemplateOption[]>([]);
  protected readonly bulkQuickReplies = signal<BulkQuickReplyOption[]>([]);
  protected readonly bulkQuickReplyId = signal('');
  protected readonly bulkQuickReplyOpen = signal(false);
  protected readonly bulkQuickReplyLoading = signal(false);
  protected readonly bulkQuickReplySaving = signal(false);
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
  protected readonly bulkMenuOpen = signal(false);
  protected readonly previewConversation = signal<AdminInboxConversation | null>(null);
  protected readonly previewData = signal<PreviewData | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewError = signal('');
  private readonly socket = window.io?.({ withCredentials: true });
  private connectedBefore = false;
  private readonly refreshTimer = window.setInterval(() => {
    this.windowNow.set(Date.now());
    if (!this.socket?.connected) void this.loadConversations(false);
  }, 20000);

  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.search.set(params.get('search') || '');
    this.status.set(params.get('status') || '');
    this.assigned.set(params.get('assigned') || '');
    this.onlyUnread.set(params.get('unread') === '1');
    this.archivedOnly.set(params.get('archived') === '1');
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
  protected setWindowFilter(event: Event): void { this.windowFilter.set((event.target as HTMLSelectElement).value as 'all' | 'open' | 'closed'); }
  protected isWindowOpen(conversation: AdminInboxConversation): boolean {
    const lastIncoming = conversation.lastIncomingMessageAt ? new Date(conversation.lastIncomingMessageAt).getTime() : 0;
    return lastIncoming > 0 && this.windowNow() - lastIncoming <= 24 * 60 * 60 * 1000;
  }
  protected visibleConversations(): AdminInboxConversation[] {
    const filter = this.windowFilter();
    return this.conversations().filter((conversation) => filter === 'all' || this.isWindowOpen(conversation) === (filter === 'open'));
  }
  protected eligibleSelectedCount(): number {
    const selected = this.selectedIds();
    return this.conversations().filter((conversation) => selected.has(conversation.id) && this.isWindowOpen(conversation)).length;
  }
  protected setAssigned(event: Event): void { this.assigned.set((event.target as HTMLSelectElement).value); }
  protected toggleUnread(event: Event): void { this.onlyUnread.set((event.target as HTMLInputElement).checked); }
  protected setTagId(event: Event): void { this.tagId.set((event.target as HTMLSelectElement).value); }
  protected toggleBulkMenu(): void { this.bulkMenuOpen.update((open) => !open); }
  protected dateLabel(value: string, timezone: string): string {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
  }
  protected previewMessages(): PreviewMessage[] { return (this.previewData()?.conversation.messages || []).slice(-10); }
  protected async toggleArchive(conversation: AdminInboxConversation): Promise<void> {
    if (!conversation.archivedAt && !await this.confirmDialog.confirm({title:'Archivar conversación',message:'La conversación saldrá de la bandeja activa. Podrás restaurarla después.'})) return;
    try {
      const action = conversation.archivedAt ? 'unarchive' : 'archive';
      const response = await fetch(`/admin/conversations/${encodeURIComponent(conversation.id)}/${action}`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('No se pudo archivar la conversación.');
      await this.loadConversations(false);
      this.toast.show(conversation.archivedAt ? 'Conversación desarchivada.' : 'Conversación archivada.','success');
    } catch (error) {
      const message=error instanceof Error ? error.message : 'No se pudo archivar la conversación.';this.bulkNotice.set(message);this.toast.show(message,'error');
    }
  }
  protected async openPreview(conversation: AdminInboxConversation): Promise<void> {
    this.previewConversation.set(conversation);
    this.previewData.set(null);
    this.previewError.set('');
    this.previewLoading.set(true);
    try {
      const response = await fetch(`/admin/conversations/${encodeURIComponent(conversation.id)}/data`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('No se pudo cargar la conversación.');
      this.previewData.set(await response.json() as PreviewData);
    } catch (error) {
      this.previewError.set(error instanceof Error ? error.message : 'No se pudo cargar la conversación.');
    } finally {
      this.previewLoading.set(false);
    }
  }
  protected closePreview(): void { this.previewConversation.set(null); this.previewData.set(null); this.previewError.set(''); }
  protected openPreviewTagEditor(conversation: AdminInboxConversation, event: Event): void { this.openTagEditor(conversation, event); }
  protected togglePreviewSelection(conversation: AdminInboxConversation): void {
    const wasEmpty = this.selectedIds().size === 0;
    const next = new Set(this.selectedIds());
    if (next.has(conversation.id)) next.delete(conversation.id); else next.add(conversation.id);
    this.selectedIds.set(next);
    if (next.size > 0 && wasEmpty) this.bulkMenuOpen.set(true);
    if (next.size === 0) this.bulkMenuOpen.set(false);
  }
  protected setBulkTagMode(event: Event): void { this.bulkTagMode.set((event.target as HTMLSelectElement).value as 'add' | 'replace' | 'remove'); }
  protected setBulkTagId(event: Event): void { this.bulkTagId.set((event.target as HTMLSelectElement).value); }
  protected async runBulkAction(action: 'assign' | 'read' | 'note' | 'close'): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    if (action === 'close' && !await this.confirmDialog.confirm({title:'Cerrar conversaciones',message:`¿Cerrar ${ids.length} conversaciones? Después podrás reabrirlas.`})) return;
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
    if (!await this.confirmDialog.confirm({title:'Actualizar etiquetas',message:`¿${action} «${tag?.name || 'seleccionada'}» en ${ids.length} conversaciones?`,danger:this.bulkTagMode()==='replace'||this.bulkTagMode()==='remove'})) return;
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
      const preview = this.previewData();
      if (preview?.conversation.id === conversation.id) {
        this.previewData.set({ ...preview, conversation: { ...preview.conversation, contact: { ...preview.conversation.contact, tags: result.tags! } } });
      }
      const nextDrafts = { ...this.tagDrafts() };
      delete nextDrafts[conversation.id];
      this.tagDrafts.set(nextDrafts);
      this.bulkNotice.set('Etiquetas actualizadas.');
      this.toast.show('Etiquetas actualizadas.','success');
    } catch (error) {
      const message=error instanceof Error ? error.message : 'No se pudieron guardar las etiquetas.';this.bulkNotice.set(message);this.toast.show(message,'error');
    } finally {
      this.tagSavingId.set('');
    }
  }
  protected toggleConversation(id: string, event: Event): void {
    const wasEmpty = this.selectedIds().size === 0;
    const next = new Set(this.selectedIds());
    (event.target as HTMLInputElement).checked ? next.add(id) : next.delete(id);
    this.selectedIds.set(next);
    if (next.size > 0 && wasEmpty) this.bulkMenuOpen.set(true);
    if (next.size === 0) this.bulkMenuOpen.set(false);
  }
  protected allVisibleSelected(): boolean { return this.visibleConversations().length > 0 && this.visibleConversations().slice(0, 25).every(({ id }) => this.selectedIds().has(id)); }
  protected toggleAllVisible(event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    this.selectedIds.set(selected ? new Set(this.visibleConversations().slice(0, 25).map(({ id }) => id)) : new Set());
    this.bulkMenuOpen.set(selected);
  }
  protected clearSelection(): void { this.selectedIds.set(new Set()); this.bulkOpen.set(false); this.bulkNotice.set(''); this.bulkMenuOpen.set(false); this.bulkQuickReplyId.set(''); this.bulkQuickReplyOpen.set(false); }
  protected selectedTemplate(): BulkTemplateOption | null { return this.bulkTemplates().find(({ id }) => id === this.bulkTemplateId()) || null; }
  protected bodyVariableIndexes(): number[] { return Array.from({ length: Math.min(this.selectedTemplate()?.shape.body || 0, 3) }, (_, index) => index); }
  protected selectBulkTemplate(event: Event): void { this.bulkTemplateId.set((event.target as HTMLSelectElement).value); }
  protected async openBulkTemplate(): Promise<void> {
    this.bulkOpen.set(true); this.bulkNotice.set(''); this.bulkMenuOpen.set(false);
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
  protected selectedBulkQuickReply(): BulkQuickReplyOption | null { return this.bulkQuickReplies().find(({ id }) => id === this.bulkQuickReplyId()) || null; }
  protected async openBulkQuickReplies(): Promise<void> {
    this.bulkQuickReplyOpen.set(true);
    this.bulkMenuOpen.set(true);
    if (this.bulkQuickReplies().length) return;
    this.bulkQuickReplyLoading.set(true);
    try {
      const response = await fetch('/admin/conversations/bulk/quick-reply-options', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as { quickReplies?: BulkQuickReplyOption[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las respuestas rápidas.');
      this.bulkQuickReplies.set(result.quickReplies || []);
    } catch (error) { this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudieron cargar las respuestas rápidas.'); }
    finally { this.bulkQuickReplyLoading.set(false); }
  }
  protected async sendBulkQuickReply(): Promise<void> {
    const reply = this.selectedBulkQuickReply();
    const selected = this.selectedIds();
    const ids = this.conversations().filter((conversation) => selected.has(conversation.id) && this.isWindowOpen(conversation)).map(({ id }) => id);
    if (!reply || !ids.length || this.bulkQuickReplySaving()) return;
    const skipped = selected.size - ids.length;
    const message = skipped
      ? `Se enviará «${reply.title}» a ${ids.length} chats con ventana abierta. ${skipped} chats fuera de las 24 horas se omitirán y requieren plantilla. ¿Continuar?`
      : `¿Enviar «${reply.title}» a ${ids.length} chats?`;
    if (!await this.confirmDialog.confirm({ title: 'Enviar respuesta rápida', message })) return;
    this.bulkQuickReplySaving.set(true);
    this.bulkNotice.set('');
    try {
      const response = await fetch('/admin/conversations/bulk/quick-reply-send', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ conversationIds: ids, quickReplyId: reply.id })
      });
      const result = await response.json() as { sent?: number; failed?: number; results?: Array<{ conversationId: string; sent: boolean; error?: string }>; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar la respuesta rápida.');
      const failures = (result.results || []).filter(({ sent }) => !sent).slice(0, 3).map(({ conversationId, error }) => {
        const conversation = this.conversations().find(({ id }) => id === conversationId);
        return `${conversation ? this.contactName(conversation) : 'Contacto'}: ${error || 'no enviado'}`;
      });
      this.bulkNotice.set(`Respuesta rápida: ${result.sent || 0} enviadas, ${result.failed || 0} con error${skipped ? `; ${skipped} fuera de ventana omitidas` : ''}.${failures.length ? ` ${failures.join(' · ')}` : ''}`);
      this.selectedIds.set(new Set()); this.bulkQuickReplyId.set(''); this.bulkQuickReplyOpen.set(false); this.bulkMenuOpen.set(false);
      await this.loadConversations(false);
    } catch (error) { this.bulkNotice.set(error instanceof Error ? error.message : 'No se pudo enviar la respuesta rápida.'); }
    finally { this.bulkQuickReplySaving.set(false); }
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
    if (this.archivedOnly()) params.set('archived', '1');
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
      if (this.archivedOnly()) next.set('archived', '1');
      if (this.tagId()) next.set('tagId', this.tagId());
      window.history.replaceState({}, '', `${window.location.pathname}${next.size ? `?${next}` : ''}`);
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally {
      this.loading.set(false);
    }
  }
}
