"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_ITEM, NAV_GROUPS } from "@/lib/nav";

export const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Menú lateral del escritorio: grupos con título, ícono y marca clara de la página actual. */
export function SidebarNav({ admin = false }: { admin?: boolean }) {
  const path = usePathname();
  // Los íconos son funciones: no pueden viajar del servidor al cliente como props, por eso el menú se arma aquí.
  const groups = admin ? [...NAV_GROUPS, { title: "Administración", items: [ADMIN_ITEM] }] : NAV_GROUPS;
  return (
    <nav aria-label="Principal" className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, Icon }) => {
              const on = isActive(path, href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={on ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      on ? "bg-brand-soft text-brand" : "text-fg/80 hover:bg-card-2 hover:text-fg")}>
                    <Icon size={18} aria-hidden /><span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
