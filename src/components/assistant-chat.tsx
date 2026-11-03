"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Msg { role: "user" | "assistant"; content: string }
const SUGGESTIONS = ["¿En qué gasté más este mes?", "¿Cuánto llevo en restaurantes este mes vs. el mes pasado?", "¿Qué pagos vencen esta semana?", "¿Cómo voy con mis presupuestos?", "¿Cuánto debo en total y cuándo termino de pagar?", "¿Cuánto me falta para mis metas de ahorro?"];

export function AssistantChat({ conversationId, initialMessages = [] }: { conversationId?: string; initialMessages?: Msg[] }) {
  const router = useRouter();
  const [convId, setConvId] = useState(conversationId);
  const [msgs, setMsgs] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setError(""); setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q, conversationId: convId }) });
      const data = await res.json().catch(() => ({}));
      if (data.usage) setUsage(data.usage);
      if (!res.ok) { setError(data.error ?? "No se pudo responder."); return; }
      setMsgs([...next, { role: "assistant", content: data.reply }]);
      if (data.conversationId && data.conversationId !== convId) {
        // Primera respuesta de una conversación nueva: se fija su dirección sin recargar el chat y se actualiza la lista del historial.
        setConvId(data.conversationId); window.history.replaceState(null, "", `/asistente?c=${data.conversationId}`);
      }
      if (data.conversationId) router.refresh();
    } catch { setError("No hay conexión. Inténtalo de nuevo."); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col lg:min-h-[calc(100dvh-10rem)]">
      <div className="flex-1 space-y-3 pb-4">
        {!msgs.length && (
          <div className="space-y-3">
            <p className="text-muted">Pregúntame por tus finanzas. Consulto tus datos reales; no puedo modificar nada.</p>
            <div className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-card px-3 py-2 text-left text-sm">{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed", m.role === "user" ? "ml-auto bg-brand text-brand-fg" : "border border-line bg-card")}>{m.content}</div>
        ))}
        {busy && <div className="w-fit rounded-2xl border border-line bg-card px-4 py-3 text-muted" aria-live="polite">Consultando tus datos…</div>}
        {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-20 space-y-1 bg-bg pb-2 pt-1 lg:bottom-0">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Escribe tu pregunta…" aria-label="Pregunta" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-4 outline-none focus:border-brand" />
          <button disabled={busy || !input.trim()} className="h-12 rounded-xl bg-brand px-5 font-semibold text-brand-fg disabled:opacity-50">Enviar</button>
        </div>
        <p className="text-center text-xs text-muted">{usage ? `Consultas con IA este mes: ${usage.used} de ${usage.limit}. ` : ""}Orientación general, no asesoría financiera.</p>
      </form>
    </div>
  );
}
