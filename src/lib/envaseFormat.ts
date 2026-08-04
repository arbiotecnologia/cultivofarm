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


export const defaultValidade = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
};
