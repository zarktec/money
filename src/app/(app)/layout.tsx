import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("disabled").eq("id", user.id).single();
  if (profile?.disabled) { await supabase.auth.signOut(); redirect("/login"); }
  // Aviso de plan: pago pendiente o prueba por terminar.
  const { data: s } = await supabase.from("subscriptions").select("status, current_period_end, cancel_at_period_end").in("status", ["trialing", "past_due"])
    .gt("current_period_end", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const days = s?.current_period_end ? Math.ceil((Date.parse(s.current_period_end) - Date.now()) / 86_400_000) : 0;
  const notice = s?.status === "past_due" ? "No pudimos cobrar tu renovación. Revisa tu pago para no perder tu plan."
    : s?.status === "trialing" && days <= 3 ? `Tu prueba gratis termina en ${days <= 0 ? "menos de un día" : `${days} día${days === 1 ? "" : "s"}`}.` : null;
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      {notice && <a href="/cuenta/suscripcion" className="block bg-amber-500/15 px-4 py-2 text-center text-sm font-medium text-amber-800">{notice} <span className="underline">Ver mi plan</span></a>}
      <main className="px-4 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
