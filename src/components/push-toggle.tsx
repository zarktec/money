"use client";
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "busy";

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle({ vapidKey }: { vapidKey: string | undefined }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch { setState("unsupported"); }
    })();
  }, [vapidKey]);

  async function enable() {
    setState("busy"); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey!) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) { await sub.unsubscribe(); throw new Error(); }
      setState("on");
    } catch { setMsg("No se pudieron activar las notificaciones."); setState("off"); }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    } finally { setState("off"); }
  }

  if (state === "loading") return null;
  const text: Record<State, string> = {
    loading: "", busy: "Un momento…", unsupported: "Tu navegador no admite notificaciones (en iPhone instala la app en la pantalla de inicio).",
    denied: "Bloqueaste las notificaciones. Actívalas en los ajustes del navegador.", off: "Recibe un aviso antes de cada vencimiento.", on: "Notificaciones activadas en este dispositivo.",
  };
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="font-medium">Recordatorios de vencimientos</p>
      <p className="mt-1 text-sm text-muted">{text[state]}</p>
      {msg && <p role="alert" className="mt-1 text-sm text-danger">{msg}</p>}
      {state === "off" && <button onClick={enable} className="mt-3 h-11 w-full rounded-xl bg-brand font-semibold text-brand-fg">Activar notificaciones</button>}
      {state === "on" && <button onClick={disable} className="mt-3 h-11 w-full rounded-xl border border-line font-semibold">Desactivar</button>}
    </div>
  );
}
