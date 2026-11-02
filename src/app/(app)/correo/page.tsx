import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ImapForm } from "@/components/imap-form";
import { getFormOptions } from "@/lib/options";
import { oauthConfig } from "@/lib/email/service";
import { getPlanLimits, numericLimit } from "@/lib/plan-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnectEmail, setConnectionAccount, syncNow } from "../actions-email";

export const metadata = { title: "Correo" };
const LABEL = { gmail: "Gmail", outlook: "Outlook", imap: "IMAP" } as const;

export default async function Correo({ searchParams }: { searchParams: Promise<{ conectado?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Solo columnas permitidas: la tabla no deja leer los secretos desde el cliente.
  const [{ data: conns }, o, limits] = await Promise.all([
    supabase.from("email_connections").select("id, provider, email, last_sync_at, active, default_account_id, last_error, last_stats").order("created_at"),
    getFormOptions(),
    getPlanLimits(createAdminClient(), user!.id),
  ]);
  const maxConns = numericLimit(limits, "email_connections", 0);
  const used = (conns ?? []).filter((c) => c.active).length;
  const canAdd = used < maxConns;
  const hasAccounts = o.accounts.length > 0;
  const google = !!oauthConfig("google"), microsoft = !!oauthConfig("microsoft");
  const accountName = (id: string | null) => o.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Correo</h1><p className="text-sm text-muted">Detecta compras, cobros y pagos en tu correo y los deja para que los revises.</p></header>
      {sp.conectado && <p className="rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand">¡Cuenta conectada! La primera lectura se hace en la próxima sincronización, o toca «Sincronizar ahora».</p>}
      {sp.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{sp.error}</p>}

      {(conns ?? []).map((c) => {
        const s = c.last_stats as { created?: number; processed?: number; ignored?: number } | null;
        return (
          <Card key={c.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{c.email}</p>
              <p className="text-xs text-muted">{LABEL[c.provider as keyof typeof LABEL]} · {c.active ? (c.last_sync_at ? `última lectura ${new Date(c.last_sync_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}` : "aún sin leer") : "desconectada"}</p></div></div>
            {c.last_error && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{c.last_error}</p>}
            {s && <p className="text-xs text-muted">Última corrida: {s.created ?? 0} movimientos nuevos, {s.ignored ?? 0} correos descartados.</p>}
            <form action={setConnectionAccount} className="flex items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label className="text-xs text-muted" htmlFor={`a-${c.id}`}>Registrar en</label>
              <select id={`a-${c.id}`} name="account_id" defaultValue={c.default_account_id ?? ""} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-sm">{o.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <button className="h-10 rounded-lg border border-line px-3 text-sm">Guardar</button>
            </form>
            <p className="text-xs text-muted">Cuenta actual: {accountName(c.default_account_id)}. Si el banco que envía el correo coincide con una de tus cuentas, se usa esa.</p>
            <div className="flex gap-2">
              {c.active && <form action={syncNow}><input type="hidden" name="id" value={c.id} /><button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg">Sincronizar ahora</button></form>}
              <form action={disconnectEmail}><input type="hidden" name="id" value={c.id} /><button className="h-10 rounded-lg px-3 text-sm text-danger">Desconectar y borrar acceso</button></form>
            </div>
          </Card>
        );
      })}

      {!!(conns ?? []).filter((c) => c.active).length && <Link href="/movimientos?tipo=pending" className="block rounded-xl border border-brand bg-brand/10 px-4 py-3 text-sm font-semibold text-brand">Revisar los movimientos detectados →</Link>}

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Qué hacemos con tu correo</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Solo pedimos permiso de <strong>lectura</strong>. Nunca enviamos, borramos ni movemos correos.</li>
          <li>Primero filtramos por remitente y asunto: promociones, códigos de seguridad y conversaciones personales <strong>no se leen</strong>.</li>
          <li>El texto de los correos que parecen una transacción se envía a Anthropic (IA) para extraer valor, fecha y comercio. <strong>No guardamos el contenido del correo</strong>: solo el movimiento, el remitente y el asunto.</li>
          <li>Todo queda <strong>pendiente de tu revisión</strong>; nada cuenta hasta que lo confirmes.</li>
          <li>Puedes desconectar cuando quieras: se borra el acceso y revocamos el permiso en Google.</li>
        </ul>
      </Card>

      {!hasAccounts ? <p className="text-center text-sm text-muted">Primero crea una cuenta en «Cuentas».</p>
        : maxConns === 0 ? <Card className="border-brand text-sm"><p className="font-semibold">La lectura de correo es parte de un plan de pago.</p><p className="text-muted">Mejora tu plan para conectar Gmail, Outlook o IMAP.</p></Card>
        : !canAdd ? <p className="text-center text-sm text-muted">Llegaste al máximo de {maxConns} cuenta(s) de tu plan.</p>
        : (<>
          <Card className="space-y-3">
            <h2 className="font-semibold">Conectar una cuenta</h2>
            <form method="get" className="space-y-3">
              <div><label htmlFor="acc" className="mb-1 block text-sm font-medium text-muted">Registrar los movimientos en</label>
                <select id="acc" name="account_id" className="h-12 w-full rounded-xl border border-line bg-card px-3">{o.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2">
                <button formAction="/api/email/google/start" disabled={!google} className="h-12 rounded-xl border border-line font-semibold disabled:opacity-40">Gmail</button>
                <button formAction="/api/email/microsoft/start" disabled={!microsoft} className="h-12 rounded-xl border border-line font-semibold disabled:opacity-40">Outlook</button>
              </div>
              {(!google || !microsoft) && <p className="text-xs text-muted">Un proveedor sin configurar aparece deshabilitado.</p>}
            </form>
          </Card>
          <Card className="space-y-3"><h2 className="font-semibold">Otro correo (IMAP)</h2><ImapForm accounts={o.accounts} /></Card>
        </>)}
    </div>
  );
}
