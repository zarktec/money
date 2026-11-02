import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { logout } from "@/app/(auth)/actions";
import { PushToggle } from "@/components/push-toggle";

export const metadata = { title: "Más" };

export default async function Mas() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("role, full_name").eq("id", user!.id).single();
  const items = [["/cuenta/suscripcion", "Mi plan"], ["/cuenta/datos", "Mis datos (exportar y eliminar)"], ["/cuenta/clave", "Cambiar contraseña"], ["/asistente", "Asistente (pregúntale a tus datos)"], ["/importar", "Importar y escanear"], ["/compartidos", "Gastos compartidos"], ["/correo", "Correo"], ["/suscripciones", "Suscripciones detectadas"], ["/calendario", "Calendario de vencimientos"], ["/presupuestos", "Presupuestos"], ["/proyectos", "Proyectos"], ["/deudas", "Deudas"], ["/patrimonio", "Patrimonio"], ["/proyeccion", "Proyección de caja"], ["/salud", "Salud financiera"], ["/cuentas", "Cuentas y saldos"], ["/recurrentes", "Fijos y recurrentes"], ["/categorias", "Categorías"]];
  if (p?.role === "super_admin") items.push(["/admin", "Administración"]);
  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold">Más</h1><p className="text-sm text-muted">{p?.full_name} · {user?.email}</p></header>
      {items.map(([h, l]) => <Link key={h} href={h}><Card className="mb-2 flex items-center justify-between">{l}<span className="text-muted">›</span></Card></Link>)}
      <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
      <form action={logout}><button className="h-12 w-full rounded-xl border border-line font-semibold text-danger">Cerrar sesión</button></form>
    </div>
  );
}
