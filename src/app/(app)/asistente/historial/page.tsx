import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConversationList } from "@/components/conversation-list";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Historial del asistente" };

/** Historial para el celular (en escritorio la lista va al lado del chat). */
export default async function Historial() {
  const supabase = await createClient();
  const { data: convs } = await supabase.from("assistant_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(50);
  return (
    <div className="space-y-4">
      <PageHeader title="Historial" subtitle="Tus conversaciones con el asistente" action={<Link href="/asistente" className="text-sm font-semibold text-brand">Volver</Link>} />
      <ConversationList rows={convs ?? []} />
    </div>
  );
}
