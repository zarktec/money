import Link from "next/link";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteAllConversations, deleteConversation } from "@/app/(app)/actions-account";

export interface ConversationRow { id: string; title: string; updated_at: string }

const when = (iso: string) => {
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "Hoy" : days === 1 ? "Ayer" : days < 7 ? `Hace ${days} días` : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

/** Lista de conversaciones con el asistente: «Nueva», cada conversación (con su fecha) y borrado. */
export function ConversationList({ rows, activeId }: { rows: ConversationRow[]; activeId?: string }) {
  return (
    <nav aria-label="Historial de conversaciones" className="space-y-2">
      <Link href="/asistente" className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-card text-sm font-semibold transition hover:bg-card-2"><Plus size={16} aria-hidden /> Nueva conversación</Link>
      {!rows.length && <p className="px-1 py-4 text-center text-sm text-muted">Aquí aparecerán tus conversaciones.</p>}
      <ul className="space-y-1">
        {rows.map((c) => (
          <li key={c.id} className={cn("group flex items-center gap-1 rounded-lg transition", c.id === activeId ? "bg-brand-soft" : "hover:bg-card-2")}>
            <Link href={`/asistente?c=${c.id}`} aria-current={c.id === activeId ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5">
              <MessageSquare size={16} className={c.id === activeId ? "text-brand" : "text-muted"} aria-hidden />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{c.title}</span><span className="block text-xs text-muted">{when(c.updated_at)}</span></span>
            </Link>
            <form action={deleteConversation}><input type="hidden" name="id" value={c.id} />
              <button aria-label={`Borrar la conversación «${c.title}»`} className="rounded-md p-2 text-muted transition hover:bg-danger-soft hover:text-danger"><Trash2 size={15} aria-hidden /></button></form>
          </li>
        ))}
      </ul>
      {rows.length > 0 && <form action={deleteAllConversations}><button className="w-full rounded-lg px-3 py-2 text-xs text-muted transition hover:bg-danger-soft hover:text-danger">Borrar todo el historial</button></form>}
    </nav>
  );
}
