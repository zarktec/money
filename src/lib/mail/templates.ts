import { formatMoney } from "@/lib/finance/money";

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const base = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

interface Layout { title: string; lines: string[]; cta?: { label: string; path: string }; preheader?: string }
export interface Rendered { subject: string; html: string; text: string }

/** Marco común de los correos: misma identidad visual de la app, estilos en línea (los clientes de correo ignoran las hojas de estilo). */
function layout(subject: string, l: Layout): Rendered {
  const url = (p: string) => `${base()}${p}`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f1a17">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(l.preheader ?? l.lines[0] ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e9e6;border-radius:16px">
<tr><td style="padding:28px 28px 4px"><span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:10px;background:#047857;color:#fff;font-weight:700;font-size:18px">$</span><span style="font-weight:700;font-size:18px;vertical-align:middle;margin-left:8px">Money</span></td></tr>
<tr><td style="padding:8px 28px 8px"><h1 style="margin:12px 0 12px;font-size:20px;line-height:1.3">${escapeHtml(l.title)}</h1>
${l.lines.map((x) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#33443f">${escapeHtml(x)}</p>`).join("")}
${l.cta ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(url(l.cta.path))}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escapeHtml(l.cta.label)}</a></p>` : ""}</td></tr>
<tr><td style="padding:16px 28px 26px"><p style="margin:0;font-size:12px;line-height:1.5;color:#93a39e">Recibes este correo porque tienes una cuenta en Money. <a href="${escapeHtml(url("/cuenta/notificaciones"))}" style="color:#93a39e">Cambiar mis avisos por correo</a>.</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [l.title, "", ...l.lines, ...(l.cta ? ["", `${l.cta.label}: ${url(l.cta.path)}`] : []), "", `Cambiar mis avisos por correo: ${url("/cuenta/notificaciones")}`].join("\n");
  return { subject, html, text };
}

/** Un solo correo con todos los recordatorios del día (no uno por pago). */
export function remindersEmail(items: { title: string; body: string }[]): Rendered {
  const one = items.length === 1;
  return layout(one ? items[0].title : `Tienes ${items.length} recordatorios de pago`, {
    title: one ? items[0].title : "Tus próximos vencimientos",
    lines: items.map((i) => i.body),
    cta: { label: "Ver calendario", path: "/calendario" },
  });
}

export function planExpiringEmail(p: { trial: boolean; planName: string; days: number }): Rendered {
  const when = `${p.days} día${p.days === 1 ? "" : "s"}`;
  return layout(p.trial ? "Tu prueba gratis termina pronto" : "Tu plan vence pronto", {
    title: p.trial ? "Tu prueba gratis termina pronto" : "Tu plan vence pronto",
    lines: [`${p.trial ? "Tu prueba" : `Tu plan ${p.planName}`.trim()} vence en ${when}.`, "Renueva para no perder tus beneficios."],
    cta: { label: "Ver planes", path: "/precios" },
  });
}

export function paymentReceiptEmail(p: { planName: string; amountCents: number; currency: string; reference: string; date: Date }): Rendered {
  return layout("Recibimos tu pago", {
    title: "¡Gracias! Recibimos tu pago",
    lines: [
      `Plan: ${p.planName}`, `Valor: ${formatMoney(p.amountCents, p.currency)}`,
      `Fecha: ${p.date.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" })}`,
      `Referencia: ${p.reference}`,
    ],
    cta: { label: "Ver mi plan", path: "/cuenta/suscripcion" },
  });
}
