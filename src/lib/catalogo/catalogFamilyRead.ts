/** Presentation over authorized rows only; never infer a product family from legacy `tipo`. */
export const READ_CATALOG_FAMILIES = ["biologico", "quimico", "fertilizante_adubo"] as const;
export type ReadCatalogFamily = (typeof READ_CATALOG_FAMILIES)[number];
export type CatalogFamilyFilter = ReadCatalogFamily | "todos" | "sem_classificacao";
export const READ_FAMILY_LABEL: Record<ReadCatalogFamily, string> = {
  biologico: "Biológicos", quimico: "Químicos", fertilizante_adubo: "Fertilizantes/Adubos",
};
export function readCatalogFamily(value: unknown): ReadCatalogFamily | null {
  return READ_CATALOG_FAMILIES.find(f => f === value) ?? null;
}
export function catalogFamilyMatches(item: { tipo: string; raw?: { familia_catalogo?: unknown } }, filter: CatalogFamilyFilter): boolean {
  if (filter === "todos") return true;
  if (item.tipo === "microrganismo") return filter === "biologico";
  if (filter === "sem_classificacao") return readCatalogFamily(item.raw?.familia_catalogo) === null;
  return readCatalogFamily(item.raw?.familia_catalogo) === filter;
}
export function catalogFamilyLabel(item: { tipo: string; raw?: { familia_catalogo?: unknown } }): string {
  if (item.tipo === "microrganismo") return "Microrganismo";
  const family = readCatalogFamily(item.raw?.familia_catalogo);
  return family ? READ_FAMILY_LABEL[family] : "Família não informada";
}