export const FINANCIAL_REPORT_BUCKET = "financial-reports";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = { PDF: "pdf", XLSX: "xlsx", CSV: "csv" };

/**
 * Validates the private object locator returned by generate-financial-report.
 * Accepts the current Edge shape ({url, path, row_count}) and the reviewed one
 * ({bucket, path, export_id, row_count}); any `url` is ignored. Path must be
 * `<tenant>/<actor>/<reportType>_<ISO-ts>.<ext>`; Storage RLS stays authoritative.
 */
export function parseFinancialReportLocator(
  res: unknown,
  ctx: { organizationId: string | null | undefined; actorId: string | null | undefined; reportType: string; format: string },
): string | null {
  if (!res || typeof res !== "object" || Array.isArray(res)) return null;
  const r = res as Record<string, unknown>;
  const ext = EXT[ctx.format];
  if (!ext || !ctx.organizationId || !ctx.actorId || !/^[a-z_]{1,64}$/.test(ctx.reportType)) return null;
  if (r.bucket !== undefined && r.bucket !== FINANCIAL_REPORT_BUCKET) return null;
  if (r.export_id !== undefined && (typeof r.export_id !== "string" || !UUID.test(r.export_id))) return null;
  if (typeof r.path !== "string") return null;
  const parts = r.path.split("/");
  if (parts.length !== 3 || parts[0] !== ctx.organizationId || parts[1] !== ctx.actorId) return null;
  const file = new RegExp(`^${ctx.reportType}_\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.${ext}$`);
  return file.test(parts[2]) ? r.path : null;
}
