import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  afterEach(() => { vi.restoreAllMocks(); document.title = 'Margarita · Panel'; });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the Margarita navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('Margarita');
  });

  it('keeps automation in settings and provides theme and logout controls', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('a[href="/panel/admin/ai"]')?.textContent).toContain('Automatización');
    expect(compiled.querySelector('.theme-toggle[aria-label="Activar modo nocturno"]')).toBeTruthy();
    expect(compiled.querySelector('.topbar-logout form, form.topbar-logout[action="/auth/logout"]')).toBeTruthy();
  });

  it('shows the logged-in user initial and updates the breadcrumb on panel navigation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url === '/panel/shell'
        ? { role: 'ADMIN', userName: 'Eduardo Fernández', collectionsEnabled: true, activeNumberId: null, numbers: [], unreadTotal: 0, unassignedCount: 0 }
        : url === '/admin/leads'
          ? { leads: [], statuses: [], currentStatus: 'ALL', settings: { leadsEnabled: false, leadWebhookUrl: '', hasWebhookSecret: false, leadSheetsWebhookUrl: '', hasSheetsSecret: false }, contacts: [], csvColumns: [] }
          : { notifySoundEnabled: false, notifyBrowserEnabled: false };
      return { ok: true, json: async () => body } as Response;
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.avatar')?.textContent?.trim()).toBe('E');
    await router.navigateByUrl('/panel/admin/leads');
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.breadcrumbs')?.textContent).toContain('Leads');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-admin-leads-page h1')?.textContent).toContain('Leads');
    fixture.destroy();
  });

  it('shows the initial unread total in the browser tab title', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const body = String(input) === '/panel/shell'
        ? { role: 'ADMIN', userName: 'Eduardo', collectionsEnabled: true, activeNumberId: null, numbers: [], unreadTotal: 3, unassignedCount: 0 }
        : { notifySoundEnabled: false, notifySoundType: 'classic', notifyBrowserEnabled: false };
      return { ok: true, json: async () => body } as Response;
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(document.title).toBe('(3) Margarita');
    fixture.destroy();
  });

  it('opens every remaining panel from the Más sheet and closes it with Escape', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const toggle = page.querySelector('#mobile-more-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const sheet = page.querySelector('#mobile-more-navigation');
    expect(sheet).toBeTruthy();
    for (const label of ['Etiquetas', 'Respuestas rápidas', 'Plantillas', 'Equipo', 'WhatsApp', 'Respaldos', 'Servicio', 'Bitácora', 'Campañas', 'Automatización']) {
      expect(sheet?.textContent).toContain(label);
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(page.querySelector('#mobile-more-navigation')).toBeNull();
    fixture.destroy();
  });
});
