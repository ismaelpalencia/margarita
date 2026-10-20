import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";
const ROOT = process.cwd();
const ICON = path.join(ROOT, "marca", "sello", "margarita-sello-256.png");
const LOGO = path.join(ROOT, "marca", "logotipo", "margarita-logotipo-512.png");
const S = [
  { k: "Propuesta comercial", t: "Cobra por WhatsApp sin perder la ventana de recuperación", b: "Para despachos de cobranza y PyMEs en México.", f: "contacto@margaritaapp.org  ·  55 3878 3682  ·  margaritaapp.org", cover: true },
  { k: "El problema", t: "Rotaba de número para no quedarme sin canal", b: "Trabajé cobranza con WhatsApp normal y WhatsApp Business. Cuando Meta bajaba la calificación del número, los mensajes dejaban de salir y había que empezar con otro. Cada cambio rompía el historial: quién prometió, cuánto y para cuándo.", q: "El problema no era cobrar. Era sostener el canal mientras cobraba." },
  { k: "El costo real", t: "Lo que se pierde cuando la cobranza vive en el celular", l: ["Mensajes que no salen porque el número quedó limitado.", "Promesas apuntadas en una libreta o en la cabeza del cobrador.", "Un Excel que nadie actualiza y que no dice a quién llamar hoy.", "Clientes que dejan de responder y nadie vuelve a intentarlo."] },
  { k: "La respuesta", t: "Margarita opera la API oficial de WhatsApp", b: "Un panel para enviar plantillas aprobadas, atender conversaciones, registrar en qué quedó cada cliente y trabajar la lista del día. Varios números de la misma cuenta, con su bandeja y su calidad por separado.", l: ["Campañas en cola, con pausa y reintento.", "Botones que registran el resultado solos.", "Reportes en CSV para el control de la operación."] },
  { k: "El día de trabajo", t: "La lista que dice a quién llamar primero", l: ["Pidieron que los llamen: arriba, con el tiempo de espera.", "Promesas vencidas y las que vencen hoy.", "Clientes sin contestar tras varios intentos.", "Cada conversación termina en un resultado con fecha y monto."] },
  { k: "Por qué funciona", t: "La confianza del cliente se nota en el pago", b: "Cuando el deudor recibe un mensaje claro, con su nombre y su saldo, y alguien le da seguimiento, contesta. Contesta, promete y paga. La herramienta no inventa la confianza: la sostiene, porque cada promesa queda registrada y se vuelve a tocar en la fecha acordada." },
  { k: "Varios números", t: "Si un número baja de calidad, el equipo sigue", b: "Los números viven en la misma cuenta de WhatsApp Business. Cada uno tiene su bandeja, su calidad y su tramo de mensajes. El panel cambia de número con un selector y el dashboard muestra solo ese canal. Un número castigado no detiene la cobranza." },
  { k: "La cuenta", t: "Se invierte una parte de lo que se recupera", l: ["Paquete A, llave en mano: 3,500 MXN más IVA, con la conexión a Meta incluida.", "Paquete B, ya tengo Meta: 2,500 MXN más IVA.", "Mensualidad: 699 MXN más IVA. Compromisos opcionales con descuento.", "Primer mes de piloto. El consumo de WhatsApp se paga a Meta."], n: "Una sola cobranza recuperada paga varios meses de plataforma." },
  { k: "Confianza", t: "Datos cifrados y respaldo fuera del servidor", l: ["Teléfonos, nombres, mensajes, notas y correos cifrados.", "Verificación en dos pasos y sesiones revocables.", "Respaldos diarios cifrados, copiados a Cloudflare R2.", "Bitácora de quién hizo qué y cuándo."] },
  { k: "Siguiente paso", t: "Agenda una demo", b: "Te mostramos la herramienta con una cartera de ejemplo y revisamos qué necesitas para arrancar: cuenta de Meta, número, plantillas y método de pago.", f: "WhatsApp 55 3878 3682  ·  contacto@margaritaapp.org  ·  margaritaapp.org", close: true }
];
const V = "17865a", D = "0f4632", Y = "fbbe1f", T = "0f172a", G = "475569";
const pptx = new pptxgen();
pptx.defineLayout({ name: "MARGARITA", width: 10, height: 7.5 });
pptx.layout = "MARGARITA";
pptx.author = "Margarita";
pptx.subject = "Cobranza por WhatsApp";
for (const [i, s] of S.entries()) {
  const p = pptx.addSlide();
  p.background = { color: "FFFFFF" };
  p.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: V } });
  if (s.cover) {
    p.addImage({ path: ICON, x: 0.9, y: 0.9, w: 1.1, h: 1.1 });
    p.addText(s.k.toUpperCase(), { x: 0.9, y: 2.3, w: 8, h: 0.4, fontSize: 14, bold: true, color: V, charSpacing: 1 });
    p.addText(s.t, { x: 0.9, y: 2.8, w: 8.4, h: 1.9, fontSize: 40, bold: true, color: D, lineSpacing: 42 });
    p.addText(s.b, { x: 0.9, y: 4.9, w: 8.4, h: 0.6, fontSize: 20, color: G });
    p.addText(s.f, { x: 0.9, y: 6.6, w: 8.4, h: 0.4, fontSize: 12, color: G });
    continue;
  }
  if (s.close) {
    p.addImage({ path: ICON, x: 0.9, y: 0.8, w: 0.9, h: 0.9 });
    p.addText(s.k.toUpperCase(), { x: 0.9, y: 2.0, w: 8, h: 0.35, fontSize: 13, bold: true, color: V, charSpacing: 1 });
    p.addText(s.t, { x: 0.9, y: 2.4, w: 8.4, h: 1.1, fontSize: 42, bold: true, color: D });
    p.addText(s.b, { x: 0.9, y: 3.6, w: 8.2, h: 1.2, fontSize: 18, color: G, lineSpacing: 26 });
    p.addText(s.f, { x: 0.9, y: 6.6, w: 8.4, h: 0.4, fontSize: 12, color: G });
    continue;
  }
  p.addText(s.k.toUpperCase(), { x: 0.9, y: 0.55, w: 8, h: 0.35, fontSize: 13, bold: true, color: V, charSpacing: 1 });
  p.addText(s.t, { x: 0.9, y: 1.0, w: 8.4, h: 1.5, fontSize: 32, bold: true, color: D, lineSpacing: 36 });
  if (s.b) p.addText(s.b, { x: 0.9, y: 2.6, w: 8.2, h: 1.9, fontSize: 18, color: T, lineSpacing: 28 });
  if (s.l) p.addText(s.l.map((t) => ({ text: t, options: { bullet: { code: "2022" }, fontSize: 18, color: T, breakLine: true } })), { x: 0.9, y: s.b ? 4.4 : 2.7, w: 8.2, h: 3.2, lineSpacing: 30 });
  if (s.q) { p.addShape(pptx.ShapeType.rect, { x: 0.9, y: 6.0, w: 0.06, h: 0.8, fill: { color: Y } }); p.addText(s.q, { x: 1.1, y: 5.95, w: 8, h: 0.9, fontSize: 16, italic: true, color: D }); }
  if (s.n) p.addText(s.n, { x: 0.9, y: 6.3, w: 8.2, h: 0.6, fontSize: 14, color: G });
  p.addText(String(i + 1), { x: 9.2, y: 6.9, w: 0.4, h: 0.3, fontSize: 11, color: "94a3b8" });
}
const dir = path.join(ROOT, "output", "presentacion");
fs.mkdirSync(dir, { recursive: true });
await pptx.writeFile({ fileName: path.join(dir, "margarita.pptx") });
const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
const html = S.map((s, i) => s.cover
  ? `<section class="slide active"><img class="logo" src="${b64(LOGO)}"><p class="k">${s.k}</p><h1>${s.t}</h1><p class="b">${s.b}</p><p class="f">${s.f}</p></section>`
  : s.close
  ? `<section class="slide"><img class="seal" src="${b64(ICON)}"><p class="k">${s.k}</p><h1>${s.t}</h1><p class="b">${s.b}</p><p class="f">${s.f}</p></section>`
  : `<section class="slide"><p class="k">${s.k}</p><h1>${s.t}</h1>${s.b ? `<p class="b">${s.b}</p>` : ""}${s.l ? `<ul>${s.l.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}${s.q ? `<blockquote>${s.q}</blockquote>` : ""}${s.n ? `<p class="n">${s.n}</p>` : ""}<span class="pg">${i + 1}</span></section>`).join("");
const page = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Margarita</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1220;font-family:"DejaVu Sans","Segoe UI",system-ui,sans-serif;color:#0f172a}
.slide{display:none;width:100vw;height:100vh;padding:7vh 8vw 6vh 9vw;background:#fff;position:relative}
.slide.on{display:flex;flex-direction:column;justify-content:center}
.slide:before{content:"";position:absolute;left:0;top:0;bottom:0;width:1.6vw;background:#17865a}
h1{font-size:clamp(28px,4.2vw,56px);line-height:1.1;color:#0f4632;margin:.4em 0 .5em;max-width:85%}
.k{text-transform:uppercase;letter-spacing:.12em;font-size:clamp(11px,1vw,14px);font-weight:700;color:#17865a;margin:0}
.b{font-size:clamp(15px,1.6vw,22px);line-height:1.55;color:#475569;max-width:80%;margin:.3em 0 1em}
ul{margin:.4em 0 0;padding:0;list-style:none;max-width:80%}
li{font-size:clamp(14px,1.45vw,20px);line-height:1.5;margin:.55em 0;padding-left:1.4em;position:relative}
li:before{content:"";position:absolute;left:0;top:.55em;width:.55em;height:.55em;border-radius:50%;background:#fbbe1f}
blockquote{margin:1.2em 0 0;padding:.6em 0 .6em 1em;border-left:4px solid #fbbe1f;font-style:italic;color:#0f4632;font-size:clamp(14px,1.4vw,19px);max-width:75%}
.n{color:#475569;font-size:clamp(12px,1.15vw,16px);margin-top:1.2em}
.logo{max-width:42vw;max-height:12vh;margin-bottom:2vh}.seal{width:clamp(60px,7vw,96px);margin-bottom:1.5vh}
.f{position:absolute;bottom:5vh;left:9vw;color:#475569;font-size:clamp(11px,1vw,14px)}
.pg{position:absolute;bottom:4vh;right:5vw;color:#94a3b8;font-size:12px}
@media print{.slide{display:flex!important;page-break-after:always;width:100%;height:100vh}}
</style></head><body>${html}<script>const s=[...document.querySelectorAll(".slide")];let i=0;function go(n){s[i].classList.remove("on");i=Math.max(0,Math.min(s.length-1,n));s[i].classList.add("on")}document.addEventListener("keydown",e=>{if(["ArrowRight","PageDown"," "].includes(e.key))go(i+1);if(["ArrowLeft","PageUp"].includes(e.key))go(i-1);if(e.key==="f")document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()});document.addEventListener("click",()=>go(i+1));go(0)</script></body></html>`;
fs.mkdirSync(path.join(ROOT, "presentacion"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "presentacion", "index.html"), page);
console.log("PPTX:", path.join(dir, "margarita.pptx"));
console.log("HTML:", path.join(ROOT, "presentacion", "index.html"));
