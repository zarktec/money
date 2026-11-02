import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { CategoryForm } from "@/components/simple-forms";
import { deleteCategory } from "../actions";

export const metadata = { title: "Categorías" };

export default async function Categorias() {
  const supabase = await createClient();
  const { data: cats } = await supabase.from("expense_categories").select("id, name, color, user_id").eq("active", true).order("user_id", { ascending: false, nullsFirst: false }).order("name");
  const own = cats?.filter((c) => c.user_id) ?? [];
  const global = cats?.filter((c) => !c.user_id) ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Categorías</h1>
      <Card><CategoryForm /></Card>
      {own.length > 0 && <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Mis categorías</h2>
        {own.map((c) => (<Card key={c.id} className="flex items-center gap-3 p-3"><span className="size-4 rounded-full" style={{ background: c.color ?? "#64748b" }} /><p className="flex-1">{c.name}</p>
          <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="text-sm text-danger">Eliminar</button></form></Card>))}</section>}
      <section className="space-y-2"><h2 className="text-xs font-semibold uppercase text-muted">Predeterminadas</h2>
        {global.map((c) => <Card key={c.id} className="flex items-center gap-3 p-3"><span className="size-4 rounded-full" style={{ background: c.color ?? "#64748b" }} /><p>{c.name}</p></Card>)}</section>
    </div>
  );
}
