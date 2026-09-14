/**
 * Validação explícita da quantidade conferida (padrão pt-BR).
 * Nunca coage vazio/zero/NaN para 1: entrada inválida falha de forma explícita.
 */

export const MSG_QUANTIDADE_INVALIDA =
  "Informe uma quantidade numérica maior que zero (ex.: 1 ou 1,5).";

export type QuantidadeValida = { ok: true; valor: number; motivo?: undefined };
export type QuantidadeInvalida = { ok: false; valor?: undefined; motivo: string };
export type ResultadoQuantidade = QuantidadeValida | QuantidadeInvalida;

/**
 * Aceita apenas dígitos com no máximo um separador decimal (vírgula ou ponto).
 * Rejeita ambiguidade como "1.234,56", "1,2,3", "1 000", sinais e vazio.
 */
export function parseQuantidadeConferencia(entrada: unknown): ResultadoQuantidade {
  if (typeof entrada === "number") {
    return Number.isFinite(entrada) && entrada > 0
      ? { ok: true, valor: entrada }
      : { ok: false, motivo: MSG_QUANTIDADE_INVALIDA };
  }
  const texto = typeof entrada === "string" ? entrada.trim() : "";
  if (!texto) return { ok: false, motivo: MSG_QUANTIDADE_INVALIDA };
  if (!/^\d+([.,]\d+)?$/.test(texto)) return { ok: false, motivo: MSG_QUANTIDADE_INVALIDA };
  const valor = Number(texto.replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, motivo: MSG_QUANTIDADE_INVALIDA };
  return { ok: true, valor };
}
