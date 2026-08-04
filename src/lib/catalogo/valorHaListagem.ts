import { brl } from "@/lib/financial/format";
import { calcularCustoHa, calcularValorDose } from "@/lib/catalogo/pricing";

export interface ValorHaInput {
  doseMlHa?: number | null;
  valorHa?: number | null;
  valorDose?: number | null;
  valorLitro?: number | null;
}

/**
 * Valor por hectare exibido nas listagens da Base Técnica.
 * Precedência: valor/ha explícito → dose × valor da dose → dose × valor derivado do litro.
 */
export function resolverValorHaListagem(input: ValorHaInput): number | null {
  const { doseMlHa, valorHa, valorLitro } = input;
  if (valorHa != null && valorHa > 0) return valorHa;
  const dose = input.valorDose ?? calcularValorDose(valorLitro);
  return calcularCustoHa(doseMlHa, dose);
}

/** Texto único "R$ X,XX" ou "—" para a coluna Valor/ha. */
export function formatValorHaListagem(input: ValorHaInput): string {
  const v = resolverValorHaListagem(input);
  return v == null ? "—" : brl(v);
}
