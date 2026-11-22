import { TestBed } from '@angular/core/testing';
import { AdminTemplatesPage } from './admin-templates.page';

describe('AdminTemplatesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('muestra plantillas sincronizadas de Meta sin la biblioteca de ideas', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json; charset=utf-8' },
      json: async () => ({
        templates: [{
          id: 'template-1',
          name: 'recordatorio_pago',
          language: 'es_MX',
          category: 'UTILITY',
          status: 'APPROVED',
          metaTemplateId: 'meta-123',
          lastSyncedAt: '2026-11-22T12:00:00.000Z',
          hasVariablesOrUrl: false,
        }],
        syncResult: null,
        syncError: false,
      }),
    } as unknown as Response);

    await TestBed.configureTestingModule({ imports: [AdminTemplatesPage] }).compileComponents();
    const fixture = TestBed.createComponent(AdminTemplatesPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('recordatorio_pago');
    expect(page.textContent).toContain('Aprobada');
    expect(page.textContent).not.toContain('Biblioteca');
    expect(page.textContent).not.toContain('ideas listas');
  });
});
