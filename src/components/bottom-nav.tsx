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

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1">
        {items.map(({ href, label, Icon, fab }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <li key={href} className="flex justify-center">
              <Link href={href} aria-label={label} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-brand" : "text-muted")}>
                {fab ? <span className="-mt-6 grid size-14 place-items-center rounded-full bg-brand text-brand-fg shadow-lg"><Icon size={28} /></span>
                  : <><Icon size={22} /><span>{label}</span></>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
