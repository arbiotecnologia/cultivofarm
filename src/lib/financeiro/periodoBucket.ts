/**
 * Aritmética de datas SOMENTE data (YYYY-MM-DD), sem `new Date("YYYY-MM-DD")`,
 * que seria interpretado em UTC e deslocaria o dia em fusos negativos (UTC-3).
 */

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataIsoValida(v: unknown): v is string {
  if (typeof v !== "string" || !RE_DATA.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const fmt = (dt: Date) =>
  `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return fmt(new Date(Date.UTC(a, m - 1, d + dias)));
}

export function fimDoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return fmt(new Date(Date.UTC(a, m, 0)));
}

export type Agrupamento = "DAY" | "WEEK" | "MONTH";

/** Intervalo bruto coberto pelo bucket que começa em `inicio`. */
export function intervaloDoBucket(inicio: string, agrupamento: Agrupamento): { from: string; to: string } | null {
  if (!dataIsoValida(inicio)) return null;
  if (agrupamento === "WEEK") return { from: inicio, to: somarDias(inicio, 6) };
  if (agrupamento === "MONTH") return { from: inicio, to: fimDoMes(inicio) };
  return { from: inicio, to: inicio };
}

/** Interseção com o recorte selecionado: o detalhe nunca sai do período do filtro. */
export function intersectarIntervalos(
  a: { from: string; to: string } | null,
  b: { from: string; to: string },
): { from: string; to: string } | null {
  if (!a) return null;
  if (!dataIsoValida(b.from) || !dataIsoValida(b.to)) return null;
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return from > to ? null : { from, to };
}

/** Intervalo efetivo do detalhamento de um bucket dentro do período filtrado. */
export function intervaloDetalhe(
  inicio: string,
  agrupamento: Agrupamento,
  periodo: { from: string; to: string },
): { from: string; to: string } | null {
  return intersectarIntervalos(intervaloDoBucket(inicio, agrupamento), periodo);
}
