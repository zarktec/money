"use client";
import { useActionState, useState } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { addSettlement, addSharedExpense, saveGroup } from "@/app/(app)/actions-shared";
import type { FormState } from "@/lib/forms/schemas";

export function GroupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(saveGroup, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre del grupo"><Input name="name" required maxLength={80} placeholder="Viaje a Cartagena, apartamento, asados…" /></Field>
      <div><label className="mb-1 block text-sm font-medium text-muted" htmlFor="members">¿Quiénes más? (uno por línea)</label>
        <textarea id="members" name="members" required rows={5} placeholder={"Ana\nLuis\nCarlos"} className="w-full rounded-xl border border-line bg-card p-3 text-base outline-none focus:border-brand" />
        <p className="mt-1 text-xs text-muted">Tú entras automáticamente como «Yo». No necesitan tener cuenta: aquí solo se lleva la cuenta de quién debe a quién.</p></div>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Creando…" : "Crear grupo"}</Button>
    </form>
  );
}

type Member = { id: string; name: string; is_me: boolean };
export function SharedExpenseForm({ groupId, members, accounts, categories, today }: { groupId: string; members: Member[]; accounts: { id: string; name: string }[]; categories: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSharedExpense, {});
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [mine, setMine] = useState(true);
  const me = members.find((m) => m.is_me);
  return (
    <form action={action} key={state.ok ? Date.now() : "f"} className="space-y-3">
      <input type="hidden" name="group_id" value={groupId} /><input type="hidden" name="split_mode" value={mode} />
      <Field label="¿Qué se pagó?"><Input name="description" required maxLength={120} placeholder="Cena, hotel, mercado…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor total"><Input name="amount" inputMode="decimal" required placeholder="$ 0" /></Field>
        <Field label="Fecha"><Input name="date" type="date" defaultValue={today} required /></Field>
      </div>
      <Field label="¿Quién pagó?"><Select name="paid_by" defaultValue={me?.id}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {(["equal", "custom"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`h-10 rounded-lg text-sm font-semibold ${mode === m ? "bg-card shadow" : "text-muted"}`}>{m === "equal" ? "En partes iguales" : "Valores distintos"}</button>)}
      </div>
      {mode === "equal" ? (
        <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium text-muted">Se divide entre</legend>
          {members.map((m) => <label key={m.id} className="flex items-center gap-3 text-base"><input type="checkbox" name="participants" value={m.id} defaultChecked className="size-5" />{m.name}</label>)}</fieldset>
      ) : (
        <div className="space-y-2"><p className="text-sm font-medium text-muted">Cuánto le toca a cada uno (debe sumar el total)</p>
          {members.map((m) => <div key={m.id} className="grid grid-cols-[1fr_8rem] items-center gap-2"><span>{m.name}</span><Input name={`share_${m.id}`} inputMode="decimal" placeholder="$ 0" aria-label={`Parte de ${m.name}`} /></div>)}</div>
      )}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="record_mine" checked={mine} onChange={(e) => setMine(e.target.checked)} className="mt-0.5 size-5" /><span>Registrar mi parte como gasto mío (solo lo que me toca, no el total)</span></label>
      {mine && (<div className="grid grid-cols-2 gap-3">
        <Select name="account_id" aria-label="Cuenta" defaultValue={accounts[0]?.id}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select name="category_id" aria-label="Categoría" defaultValue=""><option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>)}
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Agregar gasto"}</Button>
    </form>
  );
}

export function SettlementForm({ groupId, members, today, defaults }: { groupId: string; members: Member[]; today: string; defaults?: { from: string; to: string; amount: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSettlement, {});
  return (
    <form action={action} key={state.ok ? Date.now() : "f"} className="space-y-3">
      <input type="hidden" name="group_id" value={groupId} />
      <div className="grid grid-cols-2 gap-2">
        <Select name="from" aria-label="Quién pagó" defaultValue={defaults?.from ?? ""} required><option value="" disabled>¿Quién pagó?</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        <Select name="to" aria-label="A quién" defaultValue={defaults?.to ?? ""} required><option value="" disabled>¿A quién?</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      </div>
      <div className="grid grid-cols-2 gap-2"><Input name="amount" inputMode="decimal" defaultValue={defaults?.amount} placeholder="$ Valor" required aria-label="Valor" /><Input name="date" type="date" defaultValue={today} required aria-label="Fecha" /></div>
      <FormError error={state.error} />
      <Button disabled={pending} className="w-full">{pending ? "Guardando…" : "Registrar pago entre ustedes"}</Button>
    </form>
  );
}
