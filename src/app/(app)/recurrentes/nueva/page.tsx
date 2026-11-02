import { format } from "date-fns";
import { getFormOptions } from "@/lib/options";
import { RuleForm } from "@/components/simple-forms";

export const metadata = { title: "Nuevo fijo" };
export default async function Page() {
  const options = await getFormOptions();
  return (<><h1 className="mb-4 text-2xl font-bold">Nuevo ingreso o egreso fijo</h1><RuleForm options={options} today={format(new Date(), "yyyy-MM-dd")} /></>);
}
