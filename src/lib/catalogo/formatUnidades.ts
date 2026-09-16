/**
 * Ponto único de verdade para formatação, arredondamento e rótulos
 * de unidades de preço e custo por hectare do catálogo Cultivo Farm.
 *
 * Toda tela, hook e PDF deve importar daqui — nunca replicar
 * `toFixed(2)`, sufixos ("/ha", "/L") ou textos como "Sob consulta".
 */

import { brl } from "@/lib/financial/format";
import {
  DOSES_POR_LITRO,
  resolverCustoHa,
  type ResolverCustoHaInput,
} from "@/lib/catalogo/pricing";
import { SOB_CONSULTA_LABEL } from "@/lib/catalogo/unidades";

export * from "@/lib/catalogo/unidades";
export * from "@/lib/catalogo/pricing";

/* ------------------------------------------------------------------ */
/* Labels canônicos                                                    */
/* ------------------------------------------------------------------ */

export const LABEL_CUSTO_HA = "Custo estimado por hectare";
export const LABEL_CUSTO_HA_CURTO = "Custo/ha";
export const PLACEHOLDER_VAZIO = "—";
export const REFERENCIA_DOSE_LITRO = `Referência: 1 L = ${DOSES_POR_LITRO} doses de 100 mL.`;
export const AVISO_CUSTO_HA_VARIAVEL =
  "O custo por hectare pode variar conforme dose recomendada, cultura, alvo e orientação técnica.";

/* ------------------------------------------------------------------ */
/* Arredondamento determinístico (half-up)                             */
/* ------------------------------------------------------------------ */

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Arredondamento half-up estável para `casas` decimais. */
export function roundTo(valor: number | null | undefined, casas: number): number {
  if (!isNum(valor)) return 0;
  const f = 10 ** casas;
  // epsilon evita erros de binário em bordas como 1.005
  return Math.round((valor + Number.EPSILON * Math.abs(valor)) * f) / f;
}

/** Moeda: 2 casas. */
export const round2 = (v: number | null | undefined): number => roundTo(v, 2);
/** Dose em mL: inteiro. */
export const roundDose = (v: number | null | undefined): number => roundTo(v, 0);
/** Área em hectares: 2 casas. */
export const roundArea = (v: number | null | undefined): number => roundTo(v, 2);
/** Volume em litros: 3 casas. */
export const roundVolume = (v: number | null | undefined): number => roundTo(v, 3);

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

const nf = (casas: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

/** Moeda BRL. Sempre passa pelo mesmo formatador do financeiro. */
export const formatarMoeda = (v: number | null | undefined): string => brl(round2(v));

/** Moeda ou "—" quando não há valor utilizável. */
export const formatarMoedaOuTraco = (v: number | null | undefined): string =>
  isNum(v) && v > 0 ? formatarMoeda(v) : PLACEHOLDER_VAZIO;

/** Qualquer valor ausente vira "—". */
export const formatarOuTraco = (v: string | number | null | undefined): string => {
  if (v == null) return PLACEHOLDER_VAZIO;
  const s = typeof v === "number" ? String(v) : v.trim();
  return s.length ? s : PLACEHOLDER_VAZIO;
};

/** Ex.: "100 mL/ha". */
export const formatarDose = (
  mlHa: number | null | undefined,
  { comSufixo = true }: { comSufixo?: boolean } = {},
): string => {
  if (!isNum(mlHa)) return PLACEHOLDER_VAZIO;
  const v = nf(0).format(roundDose(mlHa));
  return comSufixo ? `${v} mL/ha` : `${v} mL`;
};

/** Ex.: "12,50 ha". */
export const formatarArea = (ha: number | null | undefined): string =>
  isNum(ha) ? `${nf(2).format(roundArea(ha))} ha` : PLACEHOLDER_VAZIO;

/** Quantidade genérica (unidades, itens) com 2 casas. */
export const formatarQuantidade = (
  v: number | null | undefined,
  casas = 2,
): string => (isNum(v) ? nf(casas).format(roundTo(v, casas)) : PLACEHOLDER_VAZIO);


/** Ex.: "1,500 L" (zeros à direita removidos). */
export const formatarVolume = (litros: number | null | undefined): string => {
  if (!isNum(litros)) return PLACEHOLDER_VAZIO;
  const v = roundVolume(litros);
  const casas = Number.isInteger(v) ? 0 : v * 10 === Math.round(v * 10) ? 1 : 3;
  return `${nf(casas).format(v)} L`;
};

/** Ex.: "12,5%" — colapsa casas quando inteiro. */
export const formatarPercentual = (pct: number | null | undefined): string => {
  if (!isNum(pct)) return PLACEHOLDER_VAZIO;
  const v = roundTo(pct, 2);
  return `${nf(Number.isInteger(v) ? 0 : v * 10 === Math.round(v * 10) ? 1 : 2).format(v)}%`;
};

/* ------------------------------------------------------------------ */
/* Custo por hectare                                                   */
/* ------------------------------------------------------------------ */

export interface CustoHaFormatado {
  /** Valor resolvido (null quando não há base de cálculo). */
  valor: number | null;
  /** Texto pronto: moeda formatada ou "Sob consulta". */
  texto: string;
  /** true quando não há valor válido — nunca exibir R$ 0,00. */
  sobConsulta: boolean;
  /** Ex.: "100 mL/ha" ou null quando a dose não é conhecida. */
  doseTexto: string | null;
}

/**
 * Resolve e formata o custo por hectare em um único passo.
 * Nunca devolve "R$ 0,00": sem base de cálculo o texto é "Sob consulta".
 */
export function formatarCustoHa(input: ResolverCustoHaInput): CustoHaFormatado {
  const valor = resolverCustoHa(input);
  const sobConsulta = !isNum(valor) || (valor as number) <= 0;
  return {
    valor: sobConsulta ? null : (valor as number),
    texto: sobConsulta ? SOB_CONSULTA_LABEL : formatarMoeda(valor),
    sobConsulta,
    doseTexto: isNum(input.doseMlHa) ? formatarDose(input.doseMlHa) : null,
  };
}
