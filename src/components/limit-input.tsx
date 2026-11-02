"use client";
import { useState } from "react";
import { Input } from "@/components/ui";

/** Un límite numérico con casilla «Ilimitado»: al marcarla el número se desactiva y se envía el tope alto. */
export function LimitInput({ name, label, hint, value, unlimited }: { name: string; label: string; hint: string; value: number; unlimited: boolean }) {
  const [inf, setInf] = useState(unlimited);
  return (
    <div className="space-y-1">
      <label htmlFor={`limit_${name}`} className="block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3">
        <Input id={`limit_${name}`} name={`limit_${name}`} type="number" min={0} step={1} inputMode="numeric" defaultValue={unlimited ? "" : value} disabled={inf} required={!inf} className="w-28 shrink-0" />
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name={`${name}__unlimited`} checked={inf} onChange={(e) => setInf(e.target.checked)} className="size-4" /> Ilimitado</label>
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
