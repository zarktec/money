import { getFormOptions } from "@/lib/options";
import { GoalForm } from "@/components/planning-forms";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "Nueva meta" };
export default async function Page() {
  const options = await getFormOptions();
  return (<><h1 className="mb-4 text-2xl font-bold">Nueva meta de ahorro</h1><GoalForm options={options} minDate={todayISO()} /></>);
}
