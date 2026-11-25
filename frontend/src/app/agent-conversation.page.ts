import { Component, ElementRef, HostListener, OnDestroy, ViewChild, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

interface ConversationMessage {
  id: string;
  wamid?: string | null;
  direction: string;
  type: string;
  status: string;
  source: string;
  body: string | null;
  mediaId: string | null;
  isInternalNote: boolean;
  aiSuggestionId: string | null;
  replyTitle: string | null;
  replyId: string | null;
  createdAt: string;
  errorText: string | null;
  deletedAt?: string | null;
}

interface SharedContactCard {
  name: string;
  fields: Array<{ label: string; value: string }>;
}

interface QuickReply {
  id: string;
  title: string;
  type: 'TEXT' | 'BUTTONS' | 'LIST';
  body: string;
  interactiveData: { footer?: string; buttons?: string[]; buttonLabel?: string; sectionTitle?: string; rows?: Array<{ title: string; description?: string }> } | null;
}

interface AgentConversationDetail {
  timezone: string;
  hasOpenWindow: boolean;
  offHoursNow: boolean;
  interactiveListsEnabled: boolean;
  conversation: {
    id: string;
    status: string;
    archivedAt: string | null;
    whatsappBlockedAt: string | null;
    operationalStatus: string;
    source: string;
    aiHandoffAt: string | null;
    aiHandoffReason: string | null;
    aiPausedAt: string | null;
    lastIncomingMessageAt: string | null;
    assignedUser: { name: string } | null;
    whatsappNumber: { displayName: string | null; phoneNumber: string } | null;
    contact: {
      id: string;
      customName: string | null;
      profileName: string | null;
      phone: string;
      optOutAt: string | null;
      tags: Array<{ id: string; name: string; color: string | null }>;
    };
    messages: ConversationMessage[];
  };
  conversations: Array<{ id: string; unreadCount: number; contactName: string; lastMessage: string }>;
  quickReplies: QuickReply[];
}

interface AdvancedConversationData {
  agents?: Array<{ id: string; name: string; status: string }>;
  templates: Array<{ id: string; name: string; language: string; components: unknown }>;
  aiSuggestion: { id: string; body: string; confidence: number; intent: string | null; handoff: boolean; reason: string | null } | null;
  aiSettings: { enabled: boolean; mode: string; confidenceMin: number };
  guidedFlowRun: { status?: string; flowName?: string; pending?: { text: string; options: string[] } | null; [key: string]: unknown } | null;
  existingLead: { id?: string; name?: string; phone?: string; email?: string | null; interest?: string | null; notes?: string | null } | null;
  interactiveListsEnabled: boolean;
  error: string | null;
  success: string | null;
}

@Component({
  selector: 'app-agent-conversation-page',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="detail-loading"><span class="spinner"></span>Cargando conversación…</div>
    } @else if (error()) {
      <section class="detail-error" role="alert"><b>!</b><div><h1>No pudimos abrir la conversación</h1><p>{{ error() }}</p><a [href]="listUrl()">Volver a la bandeja</a></div></section>
    } @else if (data(); as model) {
      <header class="detail-intro"><a [href]="listUrl()" class="back-link">← Bandeja</a><div class="detail-heading"><span class="detail-avatar">{{ initials(contactName(model)) }}</span><div class="contact-heading"><h1>{{ contactName(model) }}</h1><p>{{ model.conversation.contact.phone }}</p></div><div class="detail-header-badges">@if (model.conversation.whatsappNumber) { <span class="detail-pill">{{ model.conversation.whatsappNumber.displayName || model.conversation.whatsappNumber.phoneNumber }}</span> }<span class="detail-pill" [class.open-pill]="model.conversation.status === 'OPEN'">{{ model.conversation.status === 'OPEN' ? 'Abierta' : 'Cerrada' }}</span>@if (model.conversation.aiHandoffAt) { <span class="detail-pill handoff-pill">IA pidió atención</span> }</div></div>
      </header>
      @if (operationNotice()) { <p class="composer-note" role="status">{{ operationNotice() }}</p> }

      <div class="conversation-layout">
        <section class="chat-card">
          <header class="chat-heading"><div><strong>Conversación</strong><small>{{ model.conversation.operationalStatus }}@if (model.offHoursNow) { · Fuera de horario }</small></div></header>
          @if (isAdmin) { <label class="deleted-toggle"><input type="checkbox" [checked]="showDeleted()" (change)="toggleDeleted($event)"> Mostrar mensajes eliminados</label> }
          <div class="message-thread" #thread (scroll)="onThreadScroll($event)">
            @if (model.conversation.messages.length === 0) { <div class="thread-empty">Todavía no hay mensajes en esta conversación.</div> }
            @for (message of model.conversation.messages; track message.id) {
              <div class="message-line" [class.outgoing]="message.direction === 'OUT'">
                <article class="message-bubble" [class.internal-note]="message.isInternalNote" [class.outgoing-bubble]="message.direction === 'OUT' && !message.isInternalNote" [class.deleted-message]="message.deletedAt">
                  @if (message.deletedAt) { <small class="message-label">ELIMINADO</small> }
                  @if (message.isInternalNote) { <small class="message-label">NOTA INTERNA · SOLO EL EQUIPO</small> }
                  @if (message.source === 'AUTOMATIC' && message.aiSuggestionId) { <small class="message-label">RESPUESTA AUTOMÁTICA DE IA</small> }
                  @if (message.type === 'CONTACT') {
                    <section class="detail-card shared-contact-card" aria-label="Contacto compartido">
                      <small class="contact-share-label">CONTACTO COMPARTIDO</small>
                      @for (contact of sharedContactCards(message.body); track $index) {
                        <div class="shared-contact-entry">
                          <strong>{{ contact.name }}</strong>
                          @if (contact.fields.length) {
                            <dl>@for (field of contact.fields; track $index) { <div><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div> }</dl>
                          }
                        </div>
                      }
                      @if (!sharedContactCards(message.body).length) { <p class="shared-contact-empty">WhatsApp no incluyó datos visibles en esta tarjeta.</p> }
                    </section>
                  }
                  @if (message.mediaId && message.type === 'AUDIO') { <audio class="audio-player" controls preload="none" [src]="mediaFileUrl(message)" [attr.aria-label]="'Audio recibido · ' + dateLabel(message.createdAt, model.timezone)">Tu navegador no puede reproducir este audio.</audio><a class="media-link" [href]="mediaFileUrl(message)" target="_blank" rel="noopener">Descargar audio</a> }
                  @else if (message.mediaId && (message.type === 'IMAGE' || message.type === 'STICKER')) { <button type="button" class="media-preview-button" (click)="openMediaPreview(message)" [attr.aria-label]="'Abrir ' + mediaLabel(message.type)"><img [src]="mediaFileUrl(message)" [alt]="mediaLabel(message.type)" loading="lazy"></button> }
                  @else if (message.mediaId && message.type === 'VIDEO') { <video class="video-player" controls preload="metadata" [src]="mediaFileUrl(message)" [attr.aria-label]="'Video · ' + dateLabel(message.createdAt, model.timezone)">Tu navegador no puede reproducir este video.</video> }
                  @else if (message.mediaId && message.type === 'DOCUMENT') { <a class="document-card" [href]="mediaFileUrl(message)" target="_blank" rel="noopener"><span class="document-icon" aria-hidden="true">▤</span><span><strong>{{ message.body || 'Documento' }}</strong><small>Abrir documento</small></span></a> }
                  @else if (message.mediaId) { <a class="media-link" [href]="mediaFileUrl(message)" target="_blank" rel="noopener">{{ mediaLabel(message.type) }} · Abrir archivo</a> }
                  @if (isAdmin && message.mediaId && !message.deletedAt) { <button class="media-delete" type="button" (click)="removeRemoteMedia(message)">Eliminar archivo remoto y copia local</button> }
                  @if (message.type !== 'CONTACT' && message.body && !(message.mediaId && isPlaceholder(message.body))) { <p>{{ message.body }}</p> }
                  @if (message.type !== 'CONTACT' && !message.body && !message.mediaId) { <p>[{{ message.type }}]</p> }
                  @if (message.replyTitle || message.replyId) { <small class="reply-label">Respuesta: {{ message.replyTitle || message.replyId }}</small> }
                  <footer><span>{{ dateLabel(message.createdAt, model.timezone) }}</span>@if (message.direction === 'OUT' && !message.isInternalNote) { <span [title]="message.status">{{ tick(message.status) }}</span> }@if (message.deletedAt && isAdmin) { <form [action]="restoreUrl(model, message)" method="post"><button type="submit" aria-label="Restaurar mensaje" title="Restaurar mensaje">↶</button></form> }@else if (!message.deletedAt) { <form [action]="deleteUrl(model, message)" method="post"><button type="submit" aria-label="Eliminar mensaje" title="Eliminar mensaje">×</button></form> }</footer>
                  @if (message.direction === 'IN' && !message.isInternalNote && !message.deletedAt && message.wamid) { <div class="message-reactions" aria-label="Reaccionar al mensaje">@for (emoji of reactionChoices; track emoji) { <button type="button" [attr.aria-label]="emoji ? 'Reaccionar ' + emoji : 'Quitar reacción'" [title]="emoji ? 'Reaccionar ' + emoji : 'Quitar reacción'" (click)="react(model, message, emoji)">{{ emoji || '×' }}</button> }</div> }
                  @if (message.errorText) { <small class="message-error">{{ message.errorText }}</small> }
                </article>
              </div>
            }
          </div>
          @if (showJumpToLatest()) { <button type="button" class="jump-latest" (click)="jumpToLatest()" aria-label="Ir al mensaje más reciente"><span aria-hidden="true">↓</span> Ir al último mensaje</button> }
          <div class="composer">
            @if (model.conversation.contact.optOutAt) {
              <p class="composer-warning danger">Este contacto pidió la baja. No se pueden enviar mensajes.</p>
            } @else if (model.conversation.status !== 'OPEN') {
              <p class="composer-warning">Esta conversación está cerrada.</p>
            } @else if (model.hasOpenWindow) {
              @if (model.quickReplies.length > 0) {
                <div class="quick-replies"><span>Respuestas rápidas</span>@for (reply of model.quickReplies; track reply.id) { @if (reply.type !== 'LIST' || model.interactiveListsEnabled) { <button type="button" (click)="useQuickReply(reply)">{{ reply.title }}@if (reply.type !== 'TEXT') { <small>{{ reply.type === 'BUTTONS' ? ' · botones' : ' · lista' }}</small> }</button> } }</div>
              }
              @if (selectedQuickReply(); as selected) { @if (selected.type === 'BUTTONS') { <form [action]="interactiveUrl(model)" method="post" class="quick-reply-send"><strong>{{ selected.title }}</strong><p>{{ selected.body }}</p><div class="quick-reply-preview">@for (button of selected.interactiveData?.buttons || []; track $index) { <span>{{ button }}</span> }</div><input type="hidden" name="body" [value]="selected.body"><input type="hidden" name="footer" [value]="selected.interactiveData?.footer || ''">@for (button of selected.interactiveData?.buttons || []; track $index) { <input type="hidden" [name]="'button' + ($index + 1)" [value]="button"> }<button type="submit">Enviar botones</button><button type="button" class="quick-reply-cancel" (click)="selectedQuickReply.set(null)">Cancelar</button></form> } @else if (selected.type === 'LIST') { <form [action]="interactiveListUrl(model)" method="post" class="quick-reply-send"><strong>{{ selected.title }}</strong><p>{{ selected.body }}</p><div class="quick-reply-preview"><span>{{ selected.interactiveData?.buttonLabel }}</span><small>{{ selected.interactiveData?.rows?.length || 0 }} opciones</small></div><input type="hidden" name="body" [value]="selected.body"><input type="hidden" name="footer" [value]="selected.interactiveData?.footer || ''"><input type="hidden" name="buttonLabel" [value]="selected.interactiveData?.buttonLabel || ''"><input type="hidden" name="sectionTitle" [value]="selected.interactiveData?.sectionTitle || ''">@for (row of selected.interactiveData?.rows || []; track $index) { <input type="hidden" name="rowTitle" [value]="row.title"><input type="hidden" name="rowDescription" [value]="row.description || ''"> }<button type="submit">Enviar lista</button><button type="button" class="quick-reply-cancel" (click)="selectedQuickReply.set(null)">Cancelar</button></form> } }
              <form [action]="messageUrl(model)" method="post" class="send-form">
                <textarea name="body" required maxlength="4000" rows="3" [value]="draft()" (input)="setDraft($event)" placeholder="Escribe un mensaje" aria-label="Mensaje para el contacto"></textarea>
                <button type="submit">Enviar mensaje</button>
              </form>
              <p class="composer-note">La ventana de atención de 24 horas está abierta.</p>
              <details class="composer-actions">
                <summary>Adjuntar audio, archivos y más acciones</summary>
                <div class="composer-action-list">
              <form [action]="mediaUrl(model)" method="post" enctype="multipart/form-data" class="upload-form">
                <input type="file" name="file" required aria-label="Archivo para enviar">
                <input type="text" name="caption" maxlength="1024" placeholder="Texto opcional">
                <button type="submit">Adjuntar</button>
              </form>
              <div class="voice-recorder" aria-live="polite">
                @if (recording()) {
                  <span class="recording-indicator"><i></i>Grabando · {{ formatRecordingTime(recordingSeconds()) }}</span>
                  <button type="button" class="voice-stop" (click)="stopVoiceRecording()">Detener</button>
                } @else if (voicePreviewUrl()) {
                  <audio controls [src]="voicePreviewUrl()" aria-label="Escuchar nota de voz antes de enviarla"></audio>
                  <button type="button" class="voice-send" [disabled]="sendingVoice()" (click)="sendVoiceNote(model)">{{ sendingVoice() ? 'Enviando…' : 'Enviar audio' }}</button>
                  <button type="button" class="voice-discard" [disabled]="sendingVoice()" (click)="discardVoiceRecording()">Descartar</button>
                } @else {
                  <button type="button" class="voice-start" (click)="startVoiceRecording()">🎙 Grabar audio de voz</button>
                }
                @if (voiceError()) { <small role="alert">{{ voiceError() }}</small> }
              </div>
                </div>
              </details>
            } @else {
              <p class="composer-warning">La ventana de 24 horas está cerrada. Usa una plantilla aprobada para reabrirla.</p>
            }
            <details class="composer-actions">
              <summary>Plantillas y mensajes interactivos</summary>
              <div class="composer-action-list">
            @if (advanced(); as tools) { @if (tools.templates.length > 0 && model.conversation.status === 'OPEN' && !model.conversation.contact.optOutAt) {
              <form [action]="templateUrl(model)" method="post" class="send-form advanced-form"><strong>Enviar plantilla aprobada</strong><select name="templateId" required><option value="">Selecciona una plantilla</option>@for (template of tools.templates; track template.id) { <option [value]="template.id">{{ template.name }} · {{ template.language }}</option> }</select><input name="variable1" placeholder="Variable 1 (opcional)"><input name="variable2" placeholder="Variable 2 (opcional)"><input name="variable3" placeholder="Variable 3 (opcional)"><button type="submit">Enviar plantilla</button></form>
            } }
            @if (advanced(); as tools) { @if (model.hasOpenWindow && model.conversation.status === 'OPEN' && !model.conversation.contact.optOutAt) {
              <details class="detail-card interactive-tools"><summary>Mensajes interactivos</summary><form [action]="interactiveUrl(model)" method="post" class="advanced-form"><strong>Enviar botones rápidos</strong><textarea name="body" required maxlength="1024" placeholder="Texto del mensaje"></textarea><input name="footer" maxlength="60" placeholder="Pie (opcional)"><input name="button1" maxlength="20" placeholder="Botón 1"><input name="button2" maxlength="20" placeholder="Botón 2 (opcional)"><input name="button3" maxlength="20" placeholder="Botón 3 (opcional)"><button type="submit">Enviar botones</button></form>
                @if (tools.interactiveListsEnabled) { <form [action]="interactiveListUrl(model)" method="post" class="advanced-form"><strong>Enviar lista de opciones</strong><textarea name="body" required maxlength="1024" placeholder="Texto del mensaje"></textarea><input name="footer" maxlength="60" placeholder="Pie (opcional)"><input name="buttonLabel" required maxlength="20" placeholder="Botón que abre la lista"><input name="sectionTitle" maxlength="24" placeholder="Título de sección">@for (index of listRows; track index) { <input name="rowTitle" maxlength="24" [placeholder]="'Opción ' + (index + 1)"><input name="rowDescription" maxlength="72" placeholder="Descripción (opcional)"> }<button type="submit">Enviar lista</button></form> }
              </details>
            } }
                </div>
              </details>
          </div>
        </section>

        <aside class="detail-aside">
          <section class="detail-card"><h2>Datos del contacto</h2><dl><div><dt>Nombre</dt><dd>{{ contactName(model) }}</dd></div><div><dt>Teléfono</dt><dd>{{ model.conversation.contact.phone }}</dd></div><div><dt>Estado</dt><dd>{{ model.conversation.status === 'OPEN' ? 'Abierta' : 'Cerrada' }}</dd></div><div><dt>Origen</dt><dd>{{ model.conversation.source }}</dd></div><div><dt>Agente</dt><dd>{{ model.conversation.assignedUser?.name || 'Sin asignar' }}</dd></div></dl></section>
          <details class="detail-card media-library"><summary><span>Archivos</span><small>{{ mediaMessages().length }}</small></summary><div class="media-library-grid">@if (mediaMessages().length === 0) { <p class="no-tags">Sin archivos en esta conversación.</p> }@for (item of mediaMessages(); track item.id) { @if (item.type === 'IMAGE' || item.type === 'STICKER') { <button type="button" class="media-library-item media-library-image" (click)="openMediaPreview(item)" [attr.aria-label]="'Abrir ' + mediaLabel(item.type)"><img [src]="mediaFileUrl(item)" [alt]="mediaLabel(item.type)" loading="lazy"></button> } @else { <a class="media-library-item media-library-file" [href]="mediaFileUrl(item)" target="_blank" rel="noopener"><span>{{ mediaLabel(item.type) }}</span><small>{{ item.body || 'Abrir archivo' }}</small></a> } }</div></details>
          <section class="detail-card contact-block-card"><h2>Bloqueo en WhatsApp</h2>@if (model.conversation.whatsappBlockedAt) { <p class="blocked-contact-status" role="status">Contacto bloqueado en WhatsApp. El equipo no recibirá sus mensajes.</p><button type="button" class="unblock-contact-button" (click)="setContactBlocked(model, false)">Desbloquear contacto</button> } @else { <p>Impide que este número envíe mensajes a tu cuenta de WhatsApp Business. Es distinto de la baja interna.</p><button type="button" class="block-contact-button" (click)="setContactBlocked(model, true)">Bloquear contacto</button> }</section>
          @if (isAdmin && advanced(); as tools) { <section class="detail-card"><h2>Asignación</h2><form [action]="assignUrl(model)" method="post" class="advanced-form"><select name="agentId"><option value="">Sin asignar</option>@for (agent of tools.agents || []; track agent.id) { <option [value]="agent.id" [selected]="model.conversation.assignedUser?.name === agent.name">{{ agent.name }} · {{ agent.status }}</option> }</select><button type="submit">Guardar asignación</button></form></section> }
          <details class="detail-actions">
            <summary>Más acciones</summary>
            <div class="detail-action-list">
          <section class="detail-card"><h2>Nota interna</h2><p class="internal-copy">Solo la ve el equipo; no se envía al cliente.</p><form [action]="localMessageUrl(model)" method="post" class="note-form"><textarea name="body" required maxlength="4000" rows="3" placeholder="Agrega una nota para el equipo"></textarea><button type="submit">Guardar nota</button></form></section>
          <section class="detail-card"><h2>Etiquetas</h2>@if (model.conversation.contact.tags.length === 0) { <p class="no-tags">Sin etiquetas</p> }<div class="tag-list">@for (tag of model.conversation.contact.tags; track tag.id) { <span [style.backgroundColor]="tag.color || '#34836a'">{{ tag.name }}</span> }</div>@if (isAdmin) { <a class="tag-edit-link" [href]="'/panel/admin/contacts/' + model.conversation.contact.id">Editar etiquetas</a> }</section>
          @if (model.conversation.aiHandoffAt || model.conversation.aiPausedAt) { <section class="detail-card ai-note"><h2>Atención de IA</h2>@if (model.conversation.aiHandoffAt) { <p>La IA pidió atención humana.</p>@if (model.conversation.aiHandoffReason) { <small>{{ model.conversation.aiHandoffReason }}</small> } }@if (model.conversation.aiPausedAt) { <p>La IA está pausada en esta conversación.</p> }</section> }
          @if (model.conversation.status === 'OPEN') { <form [action]="closeUrl(model)" method="post"><button class="close-button" type="submit">Cerrar conversación</button></form> }
          @if (isAdmin && model.conversation.status !== 'OPEN') { <form [action]="reopenUrl(model)" method="post"><button class="close-button reopen-button" type="submit">Reabrir conversación</button></form> }
          @if (advanced(); as tools) {
            @if (tools.success) { <p class="advanced-notice">{{ tools.success }}</p> }
            @if (tools.error) { <p class="advanced-error">No se pudo completar la acción ({{ tools.error }}).</p> }
            @if (tools.aiSuggestion) { <section class="detail-card"><h2>Sugerencia de IA</h2><p>{{ tools.aiSuggestion.body }}</p><form [action]="aiUseUrl(model, tools.aiSuggestion.id)" method="post"><button type="submit">Usar sugerencia</button></form><form [action]="aiDiscardUrl(model, tools.aiSuggestion.id)" method="post"><button type="submit">Descartar</button></form></section> }
            <section class="detail-card"><h2>{{ tools.existingLead ? 'Lead vinculado' : 'Crear lead' }}</h2>
              @if (tools.existingLead) { <p>Este contacto ya está registrado como lead. Puedes actualizar sus datos.</p> }
              <form [action]="leadUrl(model)" method="post" class="advanced-form">
                <input name="name" required [value]="tools.existingLead?.name || contactName(model)" placeholder="Nombre">
                <input name="phone" required [value]="tools.existingLead?.phone || model.conversation.contact.phone" placeholder="Teléfono">
                <input name="email" type="email" [value]="tools.existingLead?.email || ''" placeholder="Correo">
                <input name="interest" [value]="tools.existingLead?.interest || ''" placeholder="Interés">
                <textarea name="notes" maxlength="4000" [value]="tools.existingLead?.notes || ''" placeholder="Comentarios sobre la conversación"></textarea>
                <button type="submit">{{ tools.existingLead ? 'Guardar cambios' : 'Guardar lead' }}</button>
              </form>
            </section>
            @if (tools.guidedFlowRun) { <section class="detail-card"><h2>Flujo guiado · {{ tools.guidedFlowRun.flowName }}</h2><p>{{ tools.guidedFlowRun.status === 'ACTIVE' ? 'En curso' : 'Completado' }}</p>@if (tools.guidedFlowRun.pending; as pending) { <p>{{ pending.text }}</p>@for (option of pending.options; track option) { <small>{{ option }} · </small> }<form [action]="guidedFlowApproveUrl(model)" method="post"><button type="submit">Aprobar y enviar</button></form> }@if (tools.guidedFlowRun.status === 'ACTIVE') { <form [action]="guidedFlowEndUrl(model)" method="post"><button type="submit">Terminar flujo</button></form> }</section> }
            @if (tools.aiSettings.enabled) { <section class="detail-card"><h2>Asistencia de IA</h2>@if (model.conversation.aiPausedAt) { <form [action]="aiResumeUrl(model)" method="post"><button type="submit">Reanudar IA</button></form> } @else { <form [action]="aiPauseUrl(model)" method="post"><button type="submit">Pausar IA</button></form> }</section> }
            @if (isAdmin) { <section class="detail-card purge-card"><h2>Zona de riesgo</h2><p>Archiva la conversación para ocultarla de la bandeja, borra solo sus archivos o elimina la conversación definitivamente. Para confirmar el borrado escribe BORRAR.</p>@if (model.conversation.archivedAt) { <form [action]="unarchiveUrl(model)" method="post"><button type="submit" class="secondary-button">Desarchivar conversación</button></form> } @else { <form [action]="archiveUrl(model)" method="post"><button type="submit" class="secondary-button">Archivar conversación</button></form> }<form [action]="clearMediaUrl(model)" method="post" class="advanced-form" (submit)="confirmClearMedia($event)"><button type="submit">Borrar archivos de esta conversación</button></form><form [action]="purgeUrl(model)" method="post" class="advanced-form" (submit)="confirmPurge($event)"><input name="confirm" required autocomplete="off" placeholder="BORRAR"><button type="submit">Borrar todo el chat</button></form><form [action]="deleteConversationUrl(model)" method="post" class="advanced-form" (submit)="confirmDeleteConversation($event)"><input name="confirm" required autocomplete="off" placeholder="BORRAR"><button type="submit">Eliminar conversación definitivamente</button></form></section> }
          }
            </div>
          </details>
        </aside>
      </div>
      @if (mediaPreview(); as preview) {
        <div class="media-lightbox" role="dialog" aria-modal="true" [attr.aria-label]="'Vista previa de ' + preview.label" (click)="onLightboxClick()" (wheel)="onMediaWheel($event)">
          @if (previewImages().length > 1) { <button type="button" class="media-nav media-prev" (click)="$event.stopPropagation(); previousMedia()" aria-label="Imagen anterior">‹</button><button type="button" class="media-nav media-next" (click)="$event.stopPropagation(); nextMedia()" aria-label="Imagen siguiente">›</button> }
          <button type="button" class="media-lightbox-close" (click)="$event.stopPropagation(); closeMediaPreview()" aria-label="Cerrar imagen">×</button>
          <img [src]="preview.url" [alt]="preview.label" [style.transform]="'translate(' + mediaX() + 'px, ' + mediaY() + 'px) scale(' + mediaZoom() + ')'" (click)="$event.stopPropagation()" (dblclick)="$event.stopPropagation(); onMediaDoubleClick()" (pointerdown)="onMediaPointerDown($event)" (pointermove)="onMediaPointerMove($event)" (pointerup)="onMediaPointerUp($event)" (pointercancel)="onMediaPointerUp($event)">
          <div class="media-lightbox-toolbar" (click)="$event.stopPropagation()">
            <button type="button" (click)="zoomOut()" [disabled]="mediaZoom() <= 1" aria-label="Alejar imagen">−</button>
            <button type="button" class="media-zoom-value" (click)="resetZoom()" aria-label="Restablecer zoom">{{ zoomPercent() }}%</button>
            <button type="button" (click)="zoomIn()" [disabled]="mediaZoom() >= 4" aria-label="Acercar imagen">+</button>
          </div>
        </div>
      }
    }
  `,
  styleUrl: './agent-conversation.page.css',
})
export class AgentConversationPage implements OnDestroy {
  protected readonly data = signal<AgentConversationDetail | null>(null);
  protected readonly error = signal('');
  protected readonly operationNotice = signal('');
  protected readonly selectedQuickReply = signal<QuickReply | null>(null);
  protected readonly loading = signal(true);
  protected readonly draft = signal('');
  protected readonly advanced = signal<AdvancedConversationData | null>(null);
  protected readonly showDeleted = signal(false);
  protected readonly recording = signal(false);
  protected readonly recordingSeconds = signal(0);
  protected readonly voicePreviewUrl = signal('');
  protected readonly voiceError = signal('');
  protected readonly sendingVoice = signal(false);
  protected readonly showJumpToLatest = signal(false);
  protected readonly mediaPreview = signal<{ url: string; label: string } | null>(null);
  protected readonly mediaPreviewIndex = signal(0);
  protected readonly mediaZoom = signal(1);
  protected readonly mediaX = signal(0);
  protected readonly mediaY = signal(0);
  protected readonly mediaDragging = signal(false);
  private readonly mediaPointers = new Map<number, { x: number; y: number }>();
  private mediaStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private mediaMoved = false;
  protected readonly listRows = Array.from({ length: 10 }, (_, index) => index);
  protected readonly reactionChoices = ['👍', '❤️', '😂', '😮', '😢', '🙏', ''];
  @ViewChild('thread') private thread?: ElementRef<HTMLDivElement>;
  private readonly id: string;
  protected readonly isAdmin = window.location.pathname.startsWith('/panel/admin/conversations/');
  private readonly socket = window.io?.({ withCredentials: true });
  private connectedBefore = false;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private recordedVoice: Blob | null = null;
  private recordingTimer: number | null = null;
  private recordingStartedAt = 0;
  private discardOnStop = false;
  private typingTimer: number | null = null;
  private lastTypingAt = 0;
  private hasInitialScroll = false;
  private shouldStickToBottom = true;
  private readonly refreshTimer = window.setInterval(() => {
    if (!this.socket?.connected) void this.load(false);
  }, 20000);

  constructor(route: ActivatedRoute) {
    this.id = route.snapshot.paramMap.get('id') || '';
    this.showDeleted.set(new URLSearchParams(window.location.search).get('deleted') === '1');
    this.socket?.on('connect', () => {
      if (this.connectedBefore) void this.load(false);
      this.connectedBefore = true;
    });
    for (const eventName of ['conversation:message', 'conversation:assigned', 'conversation:ai-paused', 'conversation:ai-resumed', 'conversation:ai-handoff']) {
      this.socket?.on(eventName, (payload) => {
        const event = payload as { conversationId?: string } | undefined;
        if (event?.conversationId === this.id) void this.load(false);
      });
    }
    void this.load();
  }

  ngOnDestroy(): void {
    this.closeMediaPreview();
    window.clearInterval(this.refreshTimer);
    if (this.typingTimer !== null) window.clearTimeout(this.typingTimer);
    if (this.recordingTimer !== null) window.clearInterval(this.recordingTimer);
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    if (this.voicePreviewUrl()) URL.revokeObjectURL(this.voicePreviewUrl());
    this.socket?.disconnect();
  }

  protected contactName(model: AgentConversationDetail): string {
    const contact = model.conversation.contact;
    return contact.customName || contact.profileName || contact.phone;
  }

  protected sharedContactCards(body: string | null): SharedContactCard[] {
    if (!body) return [];

    return body.split(/\n\s*\n/).map((block, index) => {
      const fields = block.split('\n').map((line) => {
        const separator = line.indexOf(':');
        return separator < 0
          ? null
          : { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
      }).filter((field): field is { label: string; value: string } => Boolean(field?.value));
      const name = fields.find((field) => field.label === 'Nombre')?.value
        || fields.find((field) => field.label.startsWith('Contacto'))?.label
        || (fields.length ? `Contacto ${index + 1}` : '');

      return { name, fields: fields.filter((field) => field.label !== 'Nombre' && !field.label.startsWith('Contacto')) };
    }).filter((contact) => contact.name || contact.fields.length);
  }

  protected initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  protected useQuickReply(reply: QuickReply): void {
    if (reply.type === 'TEXT') { this.draft.set(reply.body); this.selectedQuickReply.set(null); return; }
    if (reply.type === 'LIST' && this.data() && !this.data()?.interactiveListsEnabled) { this.operationNotice.set('Las listas interactivas están desactivadas para este espacio.'); return; }
    this.operationNotice.set('');
    this.selectedQuickReply.set(reply);
  }
  protected setDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.signalTyping();
  }
  protected async react(model: AgentConversationDetail, message: ConversationMessage, emoji: string): Promise<void> {
    if (!message.wamid) return;
    try {
      const response = await fetch(`${this.routeBase()}/${encodeURIComponent(model.conversation.id)}/reactions`, {
        method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.wamid, emoji }),
      });
      if (!response.ok) throw new Error('No se pudo enviar la reacción.');
      this.operationNotice.set(emoji ? `Reacción ${emoji} enviada.` : 'Reacción retirada.');
    } catch (reason) {
      this.operationNotice.set(reason instanceof Error ? reason.message : 'No se pudo enviar la reacción.');
    }
  }
  protected async setContactBlocked(model: AgentConversationDetail, blocked: boolean): Promise<void> {
    const action = blocked ? 'bloquear' : 'desbloquear';
    if (blocked && !window.confirm(`¿Bloquear a ${this.contactName(model)} en WhatsApp? Ya no podrá enviar mensajes a este número.`)) return;
    try {
      const response = await fetch(`${this.routeBase()}/${encodeURIComponent(model.conversation.id)}/block`, {
        method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `No se pudo ${action} al contacto.`);
      await this.load(false);
      this.operationNotice.set(blocked ? 'Contacto bloqueado en WhatsApp.' : 'Contacto desbloqueado en WhatsApp.');
    } catch (reason) {
      this.operationNotice.set(reason instanceof Error ? reason.message : `No se pudo ${action} al contacto.`);
    }
  }
  protected async removeRemoteMedia(message: ConversationMessage): Promise<void> {
    if (!message.mediaId || !window.confirm('Se eliminará el archivo de Meta y su copia guardada en Margarita. Esta acción no se puede deshacer. ¿Continuar?')) return;
    try {
      const response = await fetch(`/admin/whatsapp/media/${encodeURIComponent(message.mediaId)}`, { method: 'DELETE', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el archivo.');
      this.operationNotice.set('Archivo eliminado de Meta y de la copia local.');
      await this.load(false);
    } catch (reason) {
      this.operationNotice.set(reason instanceof Error ? reason.message : 'No se pudo eliminar el archivo.');
    }
  }
  protected onThreadScroll(event: Event): void {
    const element = event.target as HTMLDivElement;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    this.shouldStickToBottom = atBottom;
    this.showJumpToLatest.set(!atBottom && element.scrollHeight > element.clientHeight + 80);
  }
  protected jumpToLatest(): void {
    const thread = this.thread?.nativeElement;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  }
  protected formatRecordingTime(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

  protected async startVoiceRecording(): Promise<void> {
    this.voiceError.set('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.voiceError.set('Este navegador no permite grabar audio. Puedes adjuntar una grabación desde tu dispositivo.');
      return;
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const supportedTypes = [
        'audio/mp4;codecs="mp4a.40.2"',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus'
      ];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000
      });
      this.recordedChunks = [];
      this.discardOnStop = false;
      this.recordingStartedAt = Date.now();
      this.recordingSeconds.set(0);
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) this.recordedChunks.push(event.data);
      };
      this.mediaRecorder.onerror = () => {
        this.voiceError.set('No se pudo grabar el audio. Revisa el permiso del micrófono e inténtalo de nuevo.');
        this.mediaStream?.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
        this.recording.set(false);
      };
      this.mediaRecorder.onstop = () => this.finishVoiceRecording();
      this.mediaRecorder.start(250);
      this.recording.set(true);
      this.recordingTimer = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartedAt) / 1000);
        this.recordingSeconds.set(elapsed);
        if (elapsed >= 180) this.stopVoiceRecording();
      }, 1000);
    } catch (reason: unknown) {
      this.mediaStream?.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
      const name = reason instanceof DOMException ? reason.name : '';
      this.voiceError.set(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Permite el acceso al micrófono en el navegador para grabar una nota de voz.'
        : 'No se pudo iniciar el micrófono. Revisa sus permisos e inténtalo de nuevo.');
    }
  }

  protected stopVoiceRecording(): void {
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
  }

  protected discardVoiceRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.discardOnStop = true;
      this.mediaRecorder.stop();
    }
    this.clearVoicePreview();
    this.voiceError.set('');
  }

  protected async sendVoiceNote(model: AgentConversationDetail): Promise<void> {
    const blob = this.recordedVoice;
    if (!blob?.size) {
      this.voiceError.set('No hay una grabación lista para enviar.');
      return;
    }
    const mimeType = blob.type.split(';')[0].toLowerCase();
    const extension = mimeType === 'audio/mp4' ? 'm4a' : mimeType === 'audio/ogg' ? 'ogg' : 'webm';
    const formData = new FormData();
    formData.append('file', new File([blob], `nota-de-voz.${extension}`, { type: blob.type || 'audio/webm' }));
    formData.append('voiceNote', 'true');
    this.sendingVoice.set(true);
    this.voiceError.set('');
    try {
      const response = await fetch(this.mediaUrl(model), { method: 'POST', body: formData, credentials: 'same-origin' });
      const finalUrl = new URL(response.url, window.location.origin);
      const error = finalUrl.searchParams.get('error');
      if (!response.ok || error === 'media') {
        this.voiceError.set(finalUrl.searchParams.get('detail') || 'No se pudo enviar el audio.');
        return;
      }
      this.clearVoicePreview();
      await this.load(false);
    } catch {
      this.voiceError.set('No se pudo completar el envío. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      this.sendingVoice.set(false);
    }
  }

  private finishVoiceRecording(): void {
    this.recording.set(false);
    if (this.recordingTimer !== null) window.clearInterval(this.recordingTimer);
    this.recordingTimer = null;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    if (this.discardOnStop) {
      this.discardOnStop = false;
      this.recordedChunks = [];
      return;
    }
    const type = this.mediaRecorder?.mimeType || this.recordedChunks[0]?.type || 'audio/webm';
    const blob = new Blob(this.recordedChunks, { type });
    if (!blob.size) {
      this.voiceError.set('La grabación quedó vacía. Inténtalo de nuevo.');
      return;
    }
    this.clearVoicePreview();
    this.recordedVoice = blob;
    this.voicePreviewUrl.set(URL.createObjectURL(blob));
  }

  private clearVoicePreview(): void {
    if (this.voicePreviewUrl()) URL.revokeObjectURL(this.voicePreviewUrl());
    this.voicePreviewUrl.set('');
    this.recordedChunks = [];
    this.recordedVoice = null;
  }
  protected listUrl(): string { return this.isAdmin ? '/panel/admin/conversations' : '/panel/agent/conversations'; }
  protected messageUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/messages/free-text`; }
  protected localMessageUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/messages/local`; }
  protected deleteUrl(model: AgentConversationDetail, message: ConversationMessage): string { return `${this.routeBase()}/${model.conversation.id}/messages/${message.id}/delete`; }
  protected restoreUrl(model: AgentConversationDetail, message: ConversationMessage): string { return `/admin/conversations/${model.conversation.id}/messages/${message.id}/restore`; }
  protected mediaUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/messages/media`; }
  protected mediaFileUrl(message: ConversationMessage): string { return `/media/${encodeURIComponent(message.id)}`; }
  protected mediaMessages(): ConversationMessage[] {
    return (this.data()?.conversation.messages || []).filter((message) => Boolean(message.mediaId) && !message.deletedAt);
  }
  protected previewImages(): ConversationMessage[] {
    return this.mediaMessages().filter((message) => message.type === 'IMAGE' || message.type === 'STICKER');
  }
  protected openMediaPreview(message: ConversationMessage): void {
    const images = this.previewImages();
    const index = images.findIndex(({ id }) => id === message.id);
    this.resetZoom();
    this.mediaPreviewIndex.set(index >= 0 ? index : 0);
    this.mediaPreview.set({ url: this.mediaFileUrl(message), label: this.mediaLabel(message.type) });
    document.body.classList.add('media-preview-open');
  }
  protected previousMedia(): void {
    const images = this.previewImages();
    if (images.length < 2) return;
    const next = (this.mediaPreviewIndex() - 1 + images.length) % images.length;
    this.openMediaPreview(images[next]);
  }
  protected nextMedia(): void {
    const images = this.previewImages();
    if (images.length < 2) return;
    const next = (this.mediaPreviewIndex() + 1) % images.length;
    this.openMediaPreview(images[next]);
  }
  protected closeMediaPreview(): void {
    this.mediaPreview.set(null);
    this.mediaPreviewIndex.set(0);
    this.resetZoom();
    this.mediaPointers.clear();
    this.mediaDragging.set(false);
    document.body.classList.remove('media-preview-open');
  }
  protected zoomPercent(): number { return Math.round(this.mediaZoom() * 100); }
  protected zoomIn(): void { this.setMediaZoom(this.mediaZoom() * 1.25); }
  protected zoomOut(): void { this.setMediaZoom(this.mediaZoom() / 1.25); }
  protected resetZoom(): void { this.mediaZoom.set(1); this.mediaX.set(0); this.mediaY.set(0); this.mediaMoved = false; }
  private setMediaZoom(value: number): void {
    const zoom = Math.min(4, Math.max(1, value));
    this.mediaZoom.set(zoom);
    if (zoom === 1) { this.mediaX.set(0); this.mediaY.set(0); }
  }
  protected onLightboxClick(): void {
    if (this.mediaMoved) { this.mediaMoved = false; return; }
    this.closeMediaPreview();
  }
  protected onMediaWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY < 0) this.zoomIn(); else this.zoomOut();
  }
  protected onMediaDoubleClick(): void {
    if (this.mediaZoom() > 1) this.resetZoom(); else { this.mediaZoom.set(2); this.mediaX.set(0); this.mediaY.set(0); }
  }
  protected onMediaPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.mediaPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.mediaMoved = false;
    if (this.mediaPointers.size === 1) {
      this.mediaStart = { x: event.clientX, y: event.clientY, offsetX: this.mediaX(), offsetY: this.mediaY() };
      this.mediaDragging.set(this.mediaZoom() > 1);
    } else if (this.mediaPointers.size === 2) {
      this.pinchStartDistance = this.pointerDistance();
      this.pinchStartZoom = this.mediaZoom();
      this.mediaDragging.set(true);
    }
  }
  protected onMediaPointerMove(event: PointerEvent): void {
    if (!this.mediaPointers.has(event.pointerId)) return;
    this.mediaPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.mediaPointers.size === 2) {
      const distance = this.pointerDistance();
      if (this.pinchStartDistance > 0) this.setMediaZoom(this.pinchStartZoom * (distance / this.pinchStartDistance));
      this.mediaMoved = true;
      return;
    }
    if (this.mediaZoom() <= 1) return;
    const dx = event.clientX - this.mediaStart.x;
    const dy = event.clientY - this.mediaStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.mediaMoved = true;
    this.mediaX.set(this.mediaStart.offsetX + dx);
    this.mediaY.set(this.mediaStart.offsetY + dy);
  }
  protected onMediaPointerUp(event: PointerEvent): void {
    this.mediaPointers.delete(event.pointerId);
    if (this.mediaPointers.size === 0) this.mediaDragging.set(false);
  }
  private pointerDistance(): number {
    const points = [...this.mediaPointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
  @HostListener('document:keydown.escape')
  protected onEscape(): void { this.closeMediaPreview(); }
  protected templateUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/messages/template`; }
  protected interactiveUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/messages/interactive`; }
  protected interactiveListUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/messages/interactive-list`; }
  protected assignUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/assign`; }
  protected leadUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/lead`; }
  protected guidedFlowEndUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/guided-flow/end`; }
  protected guidedFlowApproveUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/guided-flow/approve`; }
  protected aiPauseUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/ai-pause`; }
  protected aiResumeUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/ai-resume`; }
  protected aiUseUrl(model: AgentConversationDetail, suggestionId: string): string { return `${this.routeBase()}/${model.conversation.id}/ai/${suggestionId}/use`; }
  protected aiDiscardUrl(model: AgentConversationDetail, suggestionId: string): string { return `${this.routeBase()}/${model.conversation.id}/ai/${suggestionId}/discard`; }
  protected closeUrl(model: AgentConversationDetail): string { return `${this.routeBase()}/${model.conversation.id}/close`; }
  protected reopenUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/reopen`; }
  protected purgeUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/purge`; }
  protected archiveUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/archive`; }
  protected unarchiveUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/unarchive`; }
  protected clearMediaUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/media/clear`; }
  protected deleteConversationUrl(model: AgentConversationDetail): string { return `/admin/conversations/${model.conversation.id}/delete`; }
  protected isPlaceholder(body: string): boolean { return body.startsWith('[') && body.endsWith(']'); }
  protected mediaLabel(type: string): string { return ({ IMAGE: 'Imagen', VIDEO: 'Video', AUDIO: 'Audio', DOCUMENT: 'Documento', CONTACT: 'Contacto' } as Record<string, string>)[type] || 'Archivo'; }
  protected tick(status: string): string { return ({ CREATED: '🕓', SENDING: '🕓', SENT: '✓', DELIVERED: '✓✓', READ: '✓✓', FAILED: '⚠' } as Record<string, string>)[status] || '🕓'; }

  protected dateLabel(value: string, timezone: string): string {
    const date = new Date(value);
    return `${date.toLocaleDateString('es-MX', { timeZone: timezone, day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}`;
  }

  protected toggleDeleted(event: Event): void {
    this.showDeleted.set((event.target as HTMLInputElement).checked);
    const query = this.showDeleted() ? '?deleted=1' : '';
    window.history.replaceState({}, '', `${window.location.pathname}${query}`);
    void this.load(false);
  }

  protected confirmPurge(event: Event): void {
    if (!window.confirm('Se eliminarán definitivamente todos los mensajes de esta conversación. ¿Continuar?')) event.preventDefault();
  }
  protected confirmClearMedia(event: Event): void {
    if (!window.confirm('Se borrarán los archivos de esta conversación; los mensajes se conservan. ¿Continuar?')) event.preventDefault();
  }
  protected confirmDeleteConversation(event: Event): void {
    if (!window.confirm('Se eliminará la conversación y todos sus mensajes. Esta acción no se puede deshacer. ¿Continuar?')) event.preventDefault();
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    let scrollToLatest = false;
    try {
      const deletedQuery = this.isAdmin && this.showDeleted() ? '?deleted=1' : '';
      const response = await fetch(`${this.routeBase()}/${encodeURIComponent(this.id)}/data${deletedQuery}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 404) throw new Error('La conversación no existe o no tienes acceso.');
      if (!response.ok) throw new Error('No se pudo cargar la conversación.');
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció. Inicia sesión para continuar.');
      const result = await response.json() as AgentConversationDetail;
      scrollToLatest = !this.hasInitialScroll || this.shouldStickToBottom;
      this.data.set(result);
      this.hasInitialScroll = true;
      const advancedResponse = await fetch(`${this.routeBase()}/${encodeURIComponent(this.id)}/legacy${deletedQuery}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (advancedResponse.ok && (advancedResponse.headers.get('content-type') || '').includes('application/json')) this.advanced.set(await advancedResponse.json() as AdvancedConversationData);
      this.error.set('');
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally {
      this.loading.set(false);
      if (scrollToLatest) this.scheduleScrollToLatest();
    }
  }

  private scheduleScrollToLatest(): void {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const thread = this.thread?.nativeElement;
      if (!thread) return;
      thread.scrollTop = thread.scrollHeight;
      this.shouldStickToBottom = true;
      this.showJumpToLatest.set(false);
    }));
  }

  private routeBase(): string { return this.isAdmin ? '/admin/conversations' : '/agent/conversations'; }
  private signalTyping(): void {
    if (!this.draft().trim() || this.typingTimer !== null || Date.now() - this.lastTypingAt < 8000) return;
    this.typingTimer = window.setTimeout(() => {
      this.typingTimer = null;
      this.lastTypingAt = Date.now();
      void fetch(`${this.routeBase()}/${encodeURIComponent(this.id)}/typing`, {
        method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: '{}',
      }).then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          this.operationNotice.set(`No se pudo mostrar «escribiendo…»${result.error ? ` (${result.error})` : ''}.`);
        }
      }).catch(() => this.operationNotice.set('No se pudo conectar para mostrar «escribiendo…».'));
    }, 350);
  }
}
