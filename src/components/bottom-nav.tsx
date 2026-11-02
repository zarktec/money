"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ArrowLeftRight, Plus, PiggyBank, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/inicio", label: "Inicio", Icon: Home },
  { href: "/movimientos", label: "Movimientos", Icon: ArrowLeftRight },
  { href: "/nuevo", label: "Nuevo", Icon: Plus, fab: true },
  { href: "/ahorros", label: "Ahorros", Icon: PiggyBank },
  { href: "/mas", label: "Más", Icon: Menu },
];

/** Barra inferior del celular y la tableta. En escritorio la reemplaza el menú lateral. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1">
        {items.map(({ href, label, Icon, fab }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <li key={href} className="flex justify-center">
              <Link href={href} aria-label={label} aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand" : "text-muted")}>
                {fab ? <span className="-mt-6 grid size-14 place-items-center rounded-full bg-brand text-brand-fg shadow-lg ring-4 ring-bg"><Icon size={28} /></span>
                  : <><span className={cn("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-brand-soft")}><Icon size={21} /></span><span>{label}</span></>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
