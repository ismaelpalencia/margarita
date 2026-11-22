import { Component, signal } from '@angular/core';

interface LoginMeta {
  notConfigured: boolean;
  error: string | null;
  success: string | null;
  email: string;
}

interface LoginActionResult {
  error?: string;
  twoFactorRequired?: boolean;
  challengeToken?: string;
  redirectUrl?: string;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  template: `
    <main class="login-page">
      <section class="login-card">
        <aside class="login-story">
          <a class="login-brand" href="/" aria-label="Margarita, inicio"><img src="/brand/img/margarita-icon-64.png" alt="">Margarita</a>
          <div><p class="login-eyebrow">WHATSAPP OPERATIVO</p><h1>Atención clara para cada conversación.</h1><p>Coordina a tu equipo y acompaña cada contacto desde una sola plataforma.</p></div>
          <div class="story-tags"><span>Conversaciones</span><span>Agentes</span><span>Campañas</span></div>
        </aside>
        <section class="login-form-panel">
          <div class="login-mobile-brand"><img src="/brand/img/margarita-icon-64.png" alt=""><strong>Margarita</strong></div>
          @if (loading()) {
            <div class="login-loading"><span class="spinner"></span>Cargando acceso…</div>
          } @else {
            <p class="login-eyebrow">BIENVENIDO</p>
            @if (twoFactor()) {
              <h2>Verificación en dos pasos</h2><p class="login-subtitle">Escribe el código de 6 dígitos de tu app de autenticación.</p>
            } @else {
              <h2>Inicia sesión</h2><p class="login-subtitle">Entra a tu espacio de trabajo.</p>
            }

            @if (error()) { <div class="login-alert error" role="alert">{{ error() }}</div> }
            @if (meta()?.success) { <div class="login-alert success" role="status">{{ meta()?.success }}</div> }
            @if (meta()?.notConfigured) { <div class="login-alert setup"><strong>Esta instalación todavía no está configurada.</strong><br>Falta crear la empresa y el usuario administrador. <a href="/setup">Configurarla ahora</a>.</div> }

            @if (twoFactor()) {
              <form class="login-form" (submit)="$event.preventDefault(); verifyCode()">
                <label for="verification-code">Código de verificación</label>
                <input id="verification-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" [value]="code()" (input)="setCode($event)" placeholder="123456" required autofocus>
                <button type="submit" [disabled]="busy()">{{ busy() ? 'Verificando…' : 'Confirmar y entrar' }}</button>
              </form>
              <button class="back-to-password" type="button" (click)="startOver()">Volver a escribir la contraseña</button>
            } @else {
              <form class="login-form" (submit)="$event.preventDefault(); signIn()">
                <label for="login-email">Correo</label>
                <input id="login-email" type="email" autocomplete="username" [value]="email()" (input)="setEmail($event)" placeholder="tu@empresa.com" required>
                <label for="login-password">Contraseña</label>
                <input id="login-password" type="password" autocomplete="current-password" [value]="password()" (input)="setPassword($event)" placeholder="••••••••" required>
                <button type="submit" [disabled]="busy()">{{ busy() ? 'Entrando…' : 'Entrar a Margarita' }}</button>
              </form>
            }
            <p class="login-version">Margarita · Operación WhatsApp Cloud API</p>
          }
        </section>
      </section>
    </main>
  `,
  styleUrl: './login.page.css',
})
export class LoginPage {
  protected readonly meta = signal<LoginMeta | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly twoFactor = signal(false);
  protected readonly challengeToken = signal('');
  protected readonly code = signal('');

  constructor() {
    const query = new URLSearchParams(window.location.search);
    this.email.set(query.get('email') || '');
    void fetch(`/auth/login/meta${window.location.search}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) throw new Error('No se pudo cargar la pantalla de acceso.');
      const result = await response.json() as LoginMeta;
      this.meta.set(result);
      if (result.email) this.email.set(result.email);
      if (result.error) this.error.set(result.error);
    }).catch((reason: unknown) => {
      this.error.set(reason instanceof Error ? reason.message : 'No se pudo cargar el acceso.');
    }).finally(() => this.loading.set(false));
  }

  protected setEmail(event: Event): void { this.email.set((event.target as HTMLInputElement).value); }
  protected setPassword(event: Event): void { this.password.set((event.target as HTMLInputElement).value); }
  protected setCode(event: Event): void { this.code.set((event.target as HTMLInputElement).value); }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.post('/auth/login', { email: this.email(), password: this.password() });
      if (result.twoFactorRequired) {
        this.challengeToken.set(result.challengeToken || '');
        this.twoFactor.set(true);
        return;
      }
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    } catch (reason: unknown) {
      this.error.set(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async verifyCode(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.post('/auth/login/2fa', {
        challengeToken: this.challengeToken(),
        code: this.code(),
        email: this.email(),
      });
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'No se pudo verificar el código.';
      this.error.set(message);
    } finally {
      this.busy.set(false);
    }
  }

  protected startOver(): void {
    this.twoFactor.set(false);
    this.challengeToken.set('');
    this.code.set('');
    this.error.set('');
  }

  private async post(url: string, values: Record<string, string>): Promise<LoginActionResult> {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(values),
    });
    const type = response.headers.get('content-type') || '';
    const result = type.includes('application/json') ? await response.json() as LoginActionResult : {};
    if (!response.ok) throw new Error(result.error || (await response.text()) || 'No se pudo iniciar sesión.');
    return result;
  }
}
