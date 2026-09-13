export const embalagemLabels: Record<string, string> = {
  frasco_1L: "Frasco 1L",
  bombona_5L: "Bombona 5L",
  bombona_20L: "Bombona 20L",
};

export const embalagemVolumes: Record<string, number> = {
  frasco_1L: 1000,
  bombona_5L: 5000,
  bombona_20L: 20000,
};

export const fmtLNumero = (ml: number) =>
  (ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export const fmtL = (ml: number) => `${fmtLNumero(ml)} L`;

/**
 * Separa um rótulo de volume em número + unidade para permitir
 * alinhamento em colunas. Rótulos personalizados fora do padrão
 * "N L" retornam unidade nula.
 */
export function splitVolumeLabel(label: string): { numero: string; unidade: string | null } {
  const m = label.trim().match(/^([\d.,]+)\s*(mL|L)$/i);
  if (!m) return { numero: label.trim(), unidade: null };
  return { numero: m[1], unidade: m[2] };
}


const pad2 = (n: number) => String(n).padStart(2, "0");

/** Data civil local em ISO (sem deslocamento de fuso por toISOString). */
export const toISODateLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Soma meses no calendário local, limitando ao último dia do mês de destino
 * (31/08 + 6 meses = 28/02, nunca "rollover" para março).
 */
export const addMesesLocal = (base: Date, meses: number): Date => {
  const ano = base.getFullYear();
  const mes = base.getMonth();
  const dia = base.getDate();
  const ultimoDia = new Date(ano, mes + meses + 1, 0).getDate();
  return new Date(ano, mes + meses, Math.min(dia, ultimoDia));
};

export const defaultValidade = (base: Date = new Date()) =>
  toISODateLocal(addMesesLocal(base, 6));
