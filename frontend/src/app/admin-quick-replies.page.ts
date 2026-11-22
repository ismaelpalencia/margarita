import { Component, signal } from '@angular/core';

interface QuickReply { id: string; title: string; body: string; isActive: boolean; updatedAt: string }
interface QuickRepliesResponse { quickReplies: QuickReply[] }

@Component({
  selector: 'app-admin-quick-replies-page', standalone: true,
  template: `
    @if (loading()) { <div class="quick-loading">Cargando respuestas…</div> }
    @else if (error() && !replies().length) { <section class="quick-error"><h1>No pudimos cargar las respuestas</h1><p>{{ error() }}</p><a href="/auth/login">Iniciar sesión</a></section> }
    @else {
      <header class="quick-heading"><div><p class="quick-eyebrow">HERRAMIENTAS DEL EQUIPO</p><h1>Respuestas rápidas</h1><p>Guarda mensajes frecuentes para insertarlos en una conversación con un clic.</p></div><button class="quick-primary" (click)="startCreate()">＋ Nueva respuesta</button></header>
      @if (error()) { <div class="quick-alert" role="alert">{{ error() }}</div> } @if (success()) { <div class="quick-success">{{ success() }}</div> }
      @if (mode() !== 'closed') { <form class="quick-editor" (submit)="save($event)"><header><div><h2>{{ mode() === 'new' ? 'Nueva respuesta' : 'Editar respuesta' }}</h2><p>Título: hasta 60 caracteres. Texto: hasta 2,000.</p></div><button type="button" class="quick-close" (click)="closeEditor()" aria-label="Cerrar">×</button></header><label>Título<input required minlength="2" maxlength="60" [value]="title()" (input)="title.set(($any($event.target)).value)" placeholder="Ej. Solicitar comprobante"></label><label>Respuesta<textarea required minlength="2" maxlength="2000" rows="5" [value]="body()" (input)="body.set(($any($event.target)).value)" placeholder="Escribe el mensaje para el cliente"></textarea></label><footer><button type="button" class="quick-secondary" (click)="closeEditor()">Cancelar</button><button type="submit" class="quick-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar respuesta' }}</button></footer></form> }
      <section class="quick-card"><header><h2>Respuestas guardadas <span>{{ replies().length }}</span></h2><a href="/panel/admin/quick-replies" (click)="$event.preventDefault(); load()">Actualizar</a></header>
        @if (!replies().length) { <div class="quick-empty"><strong>Aún no hay respuestas rápidas</strong><p>Crea una respuesta para que el equipo pueda insertarla en los chats.</p></div> }
        @for (reply of replies(); track reply.id) { <article class="quick-row" [class.inactive]="!reply.isActive"><div class="quick-copy"><div class="quick-title"><strong>{{ reply.title }}</strong><span [class.enabled]="reply.isActive">{{ reply.isActive ? 'Activa' : 'Inactiva' }}</span></div><p>{{ reply.body }}</p></div><div class="quick-actions"><button type="button" (click)="edit(reply)">Editar</button><button type="button" (click)="toggle(reply)">{{ reply.isActive ? 'Desactivar' : 'Activar' }}</button></div></article> }
      </section>
    }
  `,
  styleUrl: './admin-quick-replies.page.css'
})
export class AdminQuickRepliesPage {
  protected readonly replies = signal<QuickReply[]>([]); protected readonly loading = signal(true); protected readonly saving = signal(false);
  protected readonly error = signal(''); protected readonly success = signal(''); protected readonly mode = signal<'closed' | 'new' | 'edit'>('closed');
  protected readonly title = signal(''); protected readonly body = signal(''); private editingId = '';
  constructor() { void this.load(); }
  protected async load(): Promise<void> { this.loading.set(true); try { const response = await fetch('/admin/quick-replies', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció o no tienes permiso para consultar respuestas.'); const result = await response.json() as QuickRepliesResponse; this.replies.set(result.quickReplies); this.error.set(''); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
  protected startCreate(): void { this.editingId = ''; this.title.set(''); this.body.set(''); this.mode.set('new'); this.error.set(''); this.success.set(''); }
  protected closeEditor(): void { this.mode.set('closed'); this.editingId = ''; this.error.set(''); }
  protected async edit(reply: QuickReply): Promise<void> { this.error.set(''); try { const response = await fetch(`/admin/quick-replies/${encodeURIComponent(reply.id)}/edit`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as { quickReply?: QuickReply; error?: string }; if (!response.ok || !result.quickReply) throw new Error(result.error || 'No se encontró la respuesta.'); this.editingId = reply.id; this.title.set(result.quickReply.title); this.body.set(result.quickReply.body); this.mode.set('edit'); this.success.set(''); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } }
  protected async save(event: Event): Promise<void> { event.preventDefault(); this.saving.set(true); this.error.set(''); this.success.set(''); const editing = this.mode() === 'edit'; try { const response = await fetch(editing ? `/admin/quick-replies/${encodeURIComponent(this.editingId)}` : '/admin/quick-replies', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: this.title(), body: this.body() }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo guardar la respuesta.'); this.mode.set('closed'); this.success.set(editing ? 'Respuesta actualizada.' : 'Respuesta creada.'); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); } }
  protected async toggle(reply: QuickReply): Promise<void> { this.error.set(''); this.success.set(''); try { const response = await fetch(`/admin/quick-replies/${encodeURIComponent(reply.id)}/active`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !reply.isActive }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el estado.'); this.success.set(reply.isActive ? 'Respuesta desactivada.' : 'Respuesta activada.'); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } }
}
