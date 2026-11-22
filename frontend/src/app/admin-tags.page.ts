import { Component, signal } from '@angular/core';

interface Tag { id: string; name: string; color: string | null; createdAt?: string }
interface TagsResponse { tags: Tag[] }

@Component({
  selector: 'app-admin-tags-page', standalone: true,
  template: `
    @if (loading()) { <div class="tags-loading">Cargando etiquetas…</div> }
    @else if (error() && !tags().length) { <section class="tags-error" role="alert"><h1>No pudimos cargar las etiquetas</h1><p>{{ error() }}</p><a href="/auth/login">Iniciar sesión</a></section> }
    @else {
      <header class="tags-heading"><div><p class="tags-eyebrow">ORGANIZACIÓN</p><h1>Etiquetas</h1><p>Clasifica contactos y encuentra grupos de trabajo con facilidad.</p></div><button class="tags-primary" (click)="startCreate()">＋ Nueva etiqueta</button></header>
      @if (error()) { <div class="tags-error-banner" role="alert">{{ error() }}</div> }
      @if (success()) { <div class="tags-success">{{ success() }}</div> }
      @if (mode() !== 'closed') {
        <form class="tag-editor" (submit)="save($event)"><div class="tag-editor-heading"><div><h2>{{ mode() === 'new' ? 'Crear etiqueta' : 'Editar etiqueta' }}</h2><p>El nombre debe tener al menos dos caracteres.</p></div><button type="button" class="icon-close" aria-label="Cerrar formulario" (click)="closeEditor()">×</button></div>
          <label>Nombre<input name="name" required minlength="2" maxlength="80" [value]="name()" (input)="name.set(($any($event.target)).value)" placeholder="Ej. Prioridad alta"></label>
          <label>Color <span class="color-input"><input name="color" type="color" [value]="color()" (input)="color.set(($any($event.target)).value)"><code>{{ color() }}</code></span></label>
          <footer><button type="button" class="tags-secondary" (click)="closeEditor()">Cancelar</button><button type="submit" class="tags-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar etiqueta' }}</button></footer>
        </form>
      }
      <section class="tags-card"><header><h2>Etiquetas activas <span>{{ tags().length }}</span></h2><a href="/panel/admin/tags" (click)="$event.preventDefault(); load()">Actualizar</a></header>
        @if (!tags().length) { <div class="tags-empty"><strong>Aún no hay etiquetas</strong><p>Crea la primera para organizar tus contactos.</p></div> }
        @for (tag of tags(); track tag.id) { <article class="tag-row"><span class="tag-color" [style.backgroundColor]="tag.color || '#1fa06a'"></span><strong>{{ tag.name }}</strong><code>{{ tag.color || '#1fa06a' }}</code><span class="tag-actions"><button type="button" (click)="edit(tag)">Editar</button><button type="button" class="tag-delete" (click)="deactivate(tag)">Archivar</button></span></article> }
      </section>
    }
  `,
  styleUrl: './admin-tags.page.css'
})
export class AdminTagsPage {
  protected readonly tags = signal<Tag[]>([]); protected readonly loading = signal(true); protected readonly saving = signal(false);
  protected readonly error = signal(''); protected readonly success = signal(''); protected readonly mode = signal<'closed' | 'new' | 'edit'>('closed');
  protected readonly name = signal(''); protected readonly color = signal('#1fa06a'); private editingId = '';
  constructor() { void this.load(); }
  protected async load(): Promise<void> { this.loading.set(true); this.error.set(''); try { const response = await fetch('/admin/tags', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció o no tienes permiso para consultar etiquetas.'); const result = await response.json() as TagsResponse; this.tags.set(result.tags); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
  protected startCreate(): void { this.editingId = ''; this.name.set(''); this.color.set('#1fa06a'); this.mode.set('new'); this.error.set(''); this.success.set(''); }
  protected closeEditor(): void { this.mode.set('closed'); this.editingId = ''; this.error.set(''); }
  protected async edit(tag: Tag): Promise<void> { this.error.set(''); try { const response = await fetch(`/admin/tags/${encodeURIComponent(tag.id)}/edit`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as { tag?: Tag; error?: string }; if (!response.ok || !result.tag) throw new Error(result.error || 'No se encontró la etiqueta.'); this.editingId = tag.id; this.name.set(result.tag.name); this.color.set(result.tag.color || '#1fa06a'); this.mode.set('edit'); this.success.set(''); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo abrir la etiqueta.'); } }
  protected async save(event: Event): Promise<void> { event.preventDefault(); this.saving.set(true); this.error.set(''); this.success.set(''); try { const editing = this.mode() === 'edit'; const response = await fetch(editing ? `/admin/tags/${encodeURIComponent(this.editingId)}` : '/admin/tags', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: this.name(), color: this.color() }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo guardar.'); this.mode.set('closed'); this.success.set(editing ? 'Etiqueta actualizada.' : 'Etiqueta creada.'); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); } }
  protected async deactivate(tag: Tag): Promise<void> { if (!window.confirm(`¿Archivar la etiqueta «${tag.name}»?`)) return; this.error.set(''); this.success.set(''); try { const response = await fetch(`/admin/tags/${encodeURIComponent(tag.id)}/deactivate`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo archivar la etiqueta.'); this.success.set('Etiqueta archivada.'); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } }
}
