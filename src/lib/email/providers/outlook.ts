import { htmlToText } from "../html";
import { ProviderAuthError, ProviderError, type MailFull, type MailMeta, type MailProvider } from "./types";

type GraphMsg = { id: string; subject?: string; bodyPreview?: string; receivedDateTime: string; from?: { emailAddress?: { name?: string; address?: string } }; body?: { contentType?: string; content?: string } };
const fromOf = (m: GraphMsg) => { const e = m.from?.emailAddress; return e?.address ? `${e.name ?? ""} <${e.address}>`.trim() : ""; };

export class OutlookProvider implements MailProvider {
  constructor(private token: string, private base = "https://graph.microsoft.com/v1.0/me") {}

  private async get<T>(pathOrUrl: string): Promise<T> {
    const res = await fetch(pathOrUrl.startsWith("http") ? pathOrUrl : this.base + pathOrUrl, { headers: { authorization: `Bearer ${this.token}`, prefer: 'outlook.body-content-type="text"' } });
    if (res.status === 401 || res.status === 403) throw new ProviderAuthError("Outlook rechazó la credencial");
    if (!res.ok) throw new ProviderError(`Outlook ${res.status}`);
    return (await res.json()) as T;
  }

  async list(since: Date, max: number): Promise<MailMeta[]> {
    const out: MailMeta[] = [];
    let url: string | null = `/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since.toISOString()}&$orderby=receivedDateTime desc&$top=${Math.min(50, max)}&$select=id,subject,from,receivedDateTime,bodyPreview`;
    while (url && out.length < max) {
      const r: { value: GraphMsg[]; "@odata.nextLink"?: string } = await this.get(url);
      for (const m of r.value) out.push({ id: m.id, receivedAt: m.receivedDateTime, from: fromOf(m), subject: m.subject ?? "", snippet: m.bodyPreview ?? "", listUnsubscribe: false });
      url = r["@odata.nextLink"] ?? null;
    }
    return out.slice(0, max);
  }

  async read(id: string): Promise<MailFull> {
    const m = await this.get<GraphMsg>(`/messages/${encodeURIComponent(id)}?$select=id,subject,from,receivedDateTime,bodyPreview,body`);
    const content = m.body?.content ?? "";
    return { id, receivedAt: m.receivedDateTime, from: fromOf(m), subject: m.subject ?? "", snippet: m.bodyPreview ?? "", listUnsubscribe: false, body: (m.body?.contentType === "html" ? htmlToText(content, 20_000) : content).slice(0, 6000) };
  }
}
