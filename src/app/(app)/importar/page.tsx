import Link from "next/link";
import { getFormOptions } from "@/lib/options";
import { ImportClient } from "@/components/import-client";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Importar y escanear" };

export default async function Importar() {
  const o = await getFormOptions();
  if (!o.accounts.length) return <p className="py-10 text-center">Primero crea una cuenta. <Link href="/cuentas/nueva" className="font-semibold text-brand underline">Crear cuenta</Link></p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Importar y escanear</h1>
      <ImportClient accounts={o.accounts} categories={o.categories} defaultYear={Number(todayISO().slice(0, 4))} />
    </div>
  );
}
