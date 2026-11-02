"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button, Input, Label } from "@/components/ui";
import { login, register, type AuthState } from "@/app/(auth)/actions";

export function AuthForm({ mode, next, notice }: { mode: "login" | "registro"; next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : register, {});
  return (
    <form action={action} className="space-y-4">
      {notice && <p role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{notice}</p>}
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "registro" && <div><Label>Nombre</Label><Input name="name" autoComplete="name" defaultValue={state.name} required /></div>}
      <div><Label>Correo</Label><Input name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required /></div>
      <div><Label>Contraseña</Label><Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} /></div>
      {mode === "login" && <p className="text-right text-sm"><Link className="font-semibold text-brand" href="/recuperar">¿Olvidaste tu contraseña?</Link></p>}
      {mode === "registro" && (
        <label className="flex items-start gap-3 text-sm text-muted">
          <input type="checkbox" name="consent" className="mt-1 size-5" required />
          <span>Acepto los <Link href="/terminos" className="underline">términos del servicio</Link> y autorizo el tratamiento de mis datos personales según la <Link href="/privacidad" className="underline">política de privacidad</Link> (Ley 1581 de 2012).</span>
        </label>
      )}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.info && <p className="text-sm text-brand">{state.info}</p>}
      <Button disabled={pending} className="w-full">{pending ? "Un momento…" : mode === "login" ? "Ingresar" : "Crear cuenta"}</Button>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? <>¿No tienes cuenta? <Link className="font-semibold text-brand" href="/registro">Regístrate</Link></>
          : <>¿Ya tienes cuenta? <Link className="font-semibold text-brand" href="/login">Ingresa</Link></>}
      </p>
    </form>
  );
}
