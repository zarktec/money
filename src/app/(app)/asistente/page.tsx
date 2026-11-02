import { AssistantChat } from "@/components/assistant-chat";

export const metadata = { title: "Asistente" };
export default function Asistente() {
  return (<div className="space-y-3"><h1 className="text-2xl font-bold">Asistente</h1><AssistantChat /></div>);
}
