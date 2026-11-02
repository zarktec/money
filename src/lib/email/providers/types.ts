export interface MailRef { id: string; receivedAt: string }
export interface MailMeta extends MailRef { from: string; subject: string; snippet: string; listUnsubscribe: boolean }
export interface MailFull extends MailMeta { body: string }

/** Contrato común de Gmail, Outlook e IMAP. El motor de sincronización solo conoce esto. */
export interface MailProvider {
  /** Mensajes recibidos desde `since`, del más nuevo al más viejo, hasta `max`. Ya sin promociones si el proveedor lo permite. */
  list(since: Date, max: number): Promise<MailMeta[]>;
  /** Cuerpo en texto plano (HTML convertido) de un mensaje. */
  read(id: string): Promise<MailFull>;
  /** Cierra conexiones abiertas (IMAP). Gmail y Outlook no la necesitan. */
  close?(): Promise<void>;
}

export class ProviderAuthError extends Error {}   // credencial revocada o vencida: hay que reconectar
export class ProviderError extends Error {}
