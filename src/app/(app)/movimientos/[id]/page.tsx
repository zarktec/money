import { notFound } from "next/navigation";
import { todayISO } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getFormOptions } from "@/lib/options";
import { TransactionForm } from "@/components/transaction-form";

export const metadata = { title: "Editar movimiento" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: t } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const options = await getFormOptions();
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Editar movimiento</h1>
      <TransactionForm options={options} today={todayISO()}
        initial={{ id: t.id, type: t.type, amount: String(t.amount_cents / 100), occurred_on: t.occurred_on, account_id: t.account_id ?? undefined,
          to_account_id: t.to_account_id, category_id: t.category_id, income_type_id: t.income_type_id, description: t.description, notes: t.notes, project_id: t.project_id }} />
    </>
  );
}
