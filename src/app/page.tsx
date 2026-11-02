import Link from "next/link";
import { ArrowLeftRight, Mail, PiggyBank, ShieldCheck, Sparkles, Wallet } from "lucide-react";

const FEATURES = [
  [Wallet, "Cuánto puedes gastar", "Ingresos menos gastos, fijos, provisiones y ahorro pendiente. Un solo número."],
  [ArrowLeftRight, "Fijos y diferidos", "Arriendo, seguros anuales, impuestos: se provisionan mes a mes para que no te sorprendan."],
  [PiggyBank, "Ahorro con fecha", "Define la meta y la fecha; te decimos la cuota mensual y la recalculamos si adelantas."],
  [Mail, "Correo con IA", "Lee los avisos de tu banco (Gmail, Outlook o IMAP) y te propone los movimientos."],
  [Sparkles, "Asistente", "Pregunta en lenguaje natural: «¿cuánto gasté en domicilios este mes?»."],
  [ShieldCheck, "Tus datos, tuyos", "Exporta todo o elimina tu cuenta cuando quieras."],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-brand text-lg font-bold text-brand-fg">$</span><span className="text-lg font-bold">Money</span></div>
        <nav aria-label="Cuenta" className="flex items-center gap-2 text-sm font-semibold">
          <Link href="/precios" className="hidden rounded-lg px-3 py-2 text-muted transition hover:text-fg sm:block">Precios</Link>
          <Link href="/login" className="rounded-lg px-3 py-2 transition hover:bg-card">Ingresar</Link>
          <Link href="/registro" className="rounded-lg bg-brand px-4 py-2 text-brand-fg transition hover:brightness-110">Crear cuenta</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-14 pt-10 text-center lg:pb-20 lg:pt-20">
          <h1 className="text-4xl font-bold leading-tight tracking-tight lg:text-6xl">Tus finanzas personales, <span className="text-brand">en automático</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Ingresos, egresos, ahorros, deudas y proyectos. Lee tus correos con IA y te dice cuánto puedes gastar hoy.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/registro" className="w-full rounded-xl bg-brand px-8 py-3.5 font-semibold text-brand-fg transition hover:brightness-110 sm:w-auto">Crear cuenta gratis</Link>
            <Link href="/precios" className="w-full rounded-xl border border-line px-8 py-3.5 font-semibold transition hover:bg-card sm:w-auto">Ver planes y precios</Link>
          </div>
        </section>

        <section aria-label="Qué incluye" className="mx-auto grid max-w-6xl gap-4 px-6 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([I, t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-card p-5 shadow-card">
              <span className="mb-3 grid size-10 place-items-center rounded-lg bg-brand-soft text-brand"><I size={20} aria-hidden /></span>
              <h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        <Link href="/privacidad" className="mx-3 underline">Privacidad</Link><Link href="/terminos" className="mx-3 underline">Términos</Link>
      </footer>
    </div>
  );
}
