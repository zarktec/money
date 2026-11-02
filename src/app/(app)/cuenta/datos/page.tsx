import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { DeleteAccountForm } from "@/components/delete-account";
import { addDaysISO, monthBounds, todayISO } from "@/lib/dates";

export const metadata = { title: "Mis datos" };

export default async function Datos() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const today = todayISO();
  const btn = "block h-12 w-full rounded-xl bg-brand text-center font-semibold leading-[3rem] text-brand-fg";
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Mis datos</h1><p className="text-sm text-muted">Descarga tu información o elimina tu cuenta cuando quieras.</p></header>

      <Card className="space-y-3"><h2 className="font-semibold">Excel de movimientos</h2>
        <p className="text-sm text-muted">Con montos numéricos para que puedas sumarlos y filtrarlos. Incluye resumen, egresos por categoría y cuentas.</p>
        <form method="get" action="/api/export/excel" className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Desde<input type="date" name="from" defaultValue={addDaysISO(today, -365)} required className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-fg" /></label>
            <label className="text-xs text-muted">Hasta<input type="date" name="to" defaultValue={today} required className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-fg" /></label>
          </div>
          <button className={btn}>Descargar Excel</button>
        </form></Card>

      <Card className="space-y-3"><h2 className="font-semibold">Informe mensual en PDF</h2>
        <form method="get" action="/api/export/pdf" className="space-y-3">
          <label className="block text-xs text-muted">Mes<input type="month" name="month" defaultValue={monthBounds(today).month} required className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-fg" /></label>
          <button className={btn}>Descargar PDF</button>
        </form></Card>

      <Card className="space-y-3"><h2 className="font-semibold">Respaldo completo</h2>
        <p className="text-sm text-muted">Todos tus datos en un archivo JSON (tu derecho de acceso y portabilidad). No incluye contraseñas ni claves de tus cuentas de correo.</p>
        <a href="/api/export/backup" className={btn}>Descargar respaldo</a></Card>

      <Card className="space-y-3 border-danger"><h2 className="font-semibold text-danger">Eliminar mi cuenta</h2><DeleteAccountForm email={user?.email ?? ""} /></Card>
    </div>
  );
}
