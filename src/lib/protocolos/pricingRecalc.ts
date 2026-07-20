import {
  calcularCustoHa,
  calcularDoseAPartirCustoHa,
  calcularValorDose,
  calcularValorLitro,
} from "@/lib/catalogo/pricing";

export type PricingState = {
  doseMlHa: number | null;
  valorDose: number | null;   // R$/100 mL
  valorLitro: number | null;  // R$/L
  valorHa: number | null;     // R$/ha
};

export type PricingField = "doseMlHa" | "valorDose" | "valorLitro" | "valorHa";

/**
 * Recalcula os campos derivados de preço/dose mantendo a coerência:
 * 1 dose = 100 mL · 1 litro = 10 doses · custo/ha = dose_ml_ha × valor_dose / 100.
 * Função pura: recebe o estado atual + campo alterado e devolve o novo estado.
 */
export function recalcPricing(
  field: PricingField,
  value: number | null,
  state: PricingState,
): PricingState {
  const s: PricingState = { ...state, [field]: value };

  switch (field) {
    case "valorDose": {
      s.valorLitro = value == null ? null : calcularValorLitro(value);
      const ha = calcularCustoHa(s.doseMlHa, value);
      if (ha != null) s.valorHa = ha;
      break;
    }
    case "valorLitro": {
      const dose = value == null ? null : calcularValorDose(value);
      s.valorDose = dose;
      const ha = calcularCustoHa(s.doseMlHa, dose);
      if (ha != null) s.valorHa = ha;
      break;
    }
    case "doseMlHa": {
      const ha = calcularCustoHa(value, s.valorDose);
      if (ha != null) s.valorHa = ha;
      break;
    }
    case "valorHa": {
      const dose = calcularDoseAPartirCustoHa(s.doseMlHa, value);
      if (dose != null) {
        s.valorDose = dose;
        s.valorLitro = calcularValorLitro(dose);
      }
      break;
    }
  }
  return s;
}

// Helpers para formulários com state em string.
export const numOrNullStr = (s: string): number | null => {
  if (s === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

export const fmtNumStr = (n: number | null | undefined): string =>
  n == null ? "" : String(Number(n.toFixed(4)));
