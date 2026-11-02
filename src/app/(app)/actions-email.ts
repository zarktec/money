"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits, numericLimit } from "@/lib/plan-limits";
import { ImapProvider } from "@/lib/email/providers/imap";
import { ProviderAuthError } from "@/lib/email/providers/types";
import { decryptSecret } from "@/lib/email/crypto";
import { runSync, sealSecret, secretAad } from "@/lib/email/service";
import { type FormState } from "@/lib/forms/schemas";
import { nextOccurrence } from "@/lib/finance/recurrence";

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/** La conexión debe ser del usuario (la lectura pasa por RLS y solo ve columnas no secretas). */
async function ownConnection(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("email_connections").select("id, email, provider").eq("id", id).maybeSingle();
  return data;
}
const refresh = () => ["/correo", "/movimientos", "/inicio"].forEach((p) => revalidatePath(p));

const imapSchema = z.object({
  host: z.string().trim().min(3, "Escribe el servidor IMAP").max(253),
  user: z.string().trim().min(3, "Escribe tu correo o usuario").max(254),
  password: z.string().min(1, "Escribe la contraseña de aplicación").max(200),
  account_id: z.string().min(1, "Elige la cuenta donde se registrarán los movimientos"),
});

export async function connectImap(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase, userId } = await ctx();
  const parsed = imapSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const { data: acc } = await supabase.from("accounts").select("id").eq("id", v.account_id).maybeSingle();
  if (!acc) return { error: "Cuenta inválida" };
  const admin = createAdminClient();
  const { count } = await supabase.from("email_connections").select("id", { count: "exact", head: true }).eq("active", true);
  if ((count ?? 0) >= numericLimit(await getPlanLimits(admin, userId), "email_connections", 0)) return { error: "Tu plan no incluye más cuentas de correo." };

  // Se prueba la conexión ANTES de guardar nada: así no se almacenan credenciales que no funcionan.
  const probe = new ImapProvider({ host: v.host, user: v.user, password: v.password });
  try { await probe.list(new Date(Date.now() - 86_400_000), 1); }
  catch (e) {
    if (e instanceof ProviderAuthError) return { error: "Usuario o contraseña incorrectos. En Gmail, iCloud o Yahoo usa una contraseña de aplicación, no la normal." };
    return { error: e instanceof Error && e.message ? e.message : "No se pudo conectar al servidor." };
  } finally { await probe.close(); }

  const email = v.user.toLowerCase();
  const { error } = await admin.from("email_connections").upsert({
    user_id: userId, provider: "imap", email, secret_encrypted: sealSecret(userId, email, { host: v.host, user: v.user, password: v.password }),
    default_account_id: acc.id, active: true, last_error: null, last_sync_at: null,
  }, { onConflict: "user_id,email" });
  if (error) return { error: "No se pudo guardar la conexión." };
  refresh();
  redirect("/correo?conectado=1");
}

export async function syncNow(fd: FormData) {
  const { supabase } = await ctx();
  const c = await ownConnection(supabase, String(fd.get("id")));
  if (!c) return;
  try { await runSync(c.id, { maxAi: 15, deadline: Date.now() + 45_000 }); } catch { /* el motor ya anotó last_error */ }
  refresh();
}

export async function setConnectionAccount(fd: FormData) {
  const { supabase } = await ctx();
  const c = await ownConnection(supabase, String(fd.get("id")));
  const { data: acc } = await supabase.from("accounts").select("id").eq("id", String(fd.get("account_id"))).maybeSingle();
  if (!c || !acc) return;
  await createAdminClient().from("email_connections").update({ default_account_id: acc.id }).eq("id", c.id);
  refresh();
}

/** Desconectar borra la conexión y sus credenciales. Con Google además se revoca el permiso en su servidor (mejor esfuerzo). */
export async function disconnectEmail(fd: FormData) {
  const { supabase, userId } = await ctx();
  const c = await ownConnection(supabase, String(fd.get("id")));
  if (!c) return;
  const admin = createAdminClient();
  if (c.provider === "gmail") {
    try {
      const { data: row } = await admin.from("email_connections").select("secret_encrypted").eq("id", c.id).maybeSingle();
      const token = JSON.parse(decryptSecret(row!.secret_encrypted, secretAad(userId, c.email))).refreshToken as string;
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
    } catch { /* si falla, el usuario también puede revocarlo desde su cuenta de Google */ }
  }
  await admin.from("email_connections").delete().eq("id", c.id);
  refresh();
}

// ---------- Suscripciones detectadas → fijo ----------
const candidateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amount_cents: z.coerce.number().int().positive().max(1e14),
  cadence: z.enum(["weekly", "monthly", "annual"]),
  next_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_id: z.string().min(1),
  category_id: z.string().optional().transform((s) => s || null),
});

export async function createRuleFromCandidate(fd: FormData) {
  const { supabase, userId } = await ctx();
  const parsed = candidateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return;
  const v = parsed.data;
  const { data: acc } = await supabase.from("accounts").select("id").eq("id", v.account_id).maybeSingle();
  if (!acc) return;
  // El próximo vencimiento nunca queda en el pasado: si el último cobro ya "venció", se avanza al siguiente periodo.
  let next = v.next_date;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 24 && next < today; i++) next = nextOccurrence(next, v.cadence);
  await supabase.from("recurring_rules").insert({
    user_id: userId, type: "expense", name: v.name, amount_cents: v.amount_cents, frequency: v.cadence, first_date: v.next_date, next_date: next,
    account_id: acc.id, category_id: v.category_id, auto_register: false, provision_enabled: v.cadence === "annual",
  });
  ["/recurrentes", "/suscripciones", "/calendario", "/inicio"].forEach((p) => revalidatePath(p));
}

