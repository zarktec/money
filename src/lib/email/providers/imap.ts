import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlToText } from "../html";
import { HostError, IMAP_PORT, resolvePublicHost } from "../hostguard";
import { ProviderAuthError, ProviderError, type MailFull, type MailMeta, type MailProvider } from "./types";

export interface ImapCreds { host: string; user: string; password: string }
const MAX_MESSAGE_BYTES = 1_000_000;

/**
 * IMAP con contraseña de aplicación. Solo puerto 993 (TLS implícito) y solo servidores públicos: el host lo escribe el usuario,
 * así que se valida y se resuelve una vez, y la conexión va a ESA IP (con el nombre original para el certificado TLS).
 * POP3 no se soporta: no permite leer solo lo reciente ni buscar por fecha, y obligaría a descargar todo el buzón.
 */
export class ImapProvider implements MailProvider {
  private client: ImapFlow | null = null;
  constructor(private creds: ImapCreds) {}

  private async connect(): Promise<ImapFlow> {
    if (this.client) return this.client;
    let target;
    try { target = await resolvePublicHost(this.creds.host); } catch (e) { throw e instanceof HostError ? new ProviderError(e.message) : e; }
    const c = new ImapFlow({
      host: target.ip, port: IMAP_PORT, secure: true, servername: target.host, tls: { servername: target.host, rejectUnauthorized: true },
      auth: { user: this.creds.user, pass: this.creds.password }, logger: false,
      connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 40_000,
    });
    c.on("error", () => { /* los errores de socket llegan por las promesas de cada operación */ });
    try { await c.connect(); } catch (e) {
      if ((e as { authenticationFailed?: boolean }).authenticationFailed) throw new ProviderAuthError("Usuario o contraseña de IMAP incorrectos");
      throw new ProviderError("No se pudo conectar al servidor IMAP");
    }
    this.client = c;
    return c;
  }

  async list(since: Date, max: number): Promise<MailMeta[]> {
    const c = await this.connect();
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    try {
      const found = (await c.search({ since }, { uid: true })) || [];
      const uids = found.slice(-max).reverse();                       // los más nuevos primero
      const out: MailMeta[] = [];
      if (!uids.length) return out;
      for await (const m of c.fetch(uids, { uid: true, envelope: true, internalDate: true, size: true, headers: ["list-unsubscribe"] }, { uid: true })) {
        if ((m.size ?? 0) > MAX_MESSAGE_BYTES * 5) continue;          // mensajes gigantes (adjuntos pesados) no valen el costo
        const f = m.envelope?.from?.[0];
        out.push({
          id: String(m.uid), receivedAt: new Date(m.internalDate ?? Date.now()).toISOString(),
          from: f?.address ? `${f.name ?? ""} <${f.address}>`.trim() : "", subject: m.envelope?.subject ?? "", snippet: "",
          listUnsubscribe: !!m.headers && /list-unsubscribe/i.test(m.headers.toString()),
        });
      }
      return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    } finally { lock.release(); }
  }

  async read(id: string): Promise<MailFull> {
    const c = await this.connect();
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    try {
      const m = await c.fetchOne(id, { uid: true, envelope: true, internalDate: true, source: { maxLength: MAX_MESSAGE_BYTES } }, { uid: true });
      if (!m || !m.source) throw new ProviderError("Mensaje no disponible");
      const parsed = await simpleParser(m.source);
      const text = parsed.text?.trim() ? parsed.text : typeof parsed.html === "string" ? htmlToText(parsed.html, 20_000) : "";
      const f = m.envelope?.from?.[0];
      return { id, receivedAt: new Date(m.internalDate ?? Date.now()).toISOString(), from: f?.address ? `${f.name ?? ""} <${f.address}>`.trim() : "", subject: m.envelope?.subject ?? "", snippet: "", listUnsubscribe: false, body: text.slice(0, 6000) };
    } finally { lock.release(); }
  }

  async close() { try { await this.client?.logout(); } catch { /* ya cerrada */ } this.client = null; }
}
