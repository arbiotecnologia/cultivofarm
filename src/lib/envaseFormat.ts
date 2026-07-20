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

export const fmtL = (ml: number) =>
  `${(ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;

export const defaultValidade = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
};
