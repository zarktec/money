import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand text-4xl font-bold text-brand-fg">$</div>
      <h1 className="text-3xl font-bold">Tus finanzas personales, en automático</h1>
      <p className="text-muted">Ingresos, egresos, ahorros, deudas y proyectos. Lee tus correos con IA y te dice cuánto puedes gastar hoy.</p>
      <div className="flex flex-col gap-3">
        <Link href="/registro" className="rounded-xl bg-brand py-3.5 font-semibold text-brand-fg">Crear cuenta</Link>
        <Link href="/login" className="rounded-xl border border-line py-3.5 font-semibold">Ingresar</Link>
        <Link href="/precios" className="py-2 text-sm font-semibold text-brand">Ver planes y precios</Link>
        <p className="flex justify-center gap-4 pt-2 text-xs text-muted"><Link href="/privacidad" className="underline">Privacidad</Link><Link href="/terminos" className="underline">Términos</Link></p>
      </div>
    </main>
  );
}
