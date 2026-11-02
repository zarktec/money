"use client";
import { useActionState } from "react";
import { Button, FormError, Input } from "@/components/ui";
import { deleteAccount } from "@/app/(app)/actions-account";
import type { FormState } from "@/lib/forms/schemas";

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">Esto borra <strong>todos</strong> tus datos de forma permanente: movimientos, cuentas, metas, deudas, grupos y conexiones de correo. No se puede deshacer. Solo se conservan, sin tus datos personales, los registros de pagos que la ley contable exige guardar.</p>
      <label htmlFor="confirm" className="block text-sm font-medium">Para confirmar, escribe tu correo: <span className="font-mono text-muted">{email}</span></label>
      <Input id="confirm" name="confirm" type="email" autoComplete="off" autoCapitalize="none" required />
      <FormError error={state.error} />
      <Button variant="danger" disabled={pending} className="w-full">{pending ? "Eliminando…" : "Eliminar mi cuenta definitivamente"}</Button>
    </form>
  );
}
