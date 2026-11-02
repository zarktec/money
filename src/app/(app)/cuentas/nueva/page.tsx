import { getFormOptions } from "@/lib/options";
import { AccountForm } from "@/components/simple-forms";

export const metadata = { title: "Nueva cuenta" };
export default async function Page() {
  const { banks } = await getFormOptions();
  return (<><h1 className="mb-4 text-2xl font-bold">Nueva cuenta</h1><AccountForm banks={banks} /></>);
}
