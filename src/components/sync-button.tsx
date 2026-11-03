"use client";
import { useFormStatus } from "react-dom";

/** «Sincronizar ahora» con estado: la lectura puede tardar hasta ~45 s y sin esto parecería que no pasa nada. */
export function SyncButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending} className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg transition disabled:opacity-60">
      {pending ? "Sincronizando… puede tardar un poco" : "Sincronizar ahora"}
    </button>
  );
}
