import { monthsToPayOff } from "./debts";
import { upcomingEvents, type RuleLite } from "./planning";
import type { Cents } from "./money";

export interface CashflowInputs {
  startBalanceCents: Cents;
  startMonth: string;                 // yyyy-MM del primer mes proyectado (el actual)
  today: string;                      // yyyy-MM-dd, para no contar vencimientos ya pasados del mes en curso
  months: number;
  rules: RuleLite[];
  debts: { balanceCents: Cents; annualRateEA: number; installmentCents: Cents }[];
  goalMonthlyCents: Cents;
  variableExpenseMonthlyCents: Cents; // promedio de gasto NO recurrente
}

export interface CashflowMonth {
  month: string; incomeCents: Cents; fixedCents: Cents; variableCents: Cents; debtCents: Cents; savingsCents: Cents;
  netCents: Cents; endBalanceCents: Cents;
}

const addMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const lastDay = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`; };

/**
 * Proyección mes a mes: ingresos y egresos fijos reales (con sus fechas, así un seguro anual aparece en el mes en que se paga),
 * cuotas de deuda hasta que se cancelan, ahorro sugerido y un gasto variable promedio. No supone ingresos variables.
 */
export function projectCashflow(i: CashflowInputs): CashflowMonth[] {
  const out: CashflowMonth[] = [];
  const horizonEnd = lastDay(addMonth(i.startMonth, i.months - 1));
  const events = upcomingEvents(i.rules, `${i.startMonth}-01`, horizonEnd, 400);
  const debtMonths = i.debts.map((d) => ({ ...d, left: d.installmentCents > 0 ? monthsToPayOff(d.balanceCents, d.annualRateEA, d.installmentCents).months : 0 }));

  let balance = i.startBalanceCents;
  for (let k = 0; k < i.months; k++) {
    const month = addMonth(i.startMonth, k);
    const inMonth = events.filter((e) => e.date.startsWith(month));
    // En el mes en curso, lo vencido antes de hoy ya está en el saldo si se pagó; lo vencido sin pagar sigue pendiente y se cuenta.
    const income = inMonth.filter((e) => e.type === "income").reduce((a, e) => a + e.amountCents, 0);
    const fixed = inMonth.filter((e) => e.type === "expense").reduce((a, e) => a + e.amountCents, 0);
    const debt = debtMonths.reduce((a, d) => a + (k < d.left ? d.installmentCents : 0), 0);
    const net = income - fixed - i.variableExpenseMonthlyCents - debt - i.goalMonthlyCents;
    balance += net;
    out.push({ month, incomeCents: income, fixedCents: fixed, variableCents: i.variableExpenseMonthlyCents, debtCents: debt, savingsCents: i.goalMonthlyCents, netCents: net, endBalanceCents: balance });
  }
  return out;
}
