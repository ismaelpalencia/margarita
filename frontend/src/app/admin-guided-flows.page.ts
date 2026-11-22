import { Component, signal } from '@angular/core';

interface GuidedFlow { id: string; name: string; slug: string; trigger: string; isActive: boolean; isDraft: boolean; draftSummary: string | null; draftMissing: string[] }
interface Values { name: string; slug: string; trigger: string; isActive: boolean; leadCapture: boolean; requiresApproval: boolean; leadNameField: string; leadEmailField: string; leadInterestField: string; leadFields: string[] }

@Component({ selector: 'app-admin-guided-flows', standalone: true, templateUrl: './admin-guided-flows.page.html', styles: [`.guided-card{display:grid;gap:14px;margin:16px 0;padding:18px;border:1px solid #e1e9e4;border-radius:12px;background:white}.guided-card h2{margin:0}.guided-row{display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid #edf0ee}.guided-row>div:first-child{display:grid;gap:5px}.guided-row small,.guided-form small{color:#718078;font-size:11px}.guided-form{display:grid;gap:13px}.guided-form label{display:grid;gap:6px;color:#53655d;font-size:12px;font-weight:650}.guided-form input:not([type=checkbox]),.guided-form textarea{width:100%;padding:10px;border:1px solid #ced9d2;border-radius:7px;font:inherit}.guided-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.guided-grid .full{grid-column:1/-1}.guided-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px}.guided-actions button,.guided-actions a,.guided-form>button{padding:9px 12px;border:0;border-radius:7px;background:#19634d;color:white;font-size:12px;font-weight:700;text-decoration:none;cursor:pointer}.guided-actions .secondary{background:#edf3ef;color:#365e4b}.guided-error{padding:11px;border-radius:8px;background:#fff0ef;color:#963f3b;font-size:13px}.guided-notice{padding:11px;border-radius:8px;background:#eaf5ee;color:#256b4a;font-size:13px}@media(max-width:650px){.guided-grid{grid-template-columns:1fr}.guided-grid .full{grid-column:auto}.guided-row{flex-direction:column}}`] })
export class AdminGuidedFlowsPage {
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly flows = signal<GuidedFlow[]>([]);
  protected readonly values = signal<Values | null>(null);
  protected readonly steps = signal('[]');
  protected readonly isDraft = signal(false);
  protected readonly summary = signal('');
  protected readonly missing = signal<string[]>([]);
  protected readonly revision = signal('');
  protected readonly working = signal(false);
  protected readonly saving = signal(false);
  protected readonly aiError = signal('');
  protected readonly formError = signal('');
  protected readonly notice = signal('');
  protected readonly listMode = !location.pathname.endsWith('/new') && !this.flowId();
  protected readonly id = this.flowId();
  constructor() {
    const params = new URLSearchParams(location.search);
    const success = params.get('success');
    const error = params.get('error');
    const successText: Record<string, string> = { created: 'Flujo creado.', updated: 'Flujo actualizado.', deleted: 'Flujo eliminado.', toggled: 'Flujo actualizado.' };
    const errorText: Record<string, string> = { not_found: 'No se encontró el flujo.', validation: 'Revisa los datos del flujo.', create: 'No se pudo crear el flujo.', update: 'No se pudo actualizar el flujo.', generate: 'No se pudo generar el borrador.', revise: 'No se pudo modificar el flujo.', prompt: 'Escribe los cambios que quieres hacerle al flujo.' };
    this.notice.set((success && successText[success]) || (error && errorText[error]) || '');
    void this.load();
  }
  protected async revise(event: Event): Promise<void> { event.preventDefault(); if (!this.id) return; this.working.set(true); this.aiError.set(''); try { const response = await fetch(`/admin/ai/guided-flows/${encodeURIComponent(this.id)}/revise`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ source: this.revision() }) }); const result = await response.json() as { values?: Values; steps?: unknown; summary?: string | null; missing?: string[]; error?: string }; if (!response.ok || !result.values || !result.steps) throw new Error(result.error || 'No se pudo generar una propuesta.'); this.values.set(result.values); this.steps.set(JSON.stringify(result.steps, null, 2)); this.summary.set(result.summary || 'Propuesta generada. Revisa y guarda los cambios.'); this.missing.set(result.missing || []); this.isDraft.set(true); } catch (reason) { this.aiError.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.working.set(false); } }
  protected async saveFlow(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    this.saving.set(true); this.formError.set('');
    try {
      const response = await fetch(this.id ? `/admin/ai/guided-flows/${encodeURIComponent(this.id)}` : '/admin/ai/guided-flows', {
        method: 'POST', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') || ''),
          slug: String(data.get('slug') || ''),
          trigger: String(data.get('trigger') || ''),
          steps: String(data.get('steps') || ''),
          isActive: data.get('isActive') ? 'on' : '',
          leadCapture: data.get('leadCapture') ? 'on' : '',
          requiresApproval: data.get('requiresApproval') ? 'on' : '',
          leadNameField: String(data.get('leadNameField') || ''),
          leadEmailField: String(data.get('leadEmailField') || ''),
          leadInterestField: String(data.get('leadInterestField') || ''),
          leadFields: String(data.get('leadFields') || '')
        })
      });
      const result = await response.json() as { error?: string; redirectUrl?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el flujo.');
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    } catch (reason) { this.formError.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); }
  }
  protected async generateFlow(event: Event): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    this.saving.set(true); this.formError.set('');
    try {
      const response = await fetch('/admin/ai/guided-flows/generate', {
        method: 'POST', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: String(data.get('source') || ''), context: String(data.get('context') || ''), instructions: String(data.get('instructions') || '') })
      });
      const result = await response.json() as { error?: string; redirectUrl?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo generar el borrador.');
      if (result.redirectUrl) window.location.assign(result.redirectUrl);
    } catch (reason) { this.formError.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.saving.set(false); }
  }
  private flowId(): string { const p = location.pathname.split('/').filter(Boolean); const i = p.lastIndexOf('guided-flows'); return i >= 0 && p[i + 1] && p[i + 1] !== 'new' ? p[i + 1] : ''; }
  private async load(): Promise<void> {
    try {
      const url = this.listMode ? '/admin/ai/guided-flows' : this.id ? `/admin/ai/guided-flows/${encodeURIComponent(this.id)}` : `/admin/ai/guided-flows/new${location.search}`;
      const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los flujos guiados.');
      if (this.listMode) this.flows.set(data.flows as GuidedFlow[]);
      else { this.values.set(data.values as Values); this.steps.set(JSON.stringify(data.steps, null, 2)); this.isDraft.set(Boolean(data.flow?.isDraft)); this.summary.set(data.flow?.draftSummary || ''); this.missing.set(data.flow?.draftMissing || []); }
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); }
    finally { this.loading.set(false); }
  }
}
