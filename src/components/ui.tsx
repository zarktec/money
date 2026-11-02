import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
  <div className={cn("rounded-2xl border border-line bg-card p-4 shadow-card lg:p-5", className)} {...p} />;

export const Button = ({ className, variant = "primary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) =>
  <button className={cn("inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition active:scale-[.98] disabled:opacity-50 lg:h-11 lg:text-sm",
    variant === "primary" && "bg-brand text-brand-fg hover:brightness-110", variant === "ghost" && "border border-line hover:bg-card-2", variant === "danger" && "bg-danger text-white hover:brightness-110", className)} {...p} />;

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) =>
  <input className={cn("h-12 w-full rounded-xl border border-line bg-card px-4 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 lg:h-11", className)} {...p} />;

export const Label = ({ children }: { children: React.ReactNode }) =>
  <label className="mb-1 block text-sm font-medium text-muted">{children}</label>;

export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) =>
  <select className={cn("h-12 w-full rounded-xl border border-line bg-card px-3 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 lg:h-11", className)} {...p}>{children}</select>;

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
  <div><Label>{label}</Label>{children}</div>;

export const FormError = ({ error }: { error?: string }) =>
  error ? <p role="alert" className="text-sm text-danger">{error}</p> : null;

/** Encabezado de página: título, subtítulo y, a la derecha, la acción principal. */
export const PageHeader = ({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) =>
  <header className="flex items-start justify-between gap-3">
    <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;

/** Cifra con etiqueta (indicadores del resumen). */
export const Stat = ({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: "good" | "bad"; hint?: string }) =>
  <Card className="space-y-1">
    <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
    <p className={cn("whitespace-nowrap text-xl font-semibold tabular-nums lg:text-2xl", tone === "good" && "text-brand", tone === "bad" && "text-danger")}>{value}</p>
    {hint && <p className="text-xs text-muted">{hint}</p>}
  </Card>;

export const Badge = ({ tone = "neutral", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "good" | "warn" | "bad" }) =>
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
    tone === "neutral" && "bg-card-2 text-muted", tone === "good" && "bg-brand-soft text-brand", tone === "warn" && "bg-warn-soft text-warn", tone === "bad" && "bg-danger-soft text-danger", className)} {...p} />;
