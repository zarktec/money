import type { Cents } from "./money";

export interface NetWorthInputs {
  accountBalances: { balanceCents: Cents }[];   // saldos de cuentas (una tarjeta con deuda aparece negativa)
  assets: { valueCents: Cents }[];              // bienes registrados a mano (vehículo, vivienda…)
  debts: { balanceCents: Cents }[];             // préstamos registrados en «Deudas»
}

/**
 * Patrimonio = activos − pasivos. Los saldos negativos de cuentas (tarjetas) cuentan como pasivo.
 * Las deudas se registran en «Deudas» y las tarjetas como cuenta con saldo negativo: no registrar la misma obligación en ambos lados.
 */
export function netWorth(i: NetWorthInputs) {
  const accountAssets = i.accountBalances.reduce((a, b) => a + Math.max(b.balanceCents, 0), 0);
  const accountLiabilities = i.accountBalances.reduce((a, b) => a + Math.max(-b.balanceCents, 0), 0);
  const manualAssets = i.assets.reduce((a, b) => a + b.valueCents, 0);
  const debts = i.debts.reduce((a, b) => a + b.balanceCents, 0);
  const assets = accountAssets + manualAssets, liabilities = accountLiabilities + debts;
  return { assetsCents: assets, liabilitiesCents: liabilities, netCents: assets - liabilities, accountAssets, manualAssets, accountLiabilities, debts };
}
