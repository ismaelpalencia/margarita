import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { applyUiFontSize, readUiFontSize } from './ui-preferences';
import { formatNotificationTitle, NotificationSoundType, playNotificationSound } from './notification-preferences';

interface ShellNumber {
  id: string;
  displayName: string | null;
  phoneNumber: string;
}

interface ShellData {
  role: string;
  userName: string;
  collectionsEnabled: boolean;
  activeNumberId: string | null;
  numbers: ShellNumber[];
  unreadTotal: number;
  unassignedCount: number;
}

interface LiveToast {
  title: string;
  body: string;
  href: string;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
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
  protected readonly mobileMenuOpen = signal(false);
  private readonly router = inject(Router);
  protected readonly pageName = signal(this.resolvePageName(window.location.pathname));
  protected readonly shell = signal<ShellData | null>(null);
  protected readonly unreadTotal = computed(() => this.shell()?.unreadTotal ?? 0);
  protected readonly unassignedCount = computed(() => this.shell()?.unassignedCount ?? 0);
  protected readonly userInitial = computed(() =>
    (this.shell()?.userName || 'M').trim().charAt(0).toUpperCase()
  );
  protected readonly pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
  protected readonly pushSubscribed = signal(false);
  protected readonly pwaMessage = signal('');
  protected readonly liveToast = signal<LiveToast | null>(null);
  protected readonly darkMode = signal(this.readDarkMode());
  private readonly installPrompt = signal<InstallPromptEvent | null>(null);
  private readonly installed = signal(false);
  private readonly isIos = typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  private readonly isMobile = this.isIos || (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent));
  private readonly isStandalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  private socket: ReturnType<NonNullable<Window['io']>> | null = null;
  private latestBadges: { dashboardUnread: number; unassigned: number } | null = null;
  private soundNotifications = false;
  private notificationSoundType: NotificationSoundType = 'classic';
  private browserNotifications = false;
  private toastTimer: number | null = null;
  protected readonly showInstall = computed(() => !this.installed() && (Boolean(this.installPrompt()) || (this.isMobile && !this.isStandalone)));
  private registration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.applyTheme(this.darkMode());
    applyUiFontSize(readUiFontSize());
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.pageName.set(this.resolvePageName(this.router.url.split(/[?#]/)[0]));
        this.mobileMenuOpen.set(false);
      });
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (event: Event) => {
        event.preventDefault();
        this.installPrompt.set(event as InstallPromptEvent);
      });
      window.addEventListener('appinstalled', () => {
        this.installPrompt.set(null);
        this.installed.set(true);
        this.pwaMessage.set('Margarita quedó instalada en este dispositivo.');
      });
      if ('serviceWorker' in navigator) void this.registerServiceWorker();
    }
    if (!this.isPublic) {
      this.updateDocumentTitle(0);
      this.socket = window.io?.({ withCredentials: true }) || null;
      void this.loadShell();
      void this.loadNotificationPreferences();
      this.socket?.on('badges:update', (payload) => this.updateBadges(payload));
      this.socket?.on('conversation:message', (payload) => this.handleIncomingMessage(payload));
    }
  }

  protected toggleTheme(): void {
    const enabled = !this.darkMode();
    this.darkMode.set(enabled);
    this.applyTheme(enabled);
    try { localStorage.setItem('margarita-theme', enabled ? 'dark' : 'light'); } catch { /* El tema sigue aplicado durante esta sesión. */ }
  }

  private readDarkMode(): boolean {
    try {
      const saved = localStorage.getItem('margarita-theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch { /* Usa la preferencia del sistema si localStorage no está disponible. */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  private applyTheme(enabled: boolean): void {
    const root = document.documentElement;
    // El tema oscuro usa el filtro global de inversión; conserva el tema base
    // claro para que la inversión transforme también las pantallas legacy.
    root.dataset['theme'] = 'light';
    root.classList.toggle('margarita-dark-mode', enabled);
  }

  protected async installApp(): Promise<void> {
    const prompt = this.installPrompt();
    if (!prompt) {
      this.pwaMessage.set(this.isIos
        ? 'En iPhone o iPad: abre Margarita en Safari, toca Compartir y elige “Agregar a pantalla de inicio”.'
        : 'Para instalar: abre el menú de Chrome y elige Instalar app o Agregar a pantalla de inicio.');
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    this.installPrompt.set(null);
    if (choice.outcome === 'accepted') this.pwaMessage.set('Se inició la instalación de Margarita.');
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected async enablePush(): Promise<void> {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.pwaMessage.set(permission === 'denied' ? 'Los avisos están bloqueados en la configuración del navegador.' : 'No se activaron los avisos.');
        return;
      }
      const registration = await this.getServiceWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const keyResponse = await fetch('/api/push/public-key', { credentials: 'same-origin' });
        const key = await keyResponse.json() as { publicKey?: string; error?: string };
        if (!keyResponse.ok || !key.publicKey) throw new Error(key.error || 'Los avisos push no están configurados.');
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.decodeApplicationKey(key.publicKey) });
      }
      const response = await fetch('/api/push/subscribe', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON())
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la suscripción.');
      this.pushSubscribed.set(true);
      this.pwaMessage.set('Avisos activados en este dispositivo.');
    } catch (error) {
      this.pwaMessage.set(error instanceof Error ? error.message : 'No se pudieron activar los avisos.');
    }
  }

  protected async testPush(): Promise<void> {
    try {
      const response = await fetch('/api/push/test', { method: 'POST', credentials: 'same-origin' });
      const result = await response.json() as { sent?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar la prueba.');
      this.pwaMessage.set(result.sent ? 'Aviso de prueba enviado.' : 'No hay una suscripción activa para este usuario.');
    } catch (error) {
      this.pwaMessage.set(error instanceof Error ? error.message : 'No se pudo enviar la prueba.');
    }
  }

  private async registerServiceWorker(): Promise<void> {
    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      if (this.pushSupported) this.pushSubscribed.set(Boolean(await this.registration.pushManager.getSubscription()));
    } catch {
      // El panel funciona aunque el navegador no permita registrar el service worker.
    }
  }

  private async getServiceWorker(): Promise<ServiceWorkerRegistration> {
    this.registration = this.registration || await navigator.serviceWorker.ready;
    return this.registration;
  }

  private decodeApplicationKey(key: string): ArrayBuffer {
    const padding = '='.repeat((4 - key.length % 4) % 4);
    const decoded = atob((key + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return bytes.buffer;
  }

  private async loadShell(): Promise<void> {
    try {
      const response = await fetch('/panel/shell', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      const data = await response.json() as ShellData;
      this.shell.set(this.latestBadges ? {
        ...data,
        unreadTotal: this.latestBadges.dashboardUnread,
        unassignedCount: this.latestBadges.unassigned
      } : data);
      this.updateDocumentTitle(this.latestBadges?.dashboardUnread ?? data.unreadTotal ?? 0);
    } catch {
      /** Si el armazón falla, la página sigue sin contadores. */
    }
  }

  private async loadNotificationPreferences(): Promise<void> {
    try {
      const response = await fetch('/account/notifications', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      const result = await response.json() as { notifySoundEnabled?: boolean; notifySoundType?: NotificationSoundType; notifyBrowserEnabled?: boolean };
      this.soundNotifications = Boolean(result.notifySoundEnabled);
      this.notificationSoundType = result.notifySoundType || 'classic';
      this.browserNotifications = Boolean(result.notifyBrowserEnabled);
    } catch {
      // Las notificaciones son opcionales; no afectan al panel si falla esta consulta.
    }
  }

  private updateBadges(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const badges = payload as { dashboardUnread?: number; unassigned?: number };
    this.latestBadges = {
      dashboardUnread: Number(badges.dashboardUnread) || 0,
      unassigned: Number(badges.unassigned) || 0
    };
    this.updateDocumentTitle(this.latestBadges.dashboardUnread);
    const current = this.shell();
    if (!current) return;
    this.shell.set({
      ...current,
      unreadTotal: this.latestBadges.dashboardUnread,
      unassignedCount: this.latestBadges.unassigned
    });
  }

  private handleIncomingMessage(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const event = payload as {
      conversationId?: string;
      contact?: { name?: string };
      message?: { direction?: string; body?: string | null; type?: string };
    };
    if (event.message?.direction !== 'IN' || !event.conversationId) return;

    const currentConversation = window.location.pathname.match(/\/conversations\/([^/]+)/)?.[1];
    if (currentConversation === event.conversationId) return;

    const name = event.contact?.name || 'Contacto';
    const body = event.message.body || `[${event.message.type || 'MENSAJE'}]`;
    const href = `${this.isAgent ? '/panel/agent' : '/panel/admin'}/conversations/${encodeURIComponent(event.conversationId)}`;
    this.liveToast.set({ title: `Nuevo mensaje · ${name}`, body, href });
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.liveToast.set(null), 7000);

    if (this.soundNotifications) playNotificationSound(this.notificationSoundType);
    if (this.browserNotifications && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notification = new Notification(`Nuevo mensaje · ${name}`, { body, tag: `margarita-${event.conversationId}` });
        notification.onclick = () => {
          window.focus();
          window.location.href = href;
          notification.close();
        };
      } catch {
        // El navegador puede restringir notificaciones aunque ya tengan permiso.
      }
    }
  }

  private updateDocumentTitle(unread: number): void { document.title = formatNotificationTitle(unread); }

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
    if (path.includes('/replies')) return 'Reglas de respuestas';
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
