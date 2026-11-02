import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Administración" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const links = [["/admin", "Resumen"], ["/admin/usuarios", "Usuarios"], ["/admin/planes", "Planes"], ["/admin/pagos", "Pagos"], ["/admin/catalogos/bancos", "Catálogos"]];
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-6">
      <nav className="mb-6 flex gap-2 overflow-x-auto">
        {links.map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap rounded-full border border-line bg-card px-4 py-2 text-sm font-medium">{l}</Link>)}
        <Link href="/inicio" className="ml-auto whitespace-nowrap rounded-full px-4 py-2 text-sm text-muted">Volver a la app</Link>
      </nav>
      {children}
    </div>
  );
}
