"use client";
import { useActionState, useMemo, useState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { addContribution, saveBudget, saveGoal, saveProject } from "@/app/(app)/actions-planning";
import type { FormState } from "@/lib/forms/schemas";
import { formatMoney, parseMoneyInput } from "@/lib/finance/money";
import { goalProgress } from "@/lib/finance/savings";
import type { FormOptions } from "@/lib/options";

export function GoalForm({ options, minDate }: { options: FormOptions; minDate: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveGoal, {});
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const preview = useMemo(() => {
    const t = parseMoneyInput(target);
    if (!t || !date) return null;
    return goalProgress(t, 0, date, new Date(minDate + "T12:00:00"));
  }, [target, date, minDate]);

  return (
    <form action={action} className="space-y-4">
      <Field label="¿Para qué estás ahorrando?"><Input name="name" required maxLength={80} placeholder="Viaje a Cartagena, moto, celular…" /></Field>
      <Field label="Valor que necesitas"><Input name="target" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="$ 0" required /></Field>
      <Field label="¿Para cuándo?"><Input name="target_date" type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      {preview && (
        <p className="rounded-xl bg-brand/10 px-4 py-3 text-brand">
          Debes ahorrar <strong>{formatMoney(preview.monthlyContributionCents)}</strong> al mes durante {preview.monthsLeft} {preview.monthsLeft === 1 ? "mes" : "meses"}.
        </p>
      )}
      {options.projects.length > 0 && (
        <Field label="Proyecto (opcional)"><Select name="project_id" defaultValue=""><option value="">Ninguno</option>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      )}
      <Field label="Cuenta donde lo guardas (opcional)"><Select name="account_id" defaultValue=""><option value="">Sin cuenta específica</option>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Creando…" : "Crear meta"}</Button>
    </form>
  );
}

export function ContributionForm({ goalId, today }: { goalId: string; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addContribution, {});
  return (
    <form action={action} key={state.ok ? Date.now() : "f"} className="space-y-3">
      <input type="hidden" name="goal_id" value={goalId} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input name="amount" inputMode="decimal" placeholder="$ Monto" required aria-label="Monto del aporte" />
        <Select name="kind" defaultValue="deposit" className="w-32" aria-label="Tipo"><option value="deposit">Aportar</option><option value="withdraw">Retirar</option></Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input name="contributed_on" type="date" defaultValue={today} required aria-label="Fecha" />
        <Input name="note" placeholder="Nota (opcional)" maxLength={80} />
      </div>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Registrar"}</Button>
    </form>
  );
}

export function ProjectForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProject, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre"><Input name="name" required maxLength={80} placeholder="Remodelación, matrimonio, negocio…" /></Field>
      <Field label="Descripción"><Input name="description" maxLength={200} placeholder="Opcional" /></Field>
      <Field label="Presupuesto total"><Input name="budget" inputMode="decimal" placeholder="$ Opcional" /></Field>
      <Field label="Fecha estimada de fin"><Input name="end_date" type="date" /></Field>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Creando…" : "Crear proyecto"}</Button>
    </form>
  );
}

export function BudgetForm({ month, categories }: { month: string; categories: FormOptions["categories"] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBudget, {});
  return (
    <form action={action} key={state.ok ? Date.now() : "f"} className="space-y-3">
      <input type="hidden" name="month" value={month} />
      <Select name="category_id" required defaultValue="" aria-label="Categoría"><option value="" disabled>Categoría…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      <Input name="amount" inputMode="decimal" placeholder="$ Límite del mes" required aria-label="Límite" />
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Fijar presupuesto"}</Button>
    </form>
  );
}
