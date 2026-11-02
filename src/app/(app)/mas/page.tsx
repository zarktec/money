import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { logout } from "@/app/(auth)/actions";
import { PushToggle } from "@/components/push-toggle";
import { ADMIN_ITEM, NAV_GROUPS } from "@/lib/nav";

export const metadata = { title: "Más" };

// «Principal» ya está en la barra inferior.
const GROUPS = NAV_GROUPS.filter((g) => g.title !== "Principal");

export default async function Mas() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("role, full_name").eq("id", user!.id).single();
  const groups = p?.role === "super_admin" ? [...GROUPS, { title: "Administración", items: [ADMIN_ITEM] }] : GROUPS;
  return (
    <div className="space-y-6">
      <PageHeader title="Más" subtitle={<>{p?.full_name} · {user?.email}</>} />
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`g-${g.title}`} className="space-y-2">
          <h2 id={`g-${g.title}`} className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {g.items.map(({ href, label, hint, Icon }) => (
              <Link key={href} href={href} className="group">
                <Card className="flex h-full flex-col gap-2 p-3.5 transition group-active:scale-[.98] lg:p-4">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand"><Icon size={18} aria-hidden /></span>
                  <span className="text-sm font-semibold leading-tight">{label}</span>
                  {hint && <span className="text-xs leading-snug text-muted">{hint}</span>}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
      <form action={logout}><button className="h-12 w-full rounded-xl border border-line font-semibold text-danger transition hover:bg-danger-soft">Cerrar sesión</button></form>
    </div>
  );
}
