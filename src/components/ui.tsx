import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
  <div className={cn("rounded-2xl border border-line bg-card p-4", className)} {...p} />;

export const Button = ({ className, variant = "primary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) =>
  <button className={cn("inline-flex h-12 items-center justify-center rounded-xl px-5 text-base font-semibold transition active:scale-[.98] disabled:opacity-50",
    variant === "primary" && "bg-brand text-brand-fg", variant === "ghost" && "border border-line", variant === "danger" && "bg-danger text-white", className)} {...p} />;

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) =>
  <input className={cn("h-12 w-full rounded-xl border border-line bg-card px-4 outline-none focus:border-brand", className)} {...p} />;

export const Label = ({ children }: { children: React.ReactNode }) =>
  <label className="mb-1 block text-sm font-medium text-muted">{children}</label>;

export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) =>
  <select className={cn("h-12 w-full rounded-xl border border-line bg-card px-3 outline-none focus:border-brand", className)} {...p}>{children}</select>;

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
  <div><Label>{label}</Label>{children}</div>;

export const FormError = ({ error }: { error?: string }) =>
  error ? <p role="alert" className="text-sm text-danger">{error}</p> : null;
