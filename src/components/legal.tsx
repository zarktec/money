import Link from "next/link";
import { LEGAL, splitMarks } from "@/lib/legal";

/** Texto con los puntos pendientes [[así]] resaltados en amarillo. */
export function M({ children }: { children: string }) {
  return <>{splitMarks(children).map((p, i) => p.marked ? <mark key={i} className="rounded bg-yellow-200 px-1 text-black">[{p.text}]</mark> : <span key={i}>{p.text}</span>)}</>;
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-8">
      <Link href="/" className="text-sm text-muted">‹ Inicio</Link>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Última actualización: {LEGAL.updated}</p>
      {!LEGAL.reviewed && (
        <div role="note" className="mt-4 rounded-xl border border-yellow-400 bg-yellow-100 p-4 text-sm text-black">
          <strong>BORRADOR sin revisión legal.</strong> Este texto describe lo que la aplicación hace, pero no ha sido validado por un abogado. Los puntos resaltados requieren una decisión o confirmación antes de publicar. No lo uses con usuarios reales hasta revisarlo.
        </div>
      )}
      <div className="mt-6 space-y-6 leading-relaxed [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
      <footer className="mt-10 flex gap-4 border-t border-line pt-4 text-sm text-muted"><Link href="/privacidad" className="underline">Privacidad</Link><Link href="/terminos" className="underline">Términos</Link></footer>
    </main>
  );
}
