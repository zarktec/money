import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { CATALOGS } from "@/lib/admin/catalogs";
import { Card, Button, Input } from "@/components/ui";
import { saveCatalogRow, toggleCatalogRow } from "./actions";

export default async function Catalogo({ params }: { params: Promise<{ tabla: string }> }) {
  const { tabla } = await params;
  const def = CATALOGS[tabla]; if (!def) notFound();
  const { supabase } = await requireAdmin();
  let q = supabase.from(def.table).select("*").order("sort_order").order("name");
  if (def.table === "expense_categories") q = q.is("user_id", null);
  const { data: rows } = await q;
  const save = saveCatalogRow.bind(null, tabla);
  const toggle = toggleCatalogRow.bind(null, tabla);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {Object.entries(CATALOGS).map(([slug, c]) => (
          <Link key={slug} href={`/admin/catalogos/${slug}`} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${slug === tabla ? "bg-brand text-brand-fg" : "border border-line"}`}>{c.label}</Link>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Agregar a «{def.label}»</h2>
        <form action={save} className="space-y-3">
          {def.fields.map((f) => f.type === "bool"
            ? <label key={f.name} className="flex items-center gap-2 text-sm"><input type="checkbox" name={f.name} defaultChecked className="size-5" />{f.label}</label>
            : <Input key={f.name} name={f.name} placeholder={f.label} required={f.name === "name"} />)}
          <Button className="w-full">Agregar</Button>
        </form>
      </Card>
      <div className="space-y-2">
        {rows?.map((r: Record<string, unknown>) => (
          <Card key={String(r.id)} className="flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-medium">{String(r.name)}</p>
              {Array.isArray(r.sender_domains) && r.sender_domains.length > 0 && <p className="truncate text-xs text-muted">{(r.sender_domains as string[]).join(", ")}</p>}</div>
            <form action={toggle}>
              <input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="active" value={String(!r.active)} />
              <button className="rounded-lg border border-line px-3 py-2 text-sm">{r.active ? "Desactivar" : "Activar"}</button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
