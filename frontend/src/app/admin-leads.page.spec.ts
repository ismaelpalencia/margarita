import { TestBed } from '@angular/core/testing';
import { AdminLeadsPage } from './admin-leads.page';

const storageKey = 'margarita-leads-columns';

const leadsResponse = {
  leads: [{
    id: 'lead-1', contactId: null, conversationId: null, name: 'Ana Pérez', phone: '5215550101010',
    email: 'ana@example.com', interest: 'Crédito', notes: 'Llamar por la tarde', fields: { edad: 65 },
    source: 'MANUAL', status: 'NUEVO', webhookSentAt: null, webhookFailedAt: null,
    webhookAttempts: 0, createdAt: '2026-01-01T00:00:00.000Z',
  }],
  statuses: ['NUEVO', 'CONTACTADO', 'CONVERTIDO', 'DESCARTADO'],
  currentStatus: 'ALL',
  settings: { leadsEnabled: true, leadWebhookUrl: '', hasWebhookSecret: false, leadSheetsWebhookUrl: '', hasSheetsSecret: false },
  contacts: [],
  csvColumns: ['nombre', 'telefono', 'email', 'interes', 'notas', 'origen', 'estado', 'creado', 'id'],
};

describe('AdminLeadsPage column selector', () => {
  beforeEach(() => {
    localStorage.removeItem(storageKey);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => leadsResponse,
    } as Response);
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
    vi.restoreAllMocks();
  });

  it('shows all lead columns by default and always keeps actions visible', async () => {
    await TestBed.configureTestingModule({ imports: [AdminLeadsPage] }).compileComponents();
    const fixture = TestBed.createComponent(AdminLeadsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('.lead-columns-form input[type="checkbox"]')).toHaveLength(8);
    expect([...page.querySelectorAll('.lead-columns-form input[type="checkbox"]')].every((input) => (input as HTMLInputElement).checked)).toBe(true);
    expect([...page.querySelectorAll('thead [data-lead-column]')].every((column) => !column.hasAttribute('hidden'))).toBe(true);
    expect(page.querySelector('thead [data-lead-column="actions"]')?.textContent).toContain('Acciones');
    fixture.destroy();
  });

  it('persists a hidden column across reloads without changing CSV columns', async () => {
    await TestBed.configureTestingModule({ imports: [AdminLeadsPage] }).compileComponents();
    const fixture = TestBed.createComponent(AdminLeadsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    const emailToggle = [...page.querySelectorAll('.lead-columns-form input[type="checkbox"]')]
      .find((input) => input.parentElement?.textContent?.includes('Correo')) as HTMLInputElement;
    emailToggle.checked = false;
    emailToggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(page.querySelector('thead [data-lead-column="email"]')?.hasAttribute('hidden')).toBe(true);
    expect(page.querySelector('thead [data-lead-column="actions"]')?.hasAttribute('hidden')).toBe(false);
    expect(JSON.parse(localStorage.getItem(storageKey) || '{}').email).toBe(false);
    expect(page.querySelector('form[action="/admin/leads/export"] input[name="columns"][value="email"]')).toBeTruthy();
    fixture.destroy();

    const reloaded = TestBed.createComponent(AdminLeadsPage);
    await reloaded.whenStable();
    reloaded.detectChanges();
    const persistedEmailToggle = [...(reloaded.nativeElement as HTMLElement).querySelectorAll('.lead-columns-form input[type="checkbox"]')]
      .find((input) => input.parentElement?.textContent?.includes('Correo')) as HTMLInputElement;
    expect(persistedEmailToggle.checked).toBe(false);
    expect((reloaded.nativeElement as HTMLElement).querySelector('thead [data-lead-column="email"]')?.hasAttribute('hidden')).toBe(true);
    reloaded.destroy();
  });
});
