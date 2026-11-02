"use client";
import { useActionState, useMemo, useState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { saveTransaction } from "@/app/(app)/actions";
import { FREQUENCIES, FREQUENCY_LABELS, type FormState } from "@/lib/forms/schemas";
import { formatMoney, parseMoneyInput } from "@/lib/finance/money";
import { monthlyProvision, type Frequency } from "@/lib/finance/recurrence";
import type { FormOptions } from "@/lib/options";
import { cn } from "@/lib/utils";

type TxType = "expense" | "income" | "transfer";
const TYPES: { v: TxType; label: string; cls: string }[] = [
  { v: "expense", label: "Egreso", cls: "bg-danger text-white" },
  { v: "income", label: "Ingreso", cls: "bg-brand text-brand-fg" },
  { v: "transfer", label: "Transferencia", cls: "bg-sky-500 text-white" },
];

export interface TxInitial {
  id?: string; type?: TxType; amount?: string; occurred_on?: string; account_id?: string; to_account_id?: string | null;
  category_id?: string | null; income_type_id?: string | null; description?: string | null; notes?: string | null; project_id?: string | null;
}

export function TransactionForm({ options, initial, today }: { options: FormOptions; initial?: TxInitial; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTransaction, {});
  const [type, setType] = useState<TxType>(initial?.type ?? "expense");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [repeat, setRepeat] = useState("none");
  const editing = !!initial?.id;

  const hint = useMemo(() => {
    const cents = parseMoneyInput(amount);
    if (!cents || repeat === "none" || type !== "expense") return null;
    const p = monthlyProvision(cents, repeat as Frequency);
    return p > 0 ? `Apartaremos ${formatMoney(p)} cada mes para este pago.` : null;
  }, [amount, repeat, type]);

  return (
    <form action={action} className="space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="type" value={type} />

      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-line/60 p-1">
        {TYPES.map((t) => (
          <button key={t.v} type="button" role="tab" aria-selected={type === t.v} onClick={() => setType(t.v)}
            className={cn("h-11 rounded-xl text-sm font-semibold transition", type === t.v ? t.cls : "text-muted")}>{t.label}</button>
        ))}
      </div>

      <div>
        <input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off"
          placeholder="$ 0" aria-label="Monto" required autoFocus={!editing}
          className="h-20 w-full rounded-2xl border border-line bg-card px-4 text-center text-4xl font-bold tabular-nums outline-none focus:border-brand" />
        <p className="mt-1 text-center text-xs text-muted">Puedes escribir «45 mil» o «1.250.000»</p>
      </div>

      {type === "expense" && (
        <Field label="Categoría">
          <Select name="category_id" defaultValue={initial?.category_id ?? ""}>
            <option value="">Sin categoría</option>
            {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      {type === "income" && (
        <Field label="Tipo de ingreso">
          <Select name="income_type_id" defaultValue={initial?.income_type_id ?? ""}>
            <option value="">Sin tipo</option>
            {options.incomeTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}

      <div className={cn("grid gap-3", type === "transfer" ? "grid-cols-2" : "grid-cols-1")}>
        <Field label={type === "transfer" ? "Desde" : "Cuenta"}>
          <Select name="account_id" defaultValue={initial?.account_id ?? options.accounts[0]?.id} required>
            {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        {type === "transfer" && (
          <Field label="Hacia">
            <Select name="to_account_id" defaultValue={initial?.to_account_id ?? ""} required>
              <option value="" disabled>Elegir…</option>
              {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><Input name="occurred_on" type="date" defaultValue={initial?.occurred_on ?? today} required /></Field>
        <Field label="Descripción"><Input name="description" defaultValue={initial?.description ?? ""} placeholder="Opcional" maxLength={120} /></Field>
      </div>

      {type !== "transfer" && options.projects.length > 0 && (
        <Field label="Proyecto">
          <Select name="project_id" defaultValue={initial?.project_id ?? ""}>
            <option value="">Ninguno</option>
            {options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}

      {!editing && type !== "transfer" && (
        <Field label="¿Se repite?">
          <Select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            <option value="none">No, es único</option>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
          </Select>
          {hint && <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{hint}</p>}
        </Field>
      )}

      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar"}</Button>
    </form>
  );
}
