import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendMail, mailConfigured } = await import("./resend");
const { escapeHtml, remindersEmail, planExpiringEmail, paymentReceiptEmail } = await import("./templates");

const fetchMock = vi.fn();
const reply = (status: number, body: object) => fetchMock.mockResolvedValueOnce({ ok: status < 300, status, json: async () => body });
const mail = { to: "ana@correo.co", subject: "Hola", html: "<p>Hola</p>", text: "Hola", idempotencyKey: "k1" };

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test"; process.env.MAIL_FROM = "Money <avisos@mail.test>"; process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.MAIL_REPLY_TO; });

describe("sendMail (Resend)", () => {
  it("sin variables no envía ni llama a la red", async () => {
    delete process.env.RESEND_API_KEY;
    expect(mailConfigured()).toBe(false);
    expect(await sendMail(mail)).toMatchObject({ ok: false, transient: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("envía con la llave, el remitente, la llave de idempotencia y el enlace para darse de baja", async () => {
    reply(200, { id: "em_1" });
    expect(await sendMail(mail)).toEqual({ ok: true, id: "em_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test", "Idempotency-Key": "k1" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "Money <avisos@mail.test>", to: ["ana@correo.co"], subject: "Hola" });
    expect(body.headers["List-Unsubscribe"]).toBe("<https://app.test/cuenta/notificaciones>");
    expect(body.reply_to).toBeUndefined();
  });
  it("429 y 5xx son reintentables; 4xx (dirección o dominio inválido) no", async () => {
    reply(429, { message: "rate limit" }); reply(503, {}); reply(422, { message: "domain not verified" });
    expect(await sendMail(mail)).toMatchObject({ ok: false, transient: true });
    expect(await sendMail(mail)).toMatchObject({ ok: false, transient: true });
    expect(await sendMail(mail)).toMatchObject({ ok: false, transient: false, error: expect.stringContaining("domain not verified") });
  });
  it("una caída de red se trata como temporal y no lanza", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendMail(mail)).toMatchObject({ ok: false, transient: true, error: "ECONNRESET" });
  });
});

describe("plantillas", () => {
  it("escapan el HTML de lo que escribe el usuario (nombre de un pago)", () => {
    expect(escapeHtml(`<img src=x onerror="a()">&'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
    const r = remindersEmail([{ title: "Pago por vencer", body: `<script>alert(1)</script> vence hoy` }]);
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
  it("un recordatorio usa su título; varios se agrupan en un solo correo", () => {
    expect(remindersEmail([{ title: "Pago por vencer", body: "Arriendo vence hoy" }]).subject).toBe("Pago por vencer");
    const many = remindersEmail([{ title: "a", body: "uno" }, { title: "b", body: "dos" }]);
    expect(many.subject).toBe("Tienes 2 recordatorios de pago");
    expect(many.text).toContain("uno"); expect(many.text).toContain("dos");
  });
  it("incluyen enlaces absolutos y la baja de avisos", () => {
    const r = planExpiringEmail({ trial: true, planName: "Pro", days: 1 });
    expect(r.subject).toBe("Tu prueba gratis termina pronto");
    expect(r.text).toContain("vence en 1 día."); expect(r.html).toContain("https://app.test/precios"); expect(r.html).toContain("https://app.test/cuenta/notificaciones");
  });
  it("el recibo muestra plan, valor y referencia", () => {
    const r = paymentReceiptEmail({ planName: "Pro", amountCents: 2_990_000, currency: "COP", reference: "money-1", date: new Date("2026-11-02T15:00:00Z") });
    expect(r.text).toMatch(/Plan: Pro/); expect(r.text).toMatch(/29\.900/); expect(r.text).toContain("money-1"); expect(r.text).toContain("2 de noviembre de 2026");
  });
});
