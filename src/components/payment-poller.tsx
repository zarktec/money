"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Después de pagar, Wompi confirma por webhook unos segundos más tarde: refresca la página hasta ver el resultado (máx. ~1 minuto). */
export function PaymentPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 20) clearInterval(t); else router.refresh(); }, 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
