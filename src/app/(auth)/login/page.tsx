import { AuthForm } from "@/components/auth-form";
export const metadata = { title: "Ingresar" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return <AuthForm mode="login" next={sp.next} notice={sp.error === "enlace" ? "El enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." : undefined} />;
}
