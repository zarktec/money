import { Mail, PiggyBank, Sparkles } from "lucide-react";

const POINTS = [
  [Sparkles, "Cuánto puedes gastar hoy", "Descuenta fijos, provisiones y ahorro de tus ingresos."],
  [PiggyBank, "Ahorro con fecha", "Te decimos cuánto separar cada mes para llegar a tu meta."],
  [Mail, "Se llena casi solo", "Lee los avisos de tu banco en el correo y propone los movimientos."],
] as const;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Escritorio: panel de marca */}
      <aside className="relative hidden overflow-hidden bg-brand p-12 text-brand-fg lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/20 text-xl font-bold">$</span><span className="text-xl font-bold">Money</span></div>
        <div className="max-w-md space-y-8">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Tus finanzas, en orden y en automático.</h2>
          <ul className="space-y-5">
            {POINTS.map(([I, t, d]) => (
              <li key={t} className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/15"><I size={20} aria-hidden /></span>
                <div><p className="font-semibold">{t}</p><p className="text-sm opacity-80">{d}</p></div></li>
            ))}
          </ul>
        </div>
        <p className="text-sm opacity-70">Pensada primero para Colombia · COP</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-black/10" />
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10 lg:max-w-lg lg:px-12">
        <div className="mb-8 text-center lg:hidden"><div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand text-3xl font-bold text-brand-fg">$</div>
          <h1 className="text-2xl font-bold">Money</h1><p className="text-muted">Tus finanzas, en orden y en automático.</p></div>
        {children}
      </main>
    </div>
  );
}
