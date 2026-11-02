import Link from "next/link";
import { todayISO } from "@/lib/dates";
import { getFormOptions } from "@/lib/options";
import { TransactionForm } from "@/components/transaction-form";

export const metadata = { title: "Nuevo movimiento" };

export default async function Nuevo() {
  const options = await getFormOptions();
  if (!options.accounts.length) {
    return <p className="py-10 text-center">Primero crea una cuenta. <Link href="/cuentas/nueva" className="font-semibold text-brand underline">Crear cuenta</Link></p>;
  }
  return (<><h1 className="mb-4 text-2xl font-bold">Nuevo movimiento</h1><TransactionForm options={options} today={todayISO()} /></>);
}
