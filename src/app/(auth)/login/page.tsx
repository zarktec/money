import { AuthForm } from "@/components/auth-form";
export const metadata = { title: "Ingresar" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <AuthForm mode="login" next={(await searchParams).next} />;
}
