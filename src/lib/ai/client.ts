import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getIntegration } from "@/lib/integrations/store";
import { aiModel, type AiClient } from "./extract";

/**
 * Cliente de IA con las credenciales del panel de admin (o, si no hay, las variables de entorno). null si no hay API key.
 * El cliente devuelto fija el modelo configurado en cada llamada; `model` se devuelve también para registrar el consumo.
 */
export async function getAnthropic(): Promise<{ client: AiClient; model: string } | null> {
  const c = await getIntegration("anthropic");
  if (!c.api_key) return null;
  const model = c.model || aiModel();
  const sdk = new Anthropic({ apiKey: c.api_key });
  const create = ((params: object, opts?: object) => (sdk.messages.create as (p: object, o?: object) => unknown)({ ...params, model }, opts)) as unknown as AiClient["messages"]["create"];
  return { client: { messages: { create } }, model };
}
