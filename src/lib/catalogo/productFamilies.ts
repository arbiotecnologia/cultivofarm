import { readCatalogFamily, type ReadCatalogFamily } from "./catalogFamilyRead";

export type ProductFamilyTab = ReadCatalogFamily | "todos" | "sem_classificacao";
export const PRODUCT_FAMILY_TABS = [
  { value: "todos", label: "Todos" },
  { value: "biologico", label: "Biológicos" },
  { value: "quimico", label: "Produtos químicos" },
  { value: "fertilizante_adubo", label: "Fertilizantes/Adubos" },
  { value: "sem_classificacao", label: "Sem classificação" },
] as const;
export function productMatchesFamily(family: unknown, tab: ProductFamilyTab) {
  if (tab === "todos") return true;
  const canonical = readCatalogFamily(family);
  return tab === "sem_classificacao" ? canonical === null : canonical === tab;
}
export function familyForNewProduct(tab: ProductFamilyTab): string {
  return tab === "todos" || tab === "sem_classificacao" ? "" : tab;
}