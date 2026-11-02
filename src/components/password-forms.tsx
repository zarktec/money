"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button, FormError, Input, Label } from "@/components/ui";
import { requestPasswordReset, type AuthState } from "@/app/(auth)/actions";
import { changePassword } from "@/app/(app)/actions-account";
import type { FormState } from "@/lib/forms/schemas";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
      <div><Label>Correo</Label><Input name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required /></div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.info && <p role="status" className="rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand">{state.info}</p>}
      <Button disabled={pending} className="w-full">{pending ? "Enviando…" : "Enviar enlace"}</Button>
      <p className="text-center text-sm text-muted"><Link className="font-semibold text-brand" href="/login">Volver a ingresar</Link></p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <div><Label>Contraseña nueva</Label><Input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
      <div><Label>Repite la contraseña</Label><Input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
      <p className="text-xs text-muted">Mínimo 8 caracteres. Al cambiarla se cerrará la sesión en tus otros dispositivos.</p>
      <FormError error={state.error} />
      {state.ok && <p role="status" className="rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand">¡Listo! Tu contraseña fue actualizada.</p>}
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Guardar contraseña"}</Button>
    </form>
  );
}
