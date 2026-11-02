"use client";
import { useActionState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { payDebt, saveAsset, saveDebt } from "@/app/(app)/actions-insights";
import { ASSET_KINDS, DEBT_KINDS, type FormState } from "@/lib/forms/schemas";
import type { FormOptions } from "@/lib/options";

export function DebtForm({ banks }: { banks: FormOptions["banks"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDebt, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre"><Input name="name" required maxLength={80} placeholder="Crédito de la moto, tarjeta Visa…" /></Field>
      <Field label="Tipo"><Select name="kind" defaultValue="loan">{Object.entries(DEBT_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Acreedor (opcional)"><Input name="creditor" placeholder="Banco, persona…" /></Field>
      <Field label="Banco (opcional)"><Select name="bank_id" defaultValue=""><option value="">Ninguno</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
      <Field label="Valor inicial del crédito"><Input name="principal" inputMode="decimal" required placeholder="$ 0" /></Field>
      <Field label="Saldo actual (si ya pagaste algo)"><Input name="balance" inputMode="decimal" placeholder="Déjalo vacío si es igual al valor inicial" /></Field>
      <Field label="Tasa efectiva anual (E.A. %)"><Input name="annual_rate" inputMode="decimal" placeholder="Ej. 24,5 — sin ella no se calculan intereses" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuota mensual"><Input name="installment" inputMode="decimal" placeholder="$ 0" /></Field>
        <Field label="N.º de cuotas"><Input name="total_installments" inputMode="numeric" placeholder="Ej. 36" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día de pago"><Input name="due_day" inputMode="numeric" placeholder="1 a 31" /></Field>
        <Field label="Próximo pago"><Input name="next_due_date" type="date" /></Field>
      </div>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Guardar deuda"}</Button>
    </form>
  );
}

export function DebtPaymentForm({ debtId, accounts, defaultAmount, today }: { debtId: string; accounts: FormOptions["accounts"]; defaultAmount: string; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(payDebt, {});
  return (
    <form action={action} key={state.ok ? Date.now() : "f"} className="space-y-3">
      <input type="hidden" name="debt_id" value={debtId} />
      <Input name="amount" inputMode="decimal" defaultValue={defaultAmount} placeholder="$ Monto pagado" required aria-label="Monto pagado" />
      <div className="grid grid-cols-2 gap-2">
        <Select name="account_id" required defaultValue={accounts[0]?.id} aria-label="Cuenta">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Input name="paid_on" type="date" defaultValue={today} required aria-label="Fecha" />
      </div>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Registrando…" : "Registrar pago"}</Button>
    </form>
  );
}

export function AssetForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAsset, {});
  return (
    <form action={action} key={state.ok ? Date.now() : "f"} className="space-y-3">
      <Input name="name" required maxLength={80} placeholder="Apartamento, carro, CDT…" aria-label="Nombre" />
      <Select name="kind" defaultValue="property" aria-label="Tipo">{Object.entries(ASSET_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      <Input name="value" inputMode="decimal" required placeholder="$ Valor actual aproximado" aria-label="Valor" />
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Agregar bien"}</Button>
    </form>
  );
}
