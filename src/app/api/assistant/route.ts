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

const body = z.object({ message: z.string().trim().min(1).max(2000), conversationId: z.string().uuid().optional() });
/** Tope de mensajes por conversación: acota el tamaño de lo que se guarda y obliga a empezar de nuevo antes de que el contexto se enrede. */
const MAX_MESSAGES = 200;
const titleOf = (q: string) => (q.length > 60 ? `${q.slice(0, 57).trimEnd()}…` : q);
const fail = (error: string, status: number, extra: object = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Inicia sesión para continuar", 401);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Escribe una pregunta (máximo 2.000 caracteres).", 400);
  const ai = await getAnthropic();
  if (!ai) return fail("El asistente aún no está configurado.", 503);

  const admin = createAdminClient();
  const quota = await aiQuota(admin, user.id);
  if (!quota.allowed) return fail(`Llegaste al límite de ${quota.limit} consultas con IA de este mes. Mejora tu plan para seguir.`, 429, { usage: { used: quota.used, limit: quota.limit } });

  // El historial sale de la base (no del cliente: así no se puede falsificar) y solo cuentan los últimos 6 turnos:
  // acota costo y evita que una conversación larga arrastre contexto viejo.
  const question = parsed.data.message;
  let conversationId = parsed.data.conversationId;
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const { data: conv } = await admin.from("assistant_conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conv) return fail("Esa conversación ya no existe.", 404);
    const { data: rows } = await admin.from("assistant_messages").select("role, content").eq("conversation_id", conversationId).eq("user_id", user.id).order("seq", { ascending: false }).limit(MAX_MESSAGES + 1);
    if ((rows?.length ?? 0) >= MAX_MESSAGES) return fail("Esta conversación ya es muy larga. Empieza una nueva para seguir.", 400);
    history = ((rows ?? []) as { role: "user" | "assistant"; content: string }[]).slice(0, 6).reverse();
  }
  try {
    const r = await runAssistant(ai.client, { db: supabase, today: todayISO() }, history, question);
    await recordAiUsage(admin, user.id, "assistant", r.inputTokens, r.outputTokens, ai.model);
    // Guardar la conversación es secundario: si falla, el usuario igual recibe su respuesta.
    try {
      if (!conversationId) {
        const { data: c, error } = await admin.from("assistant_conversations").insert({ user_id: user.id, title: titleOf(question) }).select("id").single();
        if (error || !c) throw new Error("conversación");
        conversationId = c.id;
      } else {
        const { error } = await admin.from("assistant_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", user.id);
        if (error) throw new Error("conversación");
      }
      const { error: e2 } = await admin.from("assistant_messages").insert([
        { conversation_id: conversationId, user_id: user.id, role: "user", content: question },
        { conversation_id: conversationId, user_id: user.id, role: "assistant", content: r.reply.slice(0, 20000) },
      ]);
      if (e2) throw new Error("mensajes");
    } catch (e) { console.error("assistant history", e instanceof Error ? e.name : "error"); conversationId = undefined; }
    return NextResponse.json({ reply: r.reply, conversationId: conversationId ?? null, usage: { used: quota.used + 1, limit: quota.limit } });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail("El servicio de IA está muy ocupado. Inténtalo en un minuto.", 503);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { console.error("Anthropic auth error", e.status); return fail("El asistente no está disponible en este momento.", 503); }
    if (e instanceof Anthropic.APIError) { console.error("Anthropic API error", e.status); return fail("No se pudo responder. Inténtalo de nuevo.", 502); }
    throw e;
  }
}
