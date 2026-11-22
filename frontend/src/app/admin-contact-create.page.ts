import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';

interface TagOption { id: string; name: string; color: string }

@Component({
  selector: 'app-admin-contact-create-page',
  standalone: true,
  template: `
    <header class="create-heading"><a href="/panel/admin/contacts">← Contactos</a><p class="contacts-eyebrow">DIRECTORIO</p><h1>Nuevo contacto</h1><p>Agrega a la cartera y asigna sus etiquetas.</p></header>
    @if (error()) { <div class="create-error" role="alert">{{ error() }}</div> }
    <form class="create-card" (submit)="submit($event)">
      <label>Nombre <input name="customName" maxlength="100" required [value]="name()" (input)="name.set(($any($event.target)).value)"></label>
      <label>Teléfono de WhatsApp <input name="phone" type="tel" autocomplete="tel" placeholder="5215512345678" required [value]="phone()" (input)="phone.set(($any($event.target)).value)"><small>Incluye código de país, por ejemplo 52 para México.</small></label>
      <label>Notas <textarea name="notes" rows="4" maxlength="2000" [value]="notes()" (input)="notes.set(($any($event.target)).value)"></textarea></label>
      <fieldset><legend>Etiquetas</legend><div class="create-tags">@for (tag of tags(); track tag.id) { <label><input type="checkbox" [checked]="selected().has(tag.id)" (change)="toggleTag(tag.id, $event)"><span [style.border-color]="tag.color">{{ tag.name }}</span></label> } @empty { <small>No hay etiquetas disponibles.</small> }</div></fieldset>
      <footer><a href="/panel/admin/contacts">Cancelar</a><button type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar contacto' }}</button></footer>
    </form>
  `,
  styleUrl: './admin-contact-create.page.css'
})
export class AdminContactCreatePage {
  protected readonly tags = signal<TagOption[]>([]);
  protected readonly selected = signal(new Set<string>());
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly notes = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  constructor(private readonly router: Router) {
    void fetch('/admin/contacts/new', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('No pudimos cargar las etiquetas.');
        const result = await response.json() as { tags: TagOption[] };
        this.tags.set(result.tags);
      })
      .catch((reason: unknown) => this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error.'));
  }

  protected toggleTag(id: string, event: Event): void {
    const next = new Set(this.selected());
    if ((event.target as HTMLInputElement).checked) next.add(id); else next.delete(id);
    this.selected.set(next);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.saving.set(true);
    this.error.set('');
    try {
      const response = await fetch('/admin/contacts', {
        method: 'POST', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ customName: this.name(), phone: this.phone(), notes: this.notes(), tagIds: [...this.selected()] })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el contacto.');
      await this.router.navigateByUrl('/panel/admin/contacts');
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.');
    } finally { this.saving.set(false); }
  }
}
