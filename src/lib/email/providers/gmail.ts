import { htmlToText } from "../html";
import { ProviderAuthError, ProviderError, type MailFull, type MailMeta, type MailProvider } from "./types";

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type Msg = { id: string; internalDate?: string; snippet?: string; payload?: Part & { headers?: { name: string; value: string }[] } };

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const header = (m: Msg, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";

/** Texto del mensaje: prefiere text/plain; si solo hay HTML, lo convierte. */
export function gmailBody(p: Part | undefined): string {
  if (!p) return "";
  const walk = (x: Part, mime: string): string | null => {
    if (x.mimeType === mime && x.body?.data) return b64url(x.body.data);
    for (const c of x.parts ?? []) { const r = walk(c, mime); if (r) return r; }
    return null;
  };
  const plain = walk(p, "text/plain");
  if (plain?.trim()) return plain;
  const html = walk(p, "text/html");
  return html ? htmlToText(html, 20_000) : "";
}

export class GmailProvider implements MailProvider {
  constructor(private token: string, private base = "https://gmail.googleapis.com/gmail/v1/users/me") {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.base + path, { headers: { authorization: `Bearer ${this.token}` } });
    if (res.status === 401 || res.status === 403) throw new ProviderAuthError("Gmail rechazó la credencial");
    if (!res.ok) throw new ProviderError(`Gmail ${res.status}`);
    return (await res.json()) as T;
  }

  async list(since: Date, max: number): Promise<MailMeta[]> {
    // Las categorías de Gmail (promociones, social, foros) ya sacan la mayor parte del ruido antes de que lo veamos.
    const q = encodeURIComponent(`after:${Math.floor(since.getTime() / 1000)} -category:promotions -category:social -category:forums -in:spam -in:trash`);
    const ids: string[] = [];
    let page = "";
    while (ids.length < max) {
      const r = await this.get<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?q=${q}&maxResults=${Math.min(100, max - ids.length)}${page}`);
      ids.push(...(r.messages ?? []).map((m) => m.id));
      if (!r.nextPageToken) break;
      page = `&pageToken=${r.nextPageToken}`;
    }
    const out: MailMeta[] = [];
    for (const id of ids.slice(0, max)) {
      const m = await this.get<Msg>(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`);
      out.push({ id, receivedAt: new Date(Number(m.internalDate)).toISOString(), from: header(m, "from"), subject: header(m, "subject"), snippet: m.snippet ?? "", listUnsubscribe: !!header(m, "list-unsubscribe") });
    }
    return out;
  }

  async read(id: string): Promise<MailFull> {
    const m = await this.get<Msg>(`/messages/${id}?format=full`);
    return { id, receivedAt: new Date(Number(m.internalDate)).toISOString(), from: header(m, "from"), subject: header(m, "subject"), snippet: m.snippet ?? "", listUnsubscribe: !!header(m, "list-unsubscribe"), body: gmailBody(m.payload).slice(0, 6000) };
  }
}
