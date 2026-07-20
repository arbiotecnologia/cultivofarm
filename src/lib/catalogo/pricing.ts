import { brl } from "@/lib/financial/format";

export const DOSE_PADRAO_ML = 100;
export const DOSES_POR_LITRO = 10;

export const calcularValorLitro = (valorDose100ml: number | null | undefined): number | null =>
  valorDose100ml == null ? null : valorDose100ml * DOSES_POR_LITRO;

export const calcularValorDose = (valorLitro: number | null | undefined): number | null =>
  valorLitro == null ? null : valorLitro / DOSES_POR_LITRO;

export const calcularCustoHa = (doseMlHa: number | null | undefined, valorDose100ml: number | null | undefined): number | null => {
  if (!doseMlHa || !valorDose100ml) return null;
  return (doseMlHa / DOSE_PADRAO_ML) * valorDose100ml;
};

export const calcularDoseAPartirCustoHa = (doseMlHa: number | null | undefined, valorHa: number | null | undefined): number | null => {
  if (!doseMlHa || !valorHa) return null;
  return valorHa / (doseMlHa / DOSE_PADRAO_ML);
};

export const calcularDosesPorVolume = (volumeMl: number | null | undefined): number | null =>
  !volumeMl ? null : volumeMl / DOSE_PADRAO_ML;

export const calcularPrecoLitro = (volumeMl: number | null | undefined, precoVolume: number | null | undefined): number | null => {
  if (!volumeMl || precoVolume == null) return null;
  return precoVolume / (volumeMl / 1000);
};

export const calcularValorDoseVolume = (volumeMl: number | null | undefined, precoVolume: number | null | undefined): number | null => {
  const pl = calcularPrecoLitro(volumeMl, precoVolume);
  return pl == null ? null : pl / DOSES_POR_LITRO;
};

export const formatPricingResumo = (valorDose100ml: number | null | undefined): string => {
  const litro = calcularValorLitro(valorDose100ml);
  if (valorDose100ml == null || litro == null) return "Não informado";
  return `Dose 100 mL: ${brl(valorDose100ml)} · Litro: ${brl(litro)} · 1 L = ${DOSES_POR_LITRO} doses`;
};
