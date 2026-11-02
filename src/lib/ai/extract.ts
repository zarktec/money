import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractionSchema, type Extraction } from "./schema";
import { MODE_INSTRUCTIONS, buildSystemPrompt } from "./prompts";

export type AiErrorCode = "not_configured" | "refusal" | "truncated" | "invalid" | "busy" | "auth" | "api";
export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) { super(message); }
}

export type AiClient = { messages: { create: Anthropic["messages"]["create"] } };
export type ExtractInput =
  | { mode: "text"; text: string; today: string; categories: string[] }
  | { mode: "receipt"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string; today: string; categories: string[] }
  | { mode: "statement"; pdfBase64: string; today: string; categories: string[] }
  // Para un correo, `today` es la fecha del correo (así "hoy" dentro del mensaje se resuelve bien).
  | { mode: "email"; from: string; subject: string; body: string; today: string; categories: string[] };

/** El modelo es decisión del dueño de la app: por defecto el recomendado por Anthropic; se puede abaratar con ANTHROPIC_MODEL. */
export const aiModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function buildContent(i: ExtractInput): Anthropic.ContentBlockParam[] {
  const instruction = { type: "text" as const, text: MODE_INSTRUCTIONS[i.mode] };
  if (i.mode === "text") return [{ type: "text", text: `${instruction.text}\n\n<texto_del_usuario>\n${i.text}\n</texto_del_usuario>` }];
  if (i.mode === "email") return [{ type: "text", text: `${instruction.text}\n\n<correo>\nDe: ${i.from}\nAsunto: ${i.subject}\nFecha: ${i.today}\n\n${i.body}\n</correo>` }];
  if (i.mode === "receipt") return [{ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.base64 } }, instruction];
  return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: i.pdfBase64 } }, instruction];
}

export async function extractTransactions(client: AiClient, i: ExtractInput): Promise<{ extraction: Extraction; inputTokens: number; outputTokens: number }> {
  // Se usa create (no parse) a propósito: parse lanza una excepción genérica si la salida se corta por max_tokens,
  // y entonces nunca llegaríamos a revisar stop_reason para dar un mensaje útil.
  const response = (await client.messages.create({
    model: aiModel(),
    max_tokens: 16000,
    system: buildSystemPrompt({ today: i.today, categories: i.categories }),
    messages: [{ role: "user", content: buildContent(i) }],
    // effort bajo: es una extracción, no un problema de razonamiento; reduce costo y latencia.
    output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
  })) as Anthropic.Message;

  if (response.stop_reason === "refusal") throw new AiError("refusal", "La IA no pudo procesar este contenido.");
  if (response.stop_reason === "max_tokens") throw new AiError("truncated", "El documento tiene demasiados movimientos para leerlo de una vez. Divídelo en partes más pequeñas.");
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  let json: unknown;
  try { json = JSON.parse(text ?? ""); } catch { throw new AiError("invalid", "No se pudo interpretar la respuesta de la IA. Inténtalo de nuevo."); }
  const parsed = ExtractionSchema.safeParse(json);
  if (!parsed.success) throw new AiError("invalid", "No se pudo interpretar la respuesta de la IA. Inténtalo de nuevo.");
  return { extraction: parsed.data, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}
