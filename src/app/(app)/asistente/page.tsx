import Link from "next/link";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AssistantChat } from "@/components/assistant-chat";
import { ConversationList } from "@/components/conversation-list";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Asistente" };

export default async function Asistente({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const id = /^[0-9a-f-]{36}$/i.test(sp.c ?? "") ? sp.c : undefined;
  const [{ data: convs }, current] = await Promise.all([
    supabase.from("assistant_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(50),
    id ? supabase.from("assistant_conversations").select("id, title").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: msgs } = current.data ? await supabase.from("assistant_messages").select("role, content").eq("conversation_id", current.data.id).order("seq").limit(400) : { data: [] };

  return (
    <div className="wide space-y-3">
      <PageHeader title="Asistente" subtitle={current.data?.title}
        action={<Link href="/asistente/historial" className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:bg-card-2 lg:hidden"><History size={16} aria-hidden /> Historial</Link>} />
      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block"><div className="sticky top-8"><ConversationList rows={convs ?? []} activeId={current.data?.id} /></div></aside>
        <div className="max-w-3xl">
          {id && !current.data && <p role="alert" className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">Esa conversación ya no existe. Puedes empezar una nueva.</p>}
          {/* key: al cambiar de conversación el chat se reinicia con sus mensajes */}
          <AssistantChat key={current.data?.id ?? "nueva"} conversationId={current.data?.id} initialMessages={(msgs ?? []) as { role: "user" | "assistant"; content: string }[]} />
        </div>
      </div>
    </div>
  );
}
