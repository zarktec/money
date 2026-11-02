"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, Select } from "@/components/ui";
import { formatMoney } from "@/lib/finance/money";
import type { DraftRow, ImportMode } from "@/lib/imports/types";
import { commitImport, undoImport } from "@/app/(app)/actions-import";
import { cn } from "@/lib/utils";

interface Preview { rows: DraftRow[]; warnings: string[]; notes: string | null; ambiguousSign: boolean; source: "statement_csv" | "statement_pdf" | "receipt" | "text"; usage: { used: number; limit: number } | null }
type Row = DraftRow & { include: boolean };

// Dictado por voz: API del navegador (Chrome/Android y Safari recientes); si no existe, el botón no aparece.
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
type SpeechCtor = new () => SpeechRec;
const speechCtor = (): SpeechCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Reduce la foto antes de subirla (menos datos, más rápido y dentro del límite de 4 MB). Si el navegador no puede, se envía el original. */
async function downscale(file: File, maxSide = 1600): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], "recibo.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

const TABS: { v: ImportMode; label: string; hint: string }[] = [
  { v: "text", label: "Escribir o dictar", hint: "Cuéntalo como se lo dirías a alguien: «almuerzo 25 mil y taxi 12 mil»." },
  { v: "receipt", label: "Foto de recibo", hint: "Toma una foto del recibo o la factura." },
  { v: "statement", label: "Extracto", hint: "Sube el extracto de tu banco en CSV (gratis) o PDF (usa IA)." },
];

export function ImportClient({ accounts, categories, defaultYear }: { accounts: { id: string; name: string }[]; categories: { id: string; name: string }[]; defaultYear: number }) {
  const [mode, setMode] = useState<ImportMode>("text");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(String(defaultYear));
  const [positiveIs, setPositiveIs] = useState<"" | "income" | "expense">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState<{ inserted: number; batchId: string } | null>(null);
  const [undone, setUndone] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();
  const rec = useRef<SpeechRec | null>(null);
  const canSpeak = !!speechCtor();

  function toggleDictation() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor();
    r.lang = "es-CO"; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(" ").trim(); if (t) setText((prev) => (prev ? prev + " " : "") + t); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  }

  async function analyze(opts?: { positiveIs?: "income" | "expense" }) {
    setError(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.set("mode", mode); fd.set("account_id", accountId);
      if (mode === "text") fd.set("text", text);
      else {
        if (!file) { setError("Elige un archivo primero."); return; }
        fd.set("file", mode === "receipt" ? await downscale(file) : file);
        if (mode === "statement") { fd.set("default_year", year); const p = opts?.positiveIs ?? positiveIs; if (p) fd.set("positive_is", p); }
      }
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "No se pudo analizar."); return; }
      setPreview(data as Preview);
      setRows((data as Preview).rows.map((r) => ({ ...r, include: !r.duplicate })));
    } catch { setError("No hay conexión. Inténtalo de nuevo."); } finally { setBusy(false); }
  }

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const chosen = rows.filter((r) => r.include);
  const total = (t: "income" | "expense") => chosen.filter((r) => r.type === t).reduce((a, r) => a + r.amountCents, 0);

  function save() {
    setError("");
    startTransition(async () => {
      const r = await commitImport({ accountId, source: preview!.source, fileName: file?.name ?? null, rows: rows.map(({ date, type, amountCents, description, categoryId, include }) => ({ date, type, amountCents, description, categoryId, include })) });
      if (r.ok) setDone({ inserted: r.inserted, batchId: r.batchId }); else setError(r.error);
    });
  }
  function undo() { startTransition(async () => { await undoImport(done!.batchId); setUndone(true); }); }
  function reset() { setPreview(null); setRows([]); setDone(null); setUndone(false); setText(""); setFile(null); setError(""); }

  if (done) return (
    <Card className="space-y-3 text-center">
      <p className="text-4xl">{undone ? "↩️" : "✅"}</p>
      <p className="font-semibold">{undone ? "Importación deshecha" : `${done.inserted} movimiento(s) guardados`}</p>
      <div className="flex flex-col gap-2">
        {!undone && <Link href="/movimientos" className="rounded-xl bg-brand py-3 font-semibold text-brand-fg">Ver movimientos</Link>}
        {!undone && <Button variant="ghost" onClick={undo} disabled={pending}>Deshacer esta importación</Button>}
        <Button variant="ghost" onClick={reset}>Importar más</Button>
      </div>
    </Card>
  );

  if (preview) return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Revisa antes de guardar</h2><button onClick={reset} className="text-sm text-muted">Empezar de nuevo</button></div>
      {preview.notes && <p className="rounded-xl bg-line/60 px-3 py-2 text-sm">{preview.notes}</p>}
      {preview.warnings.map((w) => <p key={w} className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{w}</p>)}
      {preview.ambiguousSign && (
        <Card className="space-y-2"><p className="text-sm font-medium">Los valores positivos son…</p>
          <div className="grid grid-cols-2 gap-2">{(["expense", "income"] as const).map((p) => <button key={p} onClick={() => { setPositiveIs(p); analyze({ positiveIs: p }); }} className="h-11 rounded-xl border border-line text-sm font-semibold">{p === "expense" ? "Egresos" : "Ingresos"}</button>)}</div></Card>
      )}
      {preview.usage && <p className="text-xs text-muted">Análisis con IA este mes: {preview.usage.used} de {preview.usage.limit}</p>}
      <div className="flex justify-between text-xs text-muted"><button onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}>Marcar todo</button><button onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}>Desmarcar todo</button></div>

      {rows.map((r) => (
        <Card key={r.key} className={cn("space-y-2 p-3", !r.include && "opacity-50", r.duplicate && "border-warn/60")}>
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={r.include} onChange={(e) => patch(r.key, { include: e.target.checked })} className="mt-1 size-5" aria-label="Incluir" />
            <div className="min-w-0 flex-1">
              <input value={r.description} onChange={(e) => patch(r.key, { description: e.target.value })} maxLength={120} aria-label="Descripción" className="w-full bg-transparent font-medium outline-none" />
              <p className="text-xs text-muted">{r.date}{r.duplicate && " · ya existe"}{r.confidence !== null && r.confidence < 0.7 && " · poco seguro, revísalo"}</p>
            </div>
            <div className="text-right"><p className={cn("font-semibold tabular-nums", r.type === "income" ? "text-brand" : "")}>{r.type === "income" ? "+" : "−"}{formatMoney(r.amountCents)}</p>
              <button onClick={() => patch(r.key, { type: r.type === "income" ? "expense" : "income", categoryId: null })} className="text-xs text-muted underline">{r.type === "income" ? "es ingreso" : "es egreso"}</button></div>
          </div>
          {r.type === "expense" && (
            <Select value={r.categoryId ?? ""} onChange={(e) => patch(r.key, { categoryId: e.target.value || null })} aria-label="Categoría" className="h-10 text-sm">
              <option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>)}
        </Card>
      ))}

      <div className="sticky bottom-20 rounded-2xl border border-line bg-card p-3 shadow-lg">
        <p className="mb-2 text-center text-sm">{chosen.length} de {rows.length} · <span className="text-brand">+{formatMoney(total("income"))}</span> · −{formatMoney(total("expense"))}</p>
        {error && <p role="alert" className="mb-2 text-center text-sm text-danger">{error}</p>}
        <Button onClick={save} disabled={pending || !chosen.length} className="w-full">{pending ? "Guardando…" : `Guardar ${chosen.length}`}</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-line/60 p-1">
        {TABS.map((t) => <button key={t.v} role="tab" aria-selected={mode === t.v} onClick={() => { setMode(t.v); setError(""); setFile(null); }} className={cn("h-11 rounded-xl px-1 text-xs font-semibold leading-tight", mode === t.v ? "bg-card shadow" : "text-muted")}>{t.label}</button>)}
      </div>
      <p className="text-sm text-muted">{TABS.find((t) => t.v === mode)!.hint}</p>
      <div><label className="mb-1 block text-sm font-medium text-muted">Cuenta</label>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>

      {mode === "text" && (<div className="space-y-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1500} placeholder="Ej.: ayer almuerzo con el equipo 85 mil y hoy me pagaron 2 palos de un trabajo" aria-label="Describe tus movimientos" className="w-full rounded-xl border border-line bg-card p-3 text-base outline-none focus:border-brand" />
        {canSpeak && <button type="button" onClick={toggleDictation} className={cn("h-11 w-full rounded-xl border font-semibold", listening ? "border-danger text-danger" : "border-line")}>{listening ? "● Escuchando… toca para parar" : "🎤 Dictar"}</button>}
      </div>)}

      {mode === "receipt" && (<label className="grid h-32 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-line text-center text-sm text-muted">
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? <span className="font-medium text-fg">📷 {file.name}</span> : <span>📷 Toca para tomar o elegir la foto</span>}</label>)}

      {mode === "statement" && (<div className="space-y-3">
        <label className="grid h-32 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-line text-center text-sm text-muted">
          <input type="file" accept=".csv,.txt,text/csv,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? <span className="font-medium text-fg">📄 {file.name}</span> : <span>📄 Toca para elegir el CSV o PDF<br />(máximo 4 MB)</span>}</label>
        <div><label className="mb-1 block text-sm font-medium text-muted">Año del extracto (si las fechas no lo traen)</label>
          <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className="h-12 w-full rounded-xl border border-line bg-card px-4 outline-none focus:border-brand" /></div>
      </div>)}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button onClick={() => analyze()} disabled={busy || !accountId || (mode === "text" ? !text.trim() : !file)} className="w-full">{busy ? "Analizando…" : "Analizar"}</Button>
      {mode !== "statement" && <p className="text-center text-xs text-muted">Usa IA: el contenido se envía a Anthropic solo para extraer los datos y no se guarda la imagen.</p>}
    </div>
  );
}
