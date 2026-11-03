import { requireAdmin } from "@/lib/admin/guard";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { resolveIntegration, type Source } from "@/lib/integrations/store";
import { appUrl } from "@/lib/app-url";
import { clearIntegrationAction, saveIntegrationAction } from "./actions";

export const metadata = { title: "Integraciones" };

const SOURCE: Record<Source, { label: string; tone: "good" | "neutral" | "warn" }> = {
  panel: { label: "Panel", tone: "good" }, env: { label: "Variable de entorno", tone: "neutral" }, default: { label: "Por defecto", tone: "neutral" }, none: { label: "Falta", tone: "warn" },
};

export default async function Integraciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; info?: string; p?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const base = await appUrl();
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY, hasKey = !!process.env.TOKEN_ENCRYPTION_KEY;
  const db = hasService ? createAdminClient() : null;
  const states = db ? await Promise.all(INTEGRATIONS.map((p) => resolveIntegration(db, p.id))) : [];
  const urls: Record<string, { label: string; value: string }[]> = {
    wompi: [{ label: "URL de eventos (configúrala en Wompi → Desarrolladores)", value: `${base}/api/wompi/webhook` }],
    google: [{ label: "URI de redirección autorizada", value: `${base}/api/email/google/callback` }],
    microsoft: [{ label: "URI de redirección", value: `${base}/api/email/microsoft/callback` }],
    anthropic: [],
  };

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold lg:text-2xl">Integraciones</h1>
        <p className="text-sm text-muted">Credenciales de Anthropic (IA), Wompi, Google y Microsoft. Los secretos se guardan cifrados y no se vuelven a mostrar completos. Si un campo no tiene valor aquí, se usa la variable de entorno del despliegue.</p></div>

      {sp.ok && <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">Cambios guardados. Se aplican en segundos, sin volver a desplegar.</p>}
      {sp.error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{sp.error}</p>}
      {sp.info && <p role="status" className="rounded-xl bg-card-2 px-3 py-2 text-sm text-muted">{sp.info}</p>}
      {!hasService && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Falta SUPABASE_SERVICE_ROLE_KEY en Vercel: sin ella esta pantalla no puede leer ni guardar credenciales.</p>}
      {hasService && !hasKey && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">Falta TOKEN_ENCRYPTION_KEY en Vercel: sin ella no se pueden guardar secretos (sí los datos públicos).</p>}
      {states[0] && !states[0].tableReady && <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">Falta ejecutar la migración <code>0010_integration_settings.sql</code> en el SQL Editor de Supabase. Mientras tanto se usan las variables de entorno.</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        {INTEGRATIONS.map((prov, i) => {
          const st = states[i];
          return (
            <Card key={prov.id} className="space-y-4" id={prov.id}>
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold">{prov.name}</h2><p className="text-sm text-muted">{prov.description}</p></div>
                {st && <Badge tone={st.ready ? "good" : "warn"}>{st.ready ? "Configurada" : "Incompleta"}</Badge>}
              </div>
              {(urls[prov.id] ?? []).map((u) => (
                <div key={u.value} className="rounded-lg bg-card-2 px-3 py-2"><p className="text-xs text-muted">{u.label}</p><p className="break-all font-mono text-xs">{u.value}</p></div>
              ))}
              <form action={saveIntegrationAction} className="space-y-3" autoComplete="off">
                <input type="hidden" name="provider" value={prov.id} />
                {(st?.fields ?? prov.fields.map((f) => ({ ...f, source: "none" as Source, preview: undefined as string | undefined, error: undefined as string | undefined }))).map((f) => {
                  const opts = prov.fields.find((d) => d.key === f.key)?.options;
                  return (
                  <div key={f.key}>
                    <div className="mb-1 flex items-center justify-between gap-2"><Label>{f.label}</Label><Badge tone={SOURCE[f.source].tone}>{SOURCE[f.source].label}</Badge></div>
                    <Input name={f.key} type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false} className="font-mono text-sm" list={opts ? `opts-${prov.id}-${f.key}` : undefined}
                      placeholder={f.preview ? (f.secret ? `${f.preview} · escribe para reemplazar` : f.preview) : (f.placeholder ?? "")} defaultValue={!f.secret && f.source === "panel" ? f.preview : undefined} />
                    {opts && <datalist id={`opts-${prov.id}-${f.key}`}>{opts.map((o) => <option key={o} value={o} />)}</datalist>}
                    {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
                    {f.error && <p className="mt-1 text-xs text-danger">{f.error}</p>}
                  </div>
                  );
                })}
                <Button className="w-full">Guardar {prov.name}</Button>
              </form>
              {st?.fields.some((f) => f.source === "panel") && (
                <details className="text-sm"><summary className="cursor-pointer text-muted">Quitar valores del panel</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {st.fields.filter((f) => f.source === "panel").map((f) => (
                      <form key={f.key} action={clearIntegrationAction}><input type="hidden" name="provider" value={prov.id} /><input type="hidden" name="key" value={f.key} />
                        <button className="rounded-lg border border-line px-3 py-1.5 text-xs transition hover:bg-danger-soft hover:text-danger">Quitar «{f.label}»</button></form>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">El campo vuelve a usar la variable de entorno, si existe.</p></details>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
