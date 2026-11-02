import { getFormOptions } from "@/lib/options";
import { DebtForm } from "@/components/insight-forms";

export const metadata = { title: "Nueva deuda" };
export default async function Page() {
  const { banks } = await getFormOptions();
  return (<><h1 className="mb-4 text-2xl font-bold">Nueva deuda</h1><DebtForm banks={banks} /></>);
}
