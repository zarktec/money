import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("disabled").eq("id", user.id).single();
  if (profile?.disabled) { await supabase.auth.signOut(); redirect("/login"); }
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      <main className="px-4 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
