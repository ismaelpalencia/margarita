import { Component, signal } from '@angular/core';

interface SessionView { tokenId: string; userId: string; userName?: string; userEmail?: string; role?: string; device: string; ip: string | null; createdAt: string; lastSeenAt: string | null; isCurrent: boolean }
interface SessionsResponse { sessions: SessionView[]; idleHours: number; maxActive: number; timezone: string }

@Component({
  selector: 'app-sessions-page', standalone: true,
  template: `
    @if (loading()) { <div class="sessions-loading">Cargando sesiones…</div> }
    @else if (error() && !data()) { <section class="sessions-error"><h1>No pudimos cargar las sesiones</h1><p>{{ error() }}</p><a href="/panel/login">Iniciar sesión</a></section> }
    @else if (data(); as model) {
      <header class="sessions-heading"><div><p class="sessions-eyebrow">SEGURIDAD</p><h1>{{ isAdmin ? 'Sesiones activas' : 'Mis sesiones' }}</h1><p>{{ isAdmin ? 'Revisa desde qué dispositivos ha entrado el equipo y cierra sesiones que no reconozcas.' : 'Revisa los dispositivos con sesión abierta y cierra los que no reconozcas.' }} Las sesiones se cierran tras {{ model.idleHours }} horas sin actividad y cada usuario puede mantener hasta {{ model.maxActive }} activas.</p></div></header>
      @if (error()) { <div class="sessions-error-banner" role="alert">{{ error() }}</div> } @if (success()) { <div class="sessions-success">{{ success() }}</div> }
      <div class="sessions-toolbar"><button type="button" class="sessions-revoke-others" (click)="revokeOthers()" [disabled]="saving()">Cerrar mis otras sesiones</button><span>Úsalo si viste una sesión que no reconoces.</span><button type="button" class="sessions-refresh" (click)="load()">Actualizar</button></div>
      <section class="sessions-card"><div class="sessions-table-wrap"><table><thead><tr>@if (isAdmin) { <th>Usuario</th> }<th>Dispositivo</th><th>IP</th><th>Última actividad</th><th>Entró</th><th>Acciones</th></tr></thead><tbody>
        @if (!model.sessions.length) { <tr><td [attr.colspan]="isAdmin ? 6 : 5" class="sessions-empty">No hay sesiones activas.</td></tr> }
        @for (session of model.sessions; track session.tokenId) { <tr [class.current-session]="session.isCurrent">@if (isAdmin) { <td><strong>{{ session.userName }}</strong><small>{{ session.userEmail }}</small></td> }<td><strong>{{ session.device }}</strong>@if (session.isCurrent) { <span class="current-pill">Esta sesión</span> }</td><td>{{ session.ip || '—' }}</td><td>{{ dateLabel(session.lastSeenAt || session.createdAt, model.timezone) }}</td><td>{{ dateLabel(session.createdAt, model.timezone) }}</td><td>@if (session.isCurrent) { <small>Usa «Salir» para cerrar</small> } @else { <button type="button" class="session-revoke" (click)="revoke(session)" [disabled]="saving()">Cerrar sesión</button> }</td></tr> }
      </tbody></table></div></section>
    }
  `,
  styleUrl: './sessions.page.css'
})
export class SessionsPage {
  protected readonly isAdmin = window.location.pathname.startsWith('/panel/admin/sessions');
  protected readonly data = signal<SessionsResponse | null>(null); protected readonly loading = signal(true); protected readonly saving = signal(false);
  protected readonly error = signal(''); protected readonly success = signal(''); private readonly basePath: string;
  constructor() { this.basePath = this.isAdmin ? '/admin/sessions' : '/agent/sessions'; void this.load(); }
  protected dateLabel(value: string, timezone: string): string { const date = new Date(value); return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(date); }
  protected async load(): Promise<void> { this.loading.set(true); this.error.set(''); try { const response = await fetch(this.basePath, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('La sesión venció o no tienes permiso para consultar esta lista.'); this.data.set(await response.json() as SessionsResponse); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
  protected async revoke(session: SessionView): Promise<void> { if (!window.confirm(`¿Cerrar la sesión de ${session.userName || 'este dispositivo'}? Tendrá que volver a entrar.`)) return; await this.run(async () => { const response = await fetch(`${this.basePath}/revoke`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenId: session.tokenId }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error === 'current' ? 'Esa es tu sesión actual. Usa «Salir» para cerrarla.' : 'No se pudo cerrar esa sesión.'); }); }
  protected async revokeOthers(): Promise<void> { if (!window.confirm('¿Cerrar todas tus otras sesiones?')) return; await this.run(async () => { const response = await fetch(`${this.basePath}/revoke-others`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error('No se pudieron cerrar las otras sesiones.'); const result = await response.json() as { closed?: number }; this.success.set(`Se cerraron ${result.closed || 0} sesión(es).`); }); }
  private async run(action: () => Promise<void>): Promise<void> { this.saving.set(true); this.error.set(''); this.success.set(''); try { await action(); await this.load(); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); } }
}
