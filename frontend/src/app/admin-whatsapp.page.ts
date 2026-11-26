import { Component, signal } from '@angular/core';

interface Usage { numberId: string; service: { used: number; limit: number; remaining: number; percent: number }; utility: { used: number; cost: number }; marketing: { used: number; cost: number }; otherTemplates: number; estimatedCost: number; currency: string; alert: boolean }
interface NumberRow { id: string; displayName: string | null; phoneNumber: string; phoneNumberId: string; isActive: boolean; aiEnabled: boolean; flowsEnabled: boolean; guidedFlowsEnabled: boolean; status: string; qualityRating: string | null }
interface WhatsAppData { webhookUrl?: string; account: null | { businessAccountId: string; apiVersion: string; maskedAccessToken: string; maskedVerifyToken: string; encryptedAtRest: boolean }; numbers: NumberRow[]; usage: Usage[]; suggestedNumberId: string | null; error?: string }
type ProfileData = Record<string, string | string[] | undefined>;
interface NumberHealth { number?: Record<string, unknown>; numbers?: Array<Record<string, unknown>> }
interface MetaAccountHealth { account?: Record<string, unknown> | null; subscribedApps?: Array<{ id?: string; name?: string }>; accountError?: string | null; subscriptionsError?: string | null; checkedAt?: string }
interface MetaAnalytics { currency: string; pricing: { points: number; volume: number; cost: number } | null; calls: { points: number; count: number; averageDurationSeconds: number; cost: number } | null; pricingError?: string | null; callsError?: string | null; checkedAt?: string }
interface MetaRows { data?: Array<Record<string, unknown>>; error?: string }

@Component({
  selector: 'app-admin-whatsapp-page', standalone: true,
  template: `
    @if (loading()) { <p class="wa-loading">Cargando configuración de WhatsApp…</p> }
    @else {
      <header class="wa-heading"><p>OPERACIÓN</p><h1>Cuenta de WhatsApp</h1><span>Una cuenta de WhatsApp Business con sus credenciales y varios números. Cada número tiene su propia calidad y sus propios hilos.</span></header>
      @if (message()) { <p class="wa-alert" role="status">{{ message() }}</p> } @if (error()) { <p class="wa-alert error" role="alert">{{ error() }}</p> }
      @if (!data()?.account) {
        <section class="wa-card"><h2>Conectar tu cuenta de WhatsApp</h2><p>Copia estos datos del panel de tu app en Meta (WhatsApp → Configuración de la API). Los tokens se guardan cifrados.</p><aside><strong>De dónde sale cada dato</strong><p><b>Business Account ID:</b> el identificador de tu cuenta de WhatsApp Business (WABA).</p><p><b>Access token:</b> token permanente de un usuario del sistema con permiso sobre la WABA.</p><p><b>Verify token:</b> una cadena que eliges y configuras igual en el webhook de Meta.</p></aside><form action="/admin/whatsapp/account" method="post" class="wa-grid"><label>Business Account ID<input name="businessAccountId" required maxlength="40"></label><label>API Version<input name="apiVersion" value="v23.0"></label><label>Access token<input name="accessToken" required autocomplete="off"></label><label>Verify token<input name="verifyToken" required autocomplete="off"></label><button>Guardar la cuenta</button></form><p class="wa-muted">Webhook de Meta: <code>{{ data()?.webhookUrl }}</code></p></section>
      } @else {
        <section class="wa-card wa-meta-insights"><header class="wa-card-heading"><div><h2>Salud y consumo de Meta</h2><p>Datos reportados por WhatsApp Business Platform; pueden tardar en actualizarse.</p></div><button type="button" class="secondary" [disabled]="accountHealthLoading()" (click)="loadAccountHealth()">{{ accountHealthLoading() ? 'Consultando…' : 'Actualizar estado' }}</button></header>
          @if (accountHealth(); as health) { @if (health.accountError) { <p class="wa-insight-error" role="alert">No se pudo consultar el estado WABA: {{ health.accountError }}</p> } @else if (health.account) { <div class="wa-account-health"><span><small>Cuenta</small><b>{{ metaValue(health.account, 'name') }}</b></span><span><small>Estado</small><b>{{ metaValue(health.account, 'status') }}</b></span><span><small>Salud para enviar</small><b>{{ metaValue(health.account, 'health_status') }}</b></span><span><small>Verificación</small><b>{{ metaValue(health.account, 'business_verification_status') }}</b></span><span><small>Límite compartido</small><b>{{ metaValue(health.account, 'whatsapp_business_manager_messaging_limit') }}</b></span><span><small>Apps suscritas al webhook</small><b>{{ health.subscribedApps?.length || 0 }} @if (health.subscriptionsError) { · no disponible }</b></span></div>@if (health.subscribedApps?.length) { <details><summary>Ver aplicaciones suscritas</summary><ul>@for (app of health.subscribedApps; track app.id || app.name) { <li>{{ app.name || 'Aplicación' }} · {{ app.id || 'sin ID' }}</li> }</ul></details> }@if (health.subscriptionsError) { <p class="wa-insight-error" role="alert">No se pudo verificar la suscripción al webhook: {{ health.subscriptionsError }}</p> } } } @else { <button type="button" class="secondary" [disabled]="accountHealthLoading()" (click)="loadAccountHealth()">Consultar salud de la cuenta</button> }
          <div class="wa-analytics-heading"><div><strong>Analítica Meta</strong><small>Mensajes y llamadas por periodo</small></div><div class="wa-periods"><button type="button" [class.selected]="analyticsDays() === 7" (click)="loadAnalytics(7)" [disabled]="analyticsLoading()">7 días</button><button type="button" [class.selected]="analyticsDays() === 30" (click)="loadAnalytics(30)" [disabled]="analyticsLoading()">30 días</button><button type="button" [class.selected]="analyticsDays() === 90" (click)="loadAnalytics(90)" [disabled]="analyticsLoading()">90 días</button></div></div>
          @if (analyticsLoading()) { <p class="wa-muted">Consultando analítica de Meta…</p> } @if (analytics(); as metrics) { <div class="wa-analytics-grid"><article><small>Mensajes reportados</small><b>{{ metrics.pricing?.volume ?? '—' }}</b><span>Costo {{ metrics.currency || '' }} {{ metrics.pricing ? metrics.pricing.cost.toFixed(2) : '—' }}</span>@if (metrics.pricingError) { <small class="wa-insight-error">{{ metrics.pricingError }}</small> }</article><article><small>Llamadas reportadas</small><b>{{ metrics.calls?.count ?? '—' }}</b><span>Duración promedio {{ formatDuration(metrics.calls?.averageDurationSeconds || 0) }} · costo {{ metrics.currency || '' }} {{ metrics.calls ? metrics.calls.cost.toFixed(2) : '—' }}</span>@if (metrics.callsError) { <small class="wa-insight-error">{{ metrics.callsError }}</small> }</article></div> } @if (!analytics() && !analyticsLoading()) { <button type="button" class="secondary" (click)="loadAnalytics(30)">Consultar analítica</button> }
        </section>
        <section class="wa-card"><header class="wa-card-heading"><div><h2>Flows y catálogo</h2><p>Consulta y crea Flows en Meta; revisa los catálogos y sus productos conectados.</p></div><div class="wa-actions"><button type="button" class="secondary" [disabled]="metaAssetsLoading()" (click)="loadMetaAssets()">{{ metaAssetsLoading() ? 'Consultando…' : 'Actualizar' }}</button></div></header>
          <details><summary>Flows de WhatsApp</summary>
            <form class="wa-grid" (submit)="createFlow($event)"><label>Nombre del Flow<input name="name" required maxlength="60" placeholder="Solicitud de cita"></label><label>Categoría<select name="category"><option value="APPOINTMENT_BOOKING">Reservar cita</option><option value="LEAD_GENERATION">Captar prospectos</option><option value="CUSTOMER_SUPPORT">Atención al cliente</option><option value="SURVEY">Encuesta</option><option value="OTHER">Otro</option></select></label><label>JSON del Flow (opcional)<textarea name="flowJson" rows="3" placeholder="Pega el JSON validado por Meta"></textarea></label><button [disabled]="flowSaving()">{{ flowSaving() ? 'Creando…' : 'Crear borrador en Meta' }}</button></form>
            @if (flows()?.data?.length) { <div class="wa-meta-list">@for (flow of flows()?.data || []; track flow['id']) { <article><b>{{ metaValue(flow, 'name') }}</b><span>{{ metaValue(flow, 'status') }} · {{ metaValue(flow, 'id') }}</span>@if (flow['validation_errors']) { <small>Meta reporta validaciones pendientes.</small> }@if (metaValue(flow, 'status') === 'DRAFT') { @if (flowToPublish() === metaValue(flow, 'id')) { <small>Al publicar, Meta deja el Flow inmutable. <button type="button" class="secondary" (click)="publishFlow(metaValue(flow, 'id'))">Confirmar publicación</button><button type="button" class="secondary" (click)="flowToPublish.set('')">Cancelar</button></small> } @else { <button type="button" class="secondary" (click)="flowToPublish.set(metaValue(flow, 'id'))">Publicar…</button> } }</article> }</div> } @else if (flows()) { <p class="wa-muted">No hay Flows o Meta no devolvió resultados.</p> }
          </details>
          <details><summary>Catálogos conectados</summary>@if (catalogs()?.data?.length) { <div class="wa-meta-list">@for (catalog of catalogs()?.data || []; track catalog['id']) { <article><b>{{ metaValue(catalog, 'name') }}</b><span>ID {{ metaValue(catalog, 'id') }} · {{ metaValue(catalog, 'vertical') }}</span><button type="button" class="secondary" (click)="loadCatalogProducts(metaValue(catalog, 'id'))">Ver productos</button>@if (products()[metaValue(catalog, 'id')]; as items) { <ul>@for (product of items; track product['id']) { <li>{{ metaValue(product, 'name') }} · SKU {{ metaValue(product, 'retailer_id') }} · {{ metaValue(product, 'price') }} {{ metaValue(product, 'currency') }}</li> }</ul> }</article> }</div> } @else if (catalogs()) { <p class="wa-muted">No hay catálogos conectados a esta WABA.</p> }</details>
        </section>
        <section class="wa-card"><header class="wa-card-heading"><div><h2>Números</h2><p>El número activo del encabezado envía mensajes y campañas, y aparece en la bandeja.</p></div><span>{{ data()?.numbers?.length }} registrado(s)</span></header>
          @if (!data()?.numbers?.length) { <p class="wa-empty">No hay números registrados. Agrega el primero para poder enviar.</p> }
          @for (number of data()?.numbers || []; track number.id) { <article class="wa-number"><div class="wa-number-top"><div><h3>{{ number.displayName || number.phoneNumber }}</h3><p>{{ number.phoneNumber }} · ID {{ number.phoneNumberId }}</p><div class="wa-badges"><span>{{ number.isActive ? 'Activo' : 'Inactivo' }}</span><span>IA {{ number.aiEnabled ? 'activa' : 'apagada' }}</span><span>Flujos {{ number.flowsEnabled ? 'activos' : 'apagados' }}</span><span>Guiados {{ number.guidedFlowsEnabled ? 'activos' : 'apagados' }}</span><span>{{ number.status === 'CONNECTED' ? 'Conectado' : number.status === 'ERROR' ? 'Error' : 'Sin estado' }}</span><span>Calidad: {{ number.qualityRating || 'sin dato' }}</span>@if (data()?.suggestedNumberId === number.id) { <span class="wa-suggested">Sugerido para abrir conversaciones</span> }</div></div><div class="wa-actions"><form [action]="'/admin/whatsapp/numbers/' + number.id + '/test'" method="post"><button>Probar conexión</button></form><form [action]="'/admin/whatsapp/numbers/' + number.id + '/toggle'" method="post"><button class="secondary">{{ number.isActive ? 'Desactivar' : 'Activar' }}</button></form><form [action]="'/admin/whatsapp/numbers/' + number.id + '/ai'" method="post"><input type="hidden" name="enabled" [value]="!number.aiEnabled"><button class="secondary">{{ number.aiEnabled ? 'Apagar IA' : 'Encender IA' }}</button></form><form [action]="'/admin/whatsapp/numbers/' + number.id + '/flows'" method="post"><input type="hidden" name="enabled" [value]="!number.flowsEnabled"><button class="secondary">{{ number.flowsEnabled ? 'Apagar flujos' : 'Encender flujos' }}</button></form><form [action]="'/admin/whatsapp/numbers/' + number.id + '/guided-flows'" method="post"><input type="hidden" name="enabled" [value]="!number.guidedFlowsEnabled"><button class="secondary">{{ number.guidedFlowsEnabled ? 'Apagar guiados' : 'Encender guiados' }}</button></form></div></div>
            @if (usageById(number.id); as usage) { <div class="wa-usage"><div><strong>Tramo del mes · servicio</strong><span>{{ usage.service.used }} de {{ usage.service.limit }} mensajes · quedan {{ usage.service.remaining }} · {{ usage.service.percent }}%</span></div><progress [class.alert-progress]="usage.alert" [max]="100" [value]="usage.service.percent"></progress><small>Utilidad: {{ usage.utility.used }} (~{{ usage.currency }} {{ usage.utility.cost.toFixed(2) }}) · marketing: {{ usage.marketing.used }} (~{{ usage.currency }} {{ usage.marketing.cost.toFixed(2) }}) · costo estimado: {{ usage.currency }} {{ usage.estimatedCost.toFixed(2) }}</small></div> }
            <div class="wa-number-tools"><button type="button" class="secondary" [disabled]="healthLoading()[number.id]" (click)="loadHealth(number.id)">{{ healthLoading()[number.id] ? 'Consultando…' : 'Consultar salud del número' }}</button>@if (health()[number.id]; as status) { <div class="wa-health" [class.wa-health-warning]="needsAttention(status.number)" role="status"><b>Estado:</b> {{ value(status.number, 'status') }} · <b>Nombre:</b> {{ healthName(status.number) }} · <b>Calidad:</b> {{ value(status.number, 'quality_rating') }} · <b>Plataforma:</b> {{ value(status.number, 'platform_type') }} · <b>Rendimiento:</b> {{ throughput(status.number) }}@if (needsAttention(status.number)) { <strong> · Requiere revisión en Meta</strong> }</div> }</div>
            <details (toggle)="loadProfile(number.id, $event)"><summary>Perfil de empresa en WhatsApp</summary>@if (profiles()[number.id]; as profile) { <p class="wa-current-profile">Perfil actual: {{ profileSummary(profile) }}</p> }<form class="wa-grid" (submit)="saveProfile($event, number.id)"><label>Acerca de<input name="about" maxlength="139" [value]="profileValue(number.id, 'about')"></label><label>Correo<input name="email" type="email" [value]="profileValue(number.id, 'email')"></label><label>Dirección<input name="address" [value]="profileValue(number.id, 'address')"></label><label>Foto de perfil URL<input name="profile_picture_url" type="url" [value]="profileValue(number.id, 'profile_picture_url')"></label><label>Sitios web (uno por línea)<textarea name="websites" rows="2" [value]="profileValue(number.id, 'websites')"></textarea></label><label>Categoría<input name="vertical" [value]="profileValue(number.id, 'vertical')"></label><label>Descripción<textarea name="description" maxlength="512" rows="3" [value]="profileValue(number.id, 'description')"></textarea></label><button [disabled]="profileSaving()[number.id]">{{ profileSaving()[number.id] ? 'Guardando…' : 'Actualizar perfil' }}</button></form></details>
            <details (toggle)="loadBlockList(number.id, $event)"><summary>Bloquear usuarios en WhatsApp</summary>@if (blockLists()[number.id]; as blockList) { <pre class="wa-block-list">{{ formatBlockList(blockList) }}</pre> }<form class="wa-grid" (submit)="manageBlocks($event, number.id)"><label>Número(s) con lada, separados por coma<input name="users" placeholder="521…" required></label><label>Acción<select name="operation"><option value="POST">Bloquear</option><option value="DELETE">Desbloquear</option></select></label><button>Aplicar</button><button type="button" class="secondary" (click)="loadBlockList(number.id, $event)">Actualizar lista</button></form><small class="wa-muted">Esto solo aplica al bloqueo de WhatsApp y no sustituye la baja interna del contacto.</small></details>
            <details><summary>Editar datos del número</summary><form [action]="'/admin/whatsapp/numbers/' + number.id" method="post" class="wa-grid"><label>Nombre visible<input name="displayName" [value]="number.displayName || ''"></label><label>Teléfono<input name="phoneNumber" [value]="number.phoneNumber"></label><label>Phone Number ID<input name="phoneNumberId" [value]="number.phoneNumberId"></label><button>Guardar número</button></form></details>
          </article> }
          <details class="wa-add"><summary>Agregar otro número</summary><p>Usa las credenciales compartidas de la cuenta y proporciona el Phone Number ID y el nombre visible.</p><form action="/admin/whatsapp/numbers" method="post" class="wa-grid"><label>Nombre visible<input name="displayName"></label><label>Número con lada<input name="phoneNumber" required placeholder="+52…"></label><label>Phone Number ID<input name="phoneNumberId" required></label><button>Agregar número</button></form></details>
        </section>
        <section class="wa-card"><h2>Credenciales de la cuenta</h2><p>Se comparten entre todos los números. Deja los tokens vacíos para conservar los valores; los nuevos se guardan cifrados.</p><div class="wa-credential"><span>Business Account ID</span><b>{{ data()?.account?.businessAccountId }}</b><span>API Version</span><b>{{ data()?.account?.apiVersion }}</b><span>Access Token</span><b>{{ data()?.account?.maskedAccessToken }}</b><span>Verify Token</span><b>{{ data()?.account?.maskedVerifyToken }}</b></div><form action="/admin/whatsapp/credentials" method="post" class="wa-grid"><label>Business Account ID<input name="businessAccountId" [value]="data()?.account?.businessAccountId"></label><label>API Version<input name="apiVersion" [value]="data()?.account?.apiVersion"></label><label>Nuevo access token<input name="accessToken" autocomplete="off" placeholder="Vacío para conservarlo"></label><label>Nuevo verify token<input name="verifyToken" autocomplete="off" placeholder="Vacío para conservarlo"></label><button>Guardar credenciales</button></form></section>
        <section class="wa-card"><h2>Cifrado de credenciales</h2>@if (data()?.account?.encryptedAtRest) { <p class="wa-secure">Las credenciales están cifradas en la base de datos (AES-256-GCM).</p> } @else { <p class="wa-warning">Las credenciales aún no están cifradas. Configura ENCRYPTION_KEY y cifra los datos almacenados.</p><form action="/admin/whatsapp/encrypt-secrets" method="post"><button>Cifrar credenciales existentes</button></form> }</section>
        <section class="wa-webhook"><h2>Webhook</h2><p>Callback que debes registrar en Meta: <code>{{ data()?.webhookUrl }}</code>. Suscribe el evento <code>messages</code>.</p></section>
      }
    }
  `,
  styles: [`:host{display:block;color:#233b35}.wa-heading{margin-bottom:24px}.wa-heading>p{color:#43806a;font-size:11px;font-weight:700;letter-spacing:.13em}.wa-heading h1{margin:6px 0;font-size:29px}.wa-heading span,.wa-card>p,.wa-add>p{color:#6b7b75;line-height:1.6}.wa-card{display:grid;gap:16px;margin:0 0 20px;padding:23px;border:1px solid #e3eae6;border-radius:14px;background:white}.wa-card h2,.wa-webhook h2{margin:0;font-size:19px}.wa-card-heading{display:flex;justify-content:space-between;gap:16px}.wa-card-heading p{margin:5px 0;color:#708078}.wa-card-heading>span,.wa-badges span{padding:5px 9px;border-radius:20px;background:#edf4ef;color:#32664f;font-size:11px}.wa-number{display:grid;gap:14px;padding:17px;border:1px solid #e5ebe7;border-radius:11px}.wa-number h3{margin:0}.wa-number p{margin:5px 0;color:#718079;font-size:12px}.wa-badges,.wa-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.wa-badges span{font-weight:600}.wa-badges .wa-suggested{background:#fff3d6;color:#765511}.wa-actions form{margin:0}.wa-actions button,.wa-card button{padding:9px 13px;border:0;border-radius:7px;background:#19634d;color:#fff;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.wa-actions button.secondary{background:#edf2ef;color:#38574a}.wa-usage{display:grid;gap:9px;padding:12px;background:#f5f8f6;border-radius:9px}.wa-usage div{display:flex;justify-content:space-between;gap:10px;font-size:12px}.wa-usage small{color:#6d7b75}.wa-usage progress{width:100%;height:9px;accent-color:#36a675}.wa-usage progress.alert-progress{accent-color:#dc9a28}.wa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.wa-grid label{display:grid;gap:6px;color:#53655d;font-size:12px;font-weight:650}.wa-grid :is(input,textarea,select){width:100%;padding:10px;border:1px solid #ccd8d1;border-radius:7px;font:inherit}.wa-grid button{align-self:end;justify-self:start}.wa-card aside,.wa-webhook{padding:14px;border-radius:9px;background:#f4f7f5}.wa-card aside p{margin:7px 0;color:#62726b;font-size:12px}.wa-card details,.wa-add{padding-top:12px;border-top:1px solid #e7ede9}.wa-card summary{cursor:pointer;font-weight:650}.wa-credential{display:grid;grid-template-columns:150px 1fr;gap:10px 14px;padding:14px;background:#f6f8f7;border-radius:9px;font-size:12px}.wa-credential span{color:#718078}.wa-credential b{overflow-wrap:anywhere}.wa-secure{color:#276b4c!important}.wa-warning,.wa-alert.error{padding:12px;background:#fff4da;color:#73581d!important;border-radius:8px}.wa-alert{padding:12px;background:#eaf6ef;color:#276b4c;border-radius:8px}.wa-webhook{padding:18px}.wa-webhook p,.wa-muted{color:#566a61;font-size:13px;line-height:1.7;overflow-wrap:anywhere}.wa-empty{padding:12px;background:#fff4da;border-radius:8px}.wa-loading{color:#718078}.wa-number-tools,.wa-health{display:grid;gap:8px}.wa-health,.wa-current-profile,.wa-block-list{margin:0;padding:10px;border-radius:8px;background:#f5f8f6;color:#52645b;font-size:12px;overflow-wrap:anywhere}.wa-block-list{white-space:pre-wrap;max-height:220px;overflow:auto}.wa-card button:disabled{opacity:.65;cursor:wait}.wa-account-health,.wa-analytics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px}.wa-account-health>span,.wa-analytics-grid article{display:grid;gap:5px;padding:12px;border:1px solid #e5ebe7;border-radius:9px;background:#f8faf8}.wa-account-health small,.wa-analytics-grid small,.wa-analytics-heading small{color:#748078;font-size:11px}.wa-account-health b{overflow-wrap:anywhere}.wa-analytics-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;border-top:1px solid #e7ede9}.wa-analytics-heading>div:first-child{display:grid;gap:3px}.wa-periods{display:flex;gap:6px}.wa-periods button{padding:7px 10px!important;border:1px solid #dbe5de!important;color:#365848!important;background:#f5f8f6!important}.wa-periods button.selected{color:#fff!important;background:#19634d!important}.wa-analytics-grid b{font-size:22px}.wa-analytics-grid span{color:#5d6f65;font-size:12px;line-height:1.5}.wa-insight-error{color:#9a453e!important;font-size:12px}.wa-meta-insights details{padding-top:0;border:0}.wa-meta-insights ul{margin:6px 0;padding-left:20px;color:#566a61;font-size:12px}@media(max-width:650px){.wa-card{padding:16px}.wa-card-heading,.wa-usage div,.wa-analytics-heading{display:grid}.wa-credential{grid-template-columns:1fr}.wa-actions{gap:6px}.wa-periods button{flex:1}.wa-periods{width:100%}}`]
})
export class AdminWhatsAppPage {
  protected readonly data = signal<WhatsAppData | null>(null); protected readonly loading = signal(true); protected readonly error = signal(''); protected readonly message = signal('');
  protected readonly health = signal<Record<string, NumberHealth>>({});
  protected readonly healthLoading = signal<Record<string, boolean>>({});
  protected readonly accountHealth = signal<MetaAccountHealth | null>(null);
  protected readonly accountHealthLoading = signal(false);
  protected readonly analytics = signal<MetaAnalytics | null>(null);
  protected readonly analyticsLoading = signal(false);
  protected readonly analyticsDays = signal(30);
  protected readonly profiles = signal<Record<string, ProfileData>>({});
  protected readonly profileSaving = signal<Record<string, boolean>>({});
  protected readonly blockLists = signal<Record<string, unknown>>({});
  protected readonly metaAssetsLoading = signal(false); protected readonly flowSaving = signal(false);
  protected readonly flows = signal<MetaRows | null>(null); protected readonly catalogs = signal<MetaRows | null>(null);
  protected readonly products = signal<Record<string, Array<Record<string, unknown>>>>({});
  protected readonly flowToPublish = signal('');
  constructor() { void this.load(); }
  protected usageById(id: string): Usage | undefined { return this.data()?.usage?.find((row) => row.numberId === id); }
  protected profileValue(id: string, field: string): string {
    const value = this.profiles()[id]?.[field];
    return Array.isArray(value) ? value.join('\n') : value || '';
  }
  protected value(data: Record<string, unknown> | undefined, field: string): string {
    const value = data?.[field];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value && typeof value === 'object') return JSON.stringify(value);
    return 'sin dato';
  }
  protected metaValue(data: Record<string, unknown>, field: string): string {
    const value = data[field];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value && typeof value === 'object') return JSON.stringify(value);
    return 'sin dato';
  }
  protected formatDuration(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  protected async loadAccountHealth(): Promise<void> {
    this.accountHealthLoading.set(true);
    try {
      const response = await fetch('/admin/whatsapp/account-health', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as MetaAccountHealth & { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar el estado WABA.');
      this.accountHealth.set(result);
    } catch (reason) { this.accountHealth.set({ accountError: reason instanceof Error ? reason.message : 'No se pudo consultar el estado WABA.' }); }
    finally { this.accountHealthLoading.set(false); }
  }
  protected async loadAnalytics(days: number): Promise<void> {
    this.analyticsDays.set(days);
    this.analyticsLoading.set(true);
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    try {
      const response = await fetch(`/admin/whatsapp/analytics?start=${start}&end=${end}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as MetaAnalytics & { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la analítica de Meta.');
      this.analytics.set(result);
    } catch (reason) { this.analytics.set({ currency: '', pricing: null, calls: null, pricingError: reason instanceof Error ? reason.message : 'No se pudo consultar la analítica.' }); }
    finally { this.analyticsLoading.set(false); }
  }
  protected throughput(data: Record<string, unknown> | undefined): string {
    const value = data?.['throughput'];
    return value && typeof value === 'object' ? String((value as Record<string, unknown>)['level'] || 'sin dato') : String(value || 'sin dato');
  }
  protected healthName(data: Record<string, unknown> | undefined): string {
    const status = this.value(data, 'name_status');
    return status === 'sin dato' ? this.value(data, 'verified_name') : status;
  }
  protected needsAttention(data: Record<string, unknown> | undefined): boolean {
    return /RESTRICT|DISABLED|BLOCK|REJECT|RED|LOW/.test(`${this.value(data, 'status')} ${this.value(data, 'name_status')} ${this.value(data, 'quality_rating')}`.toUpperCase());
  }
  protected profileSummary(profile: ProfileData): string {
    return [profile['about'], profile['email'], profile['address'], profile['description']].filter(Boolean).join(' · ') || 'sin datos';
  }
  protected formatBlockList(value: unknown): string { return JSON.stringify(value, null, 2); }
  protected async loadMetaAssets(): Promise<void> {
    this.metaAssetsLoading.set(true);
    try {
      const [flowResponse, catalogResponse] = await Promise.all([fetch('/admin/whatsapp/flows', { credentials: 'same-origin', headers: { Accept: 'application/json' } }), fetch('/admin/whatsapp/catalogs', { credentials: 'same-origin', headers: { Accept: 'application/json' } })]);
      const [flowData, catalogData] = await Promise.all([flowResponse.json() as Promise<MetaRows>, catalogResponse.json() as Promise<MetaRows>]);
      if (!flowResponse.ok) throw new Error(flowData.error || 'No se pudieron consultar los Flows.');
      if (!catalogResponse.ok) throw new Error(catalogData.error || 'No se pudieron consultar los catálogos.');
      this.flows.set(flowData); this.catalogs.set(catalogData); this.error.set('');
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudieron consultar los recursos de Meta.'); }
    finally { this.metaAssetsLoading.set(false); }
  }
  protected async createFlow(event: Event): Promise<void> {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const values = new FormData(form);
    const flowJsonText = String(values.get('flowJson') || '').trim(); let flowJson: Record<string, unknown> | undefined;
    if (flowJsonText) { try { const parsed: unknown = JSON.parse(flowJsonText); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); flowJson = parsed as Record<string, unknown>; } catch { this.error.set('El JSON debe ser un objeto válido.'); return; } }
    this.flowSaving.set(true);
    try {
      const response = await fetch('/admin/whatsapp/flows', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: String(values.get('name') || ''), categories: [String(values.get('category') || 'OTHER')], ...(flowJson ? { flowJson } : {}) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo crear el Flow en Meta.');
      form.reset(); this.message.set('Borrador de Flow creado en Meta.'); this.error.set(''); await this.loadMetaAssets();
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo crear el Flow.'); }
    finally { this.flowSaving.set(false); }
  }
  protected async publishFlow(flowId: string): Promise<void> {
    try { const response = await fetch(`/admin/whatsapp/flows/${encodeURIComponent(flowId)}/publish`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'No se pudo publicar el Flow.'); this.flowToPublish.set(''); this.message.set('Flow publicado en Meta.'); await this.loadMetaAssets(); }
    catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo publicar el Flow.'); }
  }
  protected async loadCatalogProducts(catalogId: string): Promise<void> {
    try { const response = await fetch(`/admin/whatsapp/catalogs/${encodeURIComponent(catalogId)}/products`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as MetaRows; if (!response.ok) throw new Error(result.error || 'No se pudieron consultar los productos.'); this.products.update((current) => ({ ...current, [catalogId]: result.data || [] })); }
    catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudieron consultar los productos.'); }
  }
  protected async loadHealth(id: string): Promise<void> {
    this.healthLoading.update((state) => ({ ...state, [id]: true }));
    try {
      const response = await fetch(`/admin/whatsapp/numbers/${encodeURIComponent(id)}/health`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as NumberHealth & { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar el estado del número en Meta.');
      this.health.update((current) => ({ ...current, [id]: result }));
      this.error.set('');
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo consultar el estado del número.'); }
    finally { this.healthLoading.update((state) => ({ ...state, [id]: false })); }
  }
  protected async loadProfile(id: string, event: Event): Promise<void> {
    if (!(event.currentTarget as HTMLDetailsElement | null)?.open || this.profiles()[id]) return;
    try {
      const response = await fetch(`/admin/whatsapp/numbers/${encodeURIComponent(id)}/profile`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as { data?: ProfileData[] } & ProfileData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar el perfil de Meta.');
      const profile = Array.isArray(result.data) ? result.data[0] || {} : result;
      this.profiles.update((current) => ({ ...current, [id]: profile }));
      this.error.set('');
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo cargar el perfil.'); }
  }
  protected async saveProfile(event: Event, id: string): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const profile: ProfileData = {};
    for (const field of ['about', 'email', 'address', 'profile_picture_url', 'description', 'vertical']) profile[field] = String(formData.get(field) || '').trim();
    profile['websites'] = String(formData.get('websites') || '').split(/\r?\n/).map((site) => site.trim()).filter(Boolean);
    this.profileSaving.update((state) => ({ ...state, [id]: true }));
    try {
      const response = await fetch(`/admin/whatsapp/numbers/${encodeURIComponent(id)}/profile`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el perfil de Meta.');
      this.profiles.update((current) => ({ ...current, [id]: profile }));
      this.message.set('Perfil de empresa actualizado en Meta.'); this.error.set('');
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo actualizar el perfil.'); }
    finally { this.profileSaving.update((state) => ({ ...state, [id]: false })); }
  }
  protected async loadBlockList(id: string, event: Event): Promise<void> {
    const target = event.currentTarget as HTMLDetailsElement | null;
    if (target && 'open' in target && !target.open && event.type === 'toggle') return;
    try {
      const response = await fetch(`/admin/whatsapp/numbers/${encodeURIComponent(id)}/blocked-users`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la lista de bloqueos.');
      this.blockLists.update((current) => ({ ...current, [id]: result })); this.error.set('');
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo consultar la lista de bloqueos.'); }
  }
  protected async manageBlocks(event: Event, id: string): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const users = String(values.get('users') || '').split(/[\s,]+/).map((user) => user.trim()).filter(Boolean);
    const method = String(values.get('operation') || 'POST');
    try {
      const response = await fetch(`/admin/whatsapp/numbers/${encodeURIComponent(id)}/blocked-users`, { method, credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify({ users }) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el bloqueo.');
      this.blockLists.update((current) => ({ ...current, [id]: result })); this.message.set(method === 'POST' ? 'Usuario(s) bloqueado(s) en WhatsApp.' : 'Bloqueo(s) retirado(s) en WhatsApp.'); this.error.set(''); form.reset();
    } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'No se pudo cambiar el bloqueo.'); }
  }
  private async load(): Promise<void> { try { const response = await fetch('/admin/whatsapp', { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const result = await response.json() as WhatsAppData; if (!response.ok) throw new Error(result.error || 'No se pudo cargar la cuenta de WhatsApp.'); this.data.set(result); if (result.error) this.error.set(result.error); const success = new URLSearchParams(window.location.search).get('success'); if (success) this.message.set(success === 'connection' ? 'Conexión con Meta validada correctamente.' : success === 'encrypted' ? 'Credenciales cifradas en la base de datos.' : 'Cambios guardados correctamente.'); } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'Ocurrió un error inesperado.'); } finally { this.loading.set(false); } }
}
