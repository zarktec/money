"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/** Acciones de un plan de pago: probar gratis (sin tarjeta) o pagar con Wompi. El precio lo decide el servidor, no este componente. */
export function PlanActions({ planCode, trialDays, canTrial, label = "Pagar con Wompi" }: { planCode: string; trialDays: number; canTrial: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "trial" | "pay">("");
  const [error, setError] = useState("");

  async function call(url: string, kind: "trial" | "pay") {
    setBusy(kind); setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo continuar."); return; }
      if (kind === "pay") window.location.href = data.url; else router.push("/cuenta/suscripcion");
    } catch { setError("No hay conexión. Inténtalo de nuevo."); } finally { setBusy(""); }
  }
  return (
    <div className="space-y-2">
      {canTrial && trialDays > 0 && <Button className="w-full" disabled={!!busy} onClick={() => call("/api/subscription/trial", "trial")}>{busy === "trial" ? "Activando…" : `Probar ${trialDays} días gratis`}</Button>}
      <Button variant={canTrial && trialDays > 0 ? "ghost" : "primary"} className="w-full" disabled={!!busy} onClick={() => call("/api/wompi/checkout", "pay")}>{busy === "pay" ? "Redirigiendo…" : label}</Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
