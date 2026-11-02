"use client";
import { useActionState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { connectImap } from "@/app/(app)/actions-email";
import type { FormState } from "@/lib/forms/schemas";

const PRESETS = ["imap.gmail.com", "outlook.office365.com", "imap.mail.yahoo.com", "imap.mail.me.com", "imap.zoho.com"];

export function ImapForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(connectImap, {});
  return (
    <form action={action} className="space-y-3">
      <Field label="Servidor IMAP"><Input name="host" list="imap-presets" required placeholder="imap.tuproveedor.com" autoCapitalize="none" autoCorrect="off" /></Field>
      <datalist id="imap-presets">{PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
      <Field label="Usuario (tu correo)"><Input name="user" type="email" required autoComplete="off" autoCapitalize="none" /></Field>
      <Field label="Contraseña de aplicación"><Input name="password" type="password" required autoComplete="new-password" /></Field>
      <Field label="Cuenta donde se registran los movimientos"><Select name="account_id" required defaultValue={accounts[0]?.id}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      <p className="text-xs text-muted">Usa una contraseña de aplicación, no la normal (Gmail: Seguridad → Contraseñas de aplicaciones; requiere verificación en dos pasos). Solo se admite conexión segura por el puerto 993. Si tienes Gmail u Outlook, es mejor conectarlas con su botón: no guarda ninguna contraseña.</p>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Probando conexión…" : "Conectar por IMAP"}</Button>
    </form>
  );
}
