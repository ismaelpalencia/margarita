import { Component, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface ShellNumber {
  id: string;
  displayName: string | null;
  phoneNumber: string;
}

interface ShellData {
  role: string;
  activeNumberId: string | null;
  numbers: ShellNumber[];
  unreadTotal: number;
  unassignedCount: number;
}

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly isAgent = window.location.pathname.startsWith('/panel/agent');
  protected readonly isPublic = window.location.pathname === '/panel/login';
  protected readonly pageName = this.resolvePageName(window.location.pathname);
  protected readonly shell = signal<ShellData | null>(null);
  protected readonly unreadTotal = computed(() => this.shell()?.unreadTotal ?? 0);
  protected readonly unassignedCount = computed(() => this.shell()?.unassignedCount ?? 0);

  constructor() {
    if (!this.isPublic) void this.loadShell();
  }

  private async loadShell(): Promise<void> {
    try {
      const response = await fetch('/panel/shell', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      this.shell.set(await response.json() as ShellData);
    } catch {
      /** Si el armazón falla, la página sigue sin contadores. */
    }
  }

  protected switchNumber(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const form = select.form;
    if (!form) return;
    const redirect = form.querySelector('input[name="redirectTo"]') as HTMLInputElement | null;
    if (redirect) redirect.value = window.location.pathname + window.location.search;
    form.submit();
  }

  private resolvePageName(path: string): string {
    if (path.includes('/conversations')) return 'Conversaciones';
    if (path.includes('/contacts')) return 'Contactos';
    if (path.includes('/campaigns')) return 'Campañas';
    if (path.includes('/reports')) return 'Reportes';
    if (path.includes('/quick-replies')) return 'Respuestas rápidas';
    if (path.includes('/sessions')) return 'Sesiones';
    if (path.includes('/whatsapp')) return 'WhatsApp';
    if (path.includes('/backup')) return 'Respaldos';
    if (path.includes('/system')) return 'Sistema';
    if (path.includes('/service-metrics')) return 'Servicio';
    if (path.includes('/logs')) return 'Bitácora';
    if (path.includes('/leads')) return 'Leads';
    if (path.includes('/ai')) return 'IA';
    if (path.includes('/tags')) return 'Etiquetas';
    if (path.includes('/templates')) return 'Plantillas';
    if (path.includes('/hours')) return 'Horarios';
    if (path.includes('/guide')) return 'Guía';
    if (path.includes('/users')) return 'Equipo';
    if (path.includes('/account')) return 'Mi cuenta';
    if (path.includes('/dashboard') || path === '/panel') return this.isAgent ? 'Mi resumen' : 'Resumen';
    return 'Panel';
  }
}
