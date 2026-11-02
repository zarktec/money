"use client";
import { useActionState, useState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { saveAccount, saveCategory, saveRule } from "@/app/(app)/actions";
import { FREQUENCIES, FREQUENCY_LABELS, type FormState } from "@/lib/forms/schemas";
import { formatMoney, parseMoneyInput } from "@/lib/finance/money";
import { monthlyProvision, type Frequency } from "@/lib/finance/recurrence";
import type { FormOptions } from "@/lib/options";

export const ACCOUNT_TYPES: Record<string, string> = {
  cash: "Efectivo", checking: "Cuenta corriente", savings: "Cuenta de ahorros", credit_card: "Tarjeta de crédito",
  wallet: "Billetera (Nequi, Daviplata…)", investment: "Inversión", other: "Otra",
};

export function AccountForm({ banks }: { banks: FormOptions["banks"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre"><Input name="name" required placeholder="Ej. Bancolombia ahorros" maxLength={60} /></Field>
      <Field label="Tipo"><Select name="type" defaultValue="checking">{Object.entries(ACCOUNT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Banco o billetera"><Select name="bank_id" defaultValue=""><option value="">Ninguno</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
      <Field label="Saldo inicial"><Input name="opening_balance" inputMode="decimal" placeholder="$ 0 (usa − si es deuda de tarjeta)" /></Field>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Crear cuenta"}</Button>
    </form>
  );
}

export function RuleForm({ options, today }: { options: FormOptions; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRule, {});
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<Frequency>("monthly");
  const cents = parseMoneyInput(amount);
  const provision = cents && type === "expense" ? monthlyProvision(cents, freq) : 0;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-line/60 p-1">
        {(["expense", "income"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`h-11 rounded-xl text-sm font-semibold ${type === t ? (t === "expense" ? "bg-danger text-white" : "bg-brand text-brand-fg") : "text-muted"}`}>
            {t === "expense" ? "Egreso fijo" : "Ingreso fijo"}</button>))}
      </div>
      <input type="hidden" name="type" value={type} />
      <Field label="Nombre"><Input name="name" required placeholder={type === "expense" ? "Arriendo, seguro del carro, Netflix…" : "Salario, pensión, mesada…"} /></Field>
      <Field label="Monto"><Input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$ 0" required /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="amount_is_estimate" className="size-5" />El monto es aproximado (ej. servicios públicos)</label>
      <Field label="Frecuencia">
        <Select name="frequency" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>{FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}</Select>
        {provision > 0 && <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Para no llevarte un golpe, aparta {formatMoney(provision)} cada mes.</p>}
      </Field>
      <Field label="Próximo vencimiento"><Input name="next_date" type="date" defaultValue={today} required /></Field>
      <Field label="Cuenta"><Select name="account_id" required defaultValue={options.accounts[0]?.id}>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      {type === "expense" ? (<>
        <Field label="Categoría"><Select name="category_id" defaultValue=""><option value="">Sin categoría</option>{options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Plataforma (si es suscripción)"><Select name="platform_id" defaultValue=""><option value="">No aplica</option>{options.platforms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      </>) : (
        <Field label="Tipo de ingreso"><Select name="income_type_id" defaultValue=""><option value="">Sin tipo</option>{options.incomeTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      )}
      <Field label="Recordarme (días antes)"><Input name="remind_days_before" type="number" min={0} max={30} defaultValue={3} /></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="auto_register" className="mt-0.5 size-5" /><span>Registrarlo solo al vencer. Si el monto es aproximado, quedará «por revisar» para que pongas el valor real.</span></label>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Guardar"}</Button>
    </form>
  );
}

export function CategoryForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCategory, {});
  return (
    <form action={action} key={state.ok ? "ok" : "form"} className="space-y-3">
      <Field label="Nueva categoría"><Input name="name" required maxLength={60} placeholder="Ej. Cuidado de la finca" /></Field>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">Color <input type="color" name="color" defaultValue="#64748b" className="h-10 w-14 rounded-lg border border-line bg-card" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="essential" className="size-5" />Es esencial</label>
      </div>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">Agregar</Button>
    </form>
  );
}
