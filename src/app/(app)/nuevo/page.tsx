import Link from "next/link";
import { getFormOptions } from "@/lib/options";
import { TransactionForm } from "@/components/transaction-form";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Nuevo movimiento" };

export default async function Nuevo() {
  const options = await getFormOptions();
  if (!options.accounts.length) {
    return <p className="py-10 text-center">Primero crea una cuenta. <Link href="/cuentas/nueva" className="font-semibold text-brand underline">Crear cuenta</Link></p>;
  }
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Nuevo movimiento</h1>
      <Link href="/importar" className="mb-4 block rounded-xl border border-brand bg-brand/10 px-4 py-3 text-sm font-semibold text-brand">
        ✨ Mejor escríbelo, díctalo o escanea un recibo
      </Link>
      <TransactionForm options={options} today={todayISO()} />
    </>
  );
}
