import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { setEmailNotifications } from "../../actions-account";

export const metadata = { title: "Notificaciones" };

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("email_notifications").eq("id", user!.id).single();
  const on = p?.email_notifications !== false;
  return (
    <div className="space-y-4">
      <PageHeader title="Notificaciones" subtitle="Elige cómo quieres que te avisemos." />
      <Card className="space-y-3">
        <div><h2 className="font-semibold">Avisos por correo</h2>
          <p className="text-sm text-muted">Recordatorios de pagos por vencer, aviso cuando tu plan o prueba está por terminar y recibo de tus pagos. Llegan a <b>{user?.email}</b>.</p></div>
        <p className="text-sm">Estado: <b className={on ? "text-brand" : "text-muted"}>{on ? "Activados" : "Apagados"}</b></p>
        <form action={setEmailNotifications}>
          <input type="hidden" name="enabled" value={String(!on)} />
          <button className="h-11 rounded-xl border border-line px-5 text-sm font-semibold transition hover:bg-card-2">{on ? "Apagar avisos por correo" : "Activar avisos por correo"}</button>
        </form>
        <p className="text-xs text-muted">Los correos de tu cuenta (confirmar el registro o restablecer la contraseña) siempre se envían.</p>
      </Card>
      <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
    </div>
  );
}
