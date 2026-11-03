import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/dates";
import { getAnthropic } from "@/lib/ai/client";
import { aiQuota, recordAiUsage } from "@/lib/ai/usage";
import { runAssistant } from "@/lib/assistant/run";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(30),
});
const fail = (error: string, status: number, extra: object = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Inicia sesión para continuar", 401);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return fail("Escribe una pregunta (máximo 2.000 caracteres).", 400);
  const ai = await getAnthropic();
  if (!ai) return fail("El asistente aún no está configurado.", 503);

  const admin = createAdminClient();
  const quota = await aiQuota(admin, user.id);
  if (!quota.allowed) return fail(`Llegaste al límite de ${quota.limit} consultas con IA de este mes. Mejora tu plan para seguir.`, 429, { usage: { used: quota.used, limit: quota.limit } });

  // Solo los últimos 6 turnos: acota costo y evita que una conversación larga arrastre contexto viejo.
  const all = parsed.data.messages, question = all.at(-1)!.content;
  const history = all.slice(0, -1).slice(-6);
  try {
    const r = await runAssistant(ai.client, { db: supabase, today: todayISO() }, history, question);
    await recordAiUsage(admin, user.id, "assistant", r.inputTokens, r.outputTokens, ai.model);
    return NextResponse.json({ reply: r.reply, usage: { used: quota.used + 1, limit: quota.limit } });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail("El servicio de IA está muy ocupado. Inténtalo en un minuto.", 503);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { console.error("Anthropic auth error", e.status); return fail("El asistente no está disponible en este momento.", 503); }
    if (e instanceof Anthropic.APIError) { console.error("Anthropic API error", e.status); return fail("No se pudo responder. Inténtalo de nuevo.", 502); }
    throw e;
  }
}
