export function ownerCatalogRoute(path: string, capabilities: { catalog_read?: boolean; sheets_read?: boolean } | undefined) {
  if (path === "/portal-parceiro/catalogo") return capabilities?.catalog_read === true;
  if (path === "/portal-parceiro/fichas") return capabilities?.sheets_read === true;
  return false;
}
export function readCatalogCapabilities(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { catalog_read: false, sheets_read: false };
  const row = raw as Record<string, unknown>;
  if (row.contract !== "C2_CAT_V1") return { catalog_read: false, sheets_read: false };
  return { catalog_read: row.catalog_read === true, sheets_read: row.sheets_read === true };
}