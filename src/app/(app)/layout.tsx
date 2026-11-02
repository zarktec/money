import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { logout } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("disabled, role, full_name").eq("id", user.id).single();
  if (profile?.disabled) { await supabase.auth.signOut(); redirect("/login"); }
  // Aviso de plan: pago pendiente o prueba por terminar.
  const { data: s } = await supabase.from("subscriptions").select("status, current_period_end, cancel_at_period_end").in("status", ["trialing", "past_due"])
    .gt("current_period_end", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const days = s?.current_period_end ? Math.ceil((Date.parse(s.current_period_end) - Date.now()) / 86_400_000) : 0;
  const notice = s?.status === "past_due" ? "No pudimos cobrar tu renovación. Revisa tu pago para no perder tu plan."
    : s?.status === "trialing" && days <= 3 ? `Tu prueba gratis termina en ${days <= 0 ? "menos de un día" : `${days} día${days === 1 ? "" : "s"}`}.` : null;
  const initial = (profile?.full_name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Escritorio: menú lateral fijo */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-lg font-bold text-brand-fg">$</span>
          <span className="text-lg font-bold tracking-tight">Money</span>
        </div>
        <div className="px-4 pb-3">
          <Link href="/nuevo" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-brand-fg transition hover:brightness-110">
            <Plus size={18} aria-hidden /> Nuevo movimiento
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4"><SidebarNav admin={profile?.role === "super_admin"} /></div>
        <div className="flex items-center gap-3 border-t border-line p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden>{initial}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{profile?.full_name || "Mi cuenta"}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
          <form action={logout}><button className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition hover:bg-card-2 hover:text-danger" aria-label="Cerrar sesión">Salir</button></form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {notice && <a href="/cuenta/suscripcion" className="block bg-warn-soft px-4 py-2 text-center text-sm font-medium text-warn">{notice} <span className="underline">Ver mi plan</span></a>}
        <main className="app-main mx-auto max-w-2xl px-4 pb-28 pt-6 sm:px-6 lg:mx-0 lg:max-w-none lg:px-10 lg:pb-14 lg:pt-10 xl:px-14">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
