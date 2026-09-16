/**
 * Módulo canônico de unidades de preço do catálogo Cultivo Farm.
 *
 * Toda tela (catálogo B2B, catálogo técnico, matriz de preços, fichas,
 * carrinho, pedidos e PDFs) deve derivar rótulos e unidade principal daqui,
 * evitando strings soltas como "/ha" ou "/dose".
 */

import { brl } from "@/lib/financial/format";

export type UnidadePreco =
  | "hectare"
  | "litro"
  | "dose_100ml"
  | "volume_comercial"
  | "sob_consulta";

export const UNIDADES_PRECO: readonly UnidadePreco[] = [
  "hectare",
  "litro",
  "dose_100ml",
  "volume_comercial",
  "sob_consulta",
] as const;

/** Rótulo curto, usado como sufixo de valor (ex.: R$ 120,00/ha). */
export const UNIDADE_LABEL_CURTA: Record<UnidadePreco, string> = {
  hectare: "/ha",
  litro: "/L",
  dose_100ml: "/dose 100 mL",
  volume_comercial: "/un",
  sob_consulta: "",
};

/** Rótulo por extenso, usado em cabeçalhos, legendas e PDFs. */
export const UNIDADE_LABEL_LONGA: Record<UnidadePreco, string> = {
  hectare: "por hectare",
  litro: "por litro",
  dose_100ml: "por dose de 100 mL",
  volume_comercial: "por unidade (volume comercial)",
  sob_consulta: "sob consulta",
};

export const SOB_CONSULTA_LABEL = "Sob consulta";

const positivo = (v: number | null | undefined): boolean =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/** Converte qualquer valor vindo do backend na união canônica. */
export function normalizarUnidade(valor: unknown): UnidadePreco | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  return (UNIDADES_PRECO as readonly string[]).includes(v)
    ? (v as UnidadePreco)
    : null;
}

export interface ValoresUnidade {
  valorHa?: number | null;
  valorLitro?: number | null;
  valorDose?: number | null;
  valorVolume?: number | null;
}

export interface ResolverUnidadeInput extends ValoresUnidade {
  tipo?: "produto" | "microrganismo" | null;
  /** Unidade informada pelo backend; tem prioridade quando coerente com os valores. */
  unidadeBackend?: unknown;
}

/**
 * Precedência determinística:
 * - produto: hectare > litro > dose 100 mL > volume > sob consulta
 * - microrganismo: dose 100 mL > litro > hectare > volume > sob consulta
 *
 * A unidade do backend é respeitada apenas quando existe valor positivo
 * correspondente; caso contrário cai na precedência acima (fail-safe).
 */
export function resolverUnidadePreco(input: ResolverUnidadeInput): UnidadePreco {
  const { tipo, valorHa, valorLitro, valorDose, valorVolume } = input;
  const disponivel: Record<UnidadePreco, boolean> = {
    hectare: positivo(valorHa),
    litro: positivo(valorLitro),
    dose_100ml: positivo(valorDose),
    volume_comercial: positivo(valorVolume),
    sob_consulta: true,
  };

  const backend = normalizarUnidade(input.unidadeBackend);
  if (backend && backend !== "sob_consulta" && disponivel[backend]) return backend;

  const ordem: UnidadePreco[] =
    tipo === "microrganismo"
      ? ["dose_100ml", "litro", "hectare", "volume_comercial"]
      : ["hectare", "litro", "dose_100ml", "volume_comercial"];

  for (const u of ordem) if (disponivel[u]) return u;
  return "sob_consulta";
}

/** Valor correspondente à unidade escolhida (null quando indisponível). */
export function valorDaUnidade(
  unidade: UnidadePreco,
  valores: ValoresUnidade,
): number | null {
  switch (unidade) {
    case "hectare":
      return positivo(valores.valorHa) ? (valores.valorHa as number) : null;
    case "litro":
      return positivo(valores.valorLitro) ? (valores.valorLitro as number) : null;
    case "dose_100ml":
      return positivo(valores.valorDose) ? (valores.valorDose as number) : null;
    case "volume_comercial":
      return positivo(valores.valorVolume) ? (valores.valorVolume as number) : null;
    default:
      return null;
  }
}

export function labelUnidadeCurta(unidade: UnidadePreco): string {
  return UNIDADE_LABEL_CURTA[unidade] ?? "";
}

export function labelUnidadeLonga(unidade: UnidadePreco): string {
  return UNIDADE_LABEL_LONGA[unidade] ?? "";
}

/** Ex.: "R$ 120,00/ha" — ou "Sob consulta" quando não há valor válido. */
export function formatarPrecoUnitario(
  valor: number | null | undefined,
  unidade: UnidadePreco,
  formatter: (v: number) => string = brl,
): string {
  if (unidade === "sob_consulta" || !positivo(valor)) return SOB_CONSULTA_LABEL;
  return `${formatter(valor as number)}${labelUnidadeCurta(unidade)}`;
}

export function isSobConsulta(
  unidade: UnidadePreco,
  valor?: number | null,
): boolean {
  return unidade === "sob_consulta" || !positivo(valor);
}
