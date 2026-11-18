export const PRODUCT_UNITS = ["kg", "g", "ml", "l"] as const;
export type ProductUnit = typeof PRODUCT_UNITS[number];
export function isProductUnit(value: unknown): value is ProductUnit {
  return PRODUCT_UNITS.some(unit => unit === value);
}
/** Legacy numeric application fields are volume-only; never infer density. */
export function supportsVolumeApplication(unit: unknown): boolean {
  return unit === "ml" || unit === "l";
}
export function supportsVolumeComposition(unit: unknown, family: unknown): boolean {
  return supportsVolumeApplication(unit) && (family === "biologico" || family === "" || family == null);
}
export function parseUnitCapability(raw: unknown): true {
  const data = raw as Record<string, unknown> | null;
  if (!data || data.contract !== "PRODUCT_UNIT_V2" || data.writer !== "tenant_product_save" ||
      !Array.isArray(data.units) || data.units.length !== 4 ||
      PRODUCT_UNITS.some(unit => !(data.units as unknown[]).includes(unit))) throw new Error("product_unit_capability_unavailable");
  return true;
}
export function parseAdminUnit(raw: unknown, productId: string): ProductUnit | null {
  const data = raw as Record<string, unknown> | null;
  if (!data || data.contract !== "SOLID_PACK_ADMIN_V1" || data.product_id !== productId ||
      typeof data.config_version !== "number" || !Number.isInteger(data.config_version) || data.config_version < 0 ||
      !Array.isArray(data.offers)) throw new Error("product_unit_read_unavailable");
  if (data.unidade_conteudo === null) return null;
  if (!isProductUnit(data.unidade_conteudo)) throw new Error("product_unit_read_unavailable");
  return data.unidade_conteudo;
}