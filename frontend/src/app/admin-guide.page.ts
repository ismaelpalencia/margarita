import { Component, signal } from '@angular/core';

interface GuideData { collectionsEnabled: boolean; supportEmail: string; supportWhatsappDisplay: string; supportWhatsappUrl: string }

@Component({
  selector: 'app-admin-guide-page', standalone: true,
  template: `
    @if (loading()) { <div class="guide-loading">Cargando guía…</div> }
    @else if (error()) { <section class="guide-error"><h1>No pudimos cargar la guía</h1><p>{{ error() }}</p><a href="/auth/login">Iniciar sesión</a></section> }
    @else if (data(); as model) {
      <header class="guide-heading"><p class="guide-eyebrow">GUÍA RÁPIDA</p><h1>Qué hace Margarita y por dónde empezar</h1><p>La idea en una frase: <strong>{{ model.collectionsEnabled ? 'cada conversación termina en un resultado' : 'cada conversación se atiende y se cierra en el panel' }}</strong>. El resto está para que el equipo pueda sostener ese flujo.</p></header>
      <section class="guide-grid"><article><h2>Bandeja de conversaciones</h2><p>Atiende WhatsApp desde el panel: texto y archivos dentro de las 24 horas, plantillas aprobadas cuando la ventana está cerrada, notas internas y respuestas rápidas.</p><a href="/panel/admin/conversations">Abrir conversaciones →</a></article>
        @if (model.collectionsEnabled) { <article><h2>Resultado de cada gestión</h2><p>Registra promesas, convenios, pagos y otros resultados con monto y fecha. El historial conserva quién lo registró y cuándo.</p><a href="/panel/admin/replies">Configurar botones →</a></article><article><h2>Lista de trabajo del día</h2><p>Revisa llamadas pendientes, promesas vencidas y contactos que no han respondido.</p><a href="/panel/admin/reports">Abrir reportes →</a></article><article><h2>Botones que se entienden solos</h2><p>Traduce las respuestas que el cliente toca a resultados y acciones como pausar o dar de baja.</p><a href="/panel/admin/replies">Configurar botones →</a></article> }
        <article><h2>Campañas con plantillas</h2><p>Envía a contactos o desde un archivo, con personalización, cola, pausa y reintentos.</p><a href="/panel/admin/campaigns">Ver campañas →</a></article><article><h2>Plantillas de WhatsApp</h2><p>Revisa las ideas, sincroniza las plantillas de Meta y confirma que estén aprobadas antes de usarlas.</p><a href="/panel/admin/templates">Ver plantillas →</a></article><article><h2>Horario de atención</h2><p>Define días, zona horaria y cómo responder cuando alguien escribe fuera del horario de tu empresa.</p><a href="/panel/admin/hours">Configurar horario →</a></article></section>
      @if (model.collectionsEnabled) { <section class="guide-steps"><h2>El día, en tres pasos</h2><ol><li><strong>Abre Hoy</strong><span>Llama primero a quienes pidieron una llamada y registra el resultado.</span></li><li><strong>Contesta la bandeja</strong><span>Al cerrar cada conversación, marca en qué quedó.</span></li><li><strong>Revisa al cierre</strong><span>Despacha lo que quedó pendiente y exporta el CSV si lo necesitas.</span></li></ol></section> }
      <section class="guide-limitations"><h2>Lo que no hace</h2><ul><li>No es un CRM: no maneja ventas, embudos ni facturación.</li><li>La IA automática solo cubre lo que está en tu base de conocimiento y puede pasar el hilo a una persona.</li><li>No crea ni aprueba plantillas de Meta.</li>@if (model.collectionsEnabled) { <li>No cobra ni concilia pagos: «pagado» es una anotación operativa.</li> }<li>Meta cobra el consumo de WhatsApp directamente a la empresa.</li></ul></section>
      <section class="guide-support"><div><h2>Guías completas y soporte</h2><p>Comparte las guías de uso y plantillas con tu equipo.</p><nav><a href="/guia">Guía de uso</a><a href="/plantillas">Guía de plantillas</a>@if (model.supportWhatsappUrl) { <a [href]="model.supportWhatsappUrl">WhatsApp {{ model.supportWhatsappDisplay }}</a> }@if (model.supportEmail) { <a [href]="'mailto:' + model.supportEmail">{{ model.supportEmail }}</a> }</nav></div></section>
    }
  `,
  styleUrl: './admin-guide.page.css'
})
export class AdminGuidePage {
  protected readonly data = signal<GuideData | null>(null); protected readonly loading = signal(true); protected readonly error = signal('');
  constructor() { void this.load(); }
  private async load(): Promise<void> { try { const response = await fetch('/admin/guia', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('No pudimos cargar la guía.'); this.data.set(await response.json() as GuideData); } catch (reason: unknown) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
}
