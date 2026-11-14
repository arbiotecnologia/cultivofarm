export const LABEL_TEMPLATES = {
  "etiqueta-op-100x150": { width: 100, height: 150 },
  "etiqueta-op-100x100": { width: 100, height: 100 },
  "etiqueta-op-80x50": { width: 80, height: 50 },
  "etiqueta-op-50x30": { width: 50, height: 30 },
} as const;
export type LabelTemplate = keyof typeof LABEL_TEMPLATES;
export type Snapshot = Record<string, unknown>;
export interface LabelData {
  id: string; codigo_etiqueta: string; tipo_etiqueta: string; status: string;
  produto_nome: string; lote_codigo: string; trace_token: string;
  fabricado_em?: string | null; validade_em?: string | null;
  volume?: number | null; unidade?: string | null; cepas?: string[] | null;
  protocolo_nome?: string | null; conservacao?: string | null; uso_recomendado?: string | null;
  observacoes?: string | null; recipiente_seq?: number | null; recipiente_total?: number | null;
  quantidade_embalagens?: number | null; snapshot?: Snapshot | null; metadata?: Snapshot;
  template_codigo?: string; cq_liberado?: boolean;
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function labelTemplate(label: LabelData): LabelTemplate {
  const code = label.template_codigo ?? label.snapshot?.template_codigo ?? label.metadata?.template_codigo;
  if (typeof code === "string" && code in LABEL_TEMPLATES) return code as LabelTemplate;
  return label.tipo_etiqueta === "reduzida" ? "etiqueta-op-50x30" : "etiqueta-op-100x150";
}
export function generationPayload(envaseId: string | undefined, loteId: string | undefined, tipo: string, template: LabelTemplate) {
  if (Boolean(envaseId) === Boolean(loteId) || !isUuid(envaseId ?? loteId)) throw new Error("Informe exatamente um envase ou lote válido.");
  return { ...(envaseId ? { envase_id: envaseId } : { lote_id: loteId }), tipo_etiqueta: tipo, template_codigo: template };
}
export function generationIds(data: unknown): string[] {
  const result = data as { etiqueta_ids?: unknown; total_geradas?: unknown; total_reaproveitadas?: unknown } | null;
  const ids = result?.etiqueta_ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every(isUuid) || new Set(ids).size !== ids.length ||
    !Number.isInteger(result?.total_geradas) || !Number.isInteger(result?.total_reaproveitadas) ||
    Number(result?.total_geradas) < 0 || Number(result?.total_reaproveitadas) < 0 ||
    Number(result?.total_geradas) + Number(result?.total_reaproveitadas) !== ids.length) throw new Error("Geração não confirmada. Consulte as etiquetas antes de tentar novamente.");
  return ids;
}
export function assertMutationAck(data: unknown) {
  if (data === false || (data && typeof data === "object" && (('success' in data && data.success === false) || ('ok' in data && data.ok === false)))) throw new Error("Operação não confirmada.");
}
export function snapshotText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(snapshotText).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.entries(value).map(([key, v]) => `${key.replace(/_/g, " ")}: ${snapshotText(v)}`).filter(v => !v.endsWith(": ")).join(" · ");
  return String(value);
}
export function snapshotCompany(label: LabelData) {
  const company = label.snapshot?.empresa;
  const record = company && typeof company === "object" ? company as Snapshot : {};
  return { name: typeof record.nome === "string" ? record.nome : "", logo: typeof record.logo_url === "string" && /^https:\/\//.test(record.logo_url) ? record.logo_url : null };
}
export function labelDetails(label: LabelData): [string, string][] {
  return [
    ["Composição", snapshotText(label.snapshot?.composicao) || label.cepas?.join(", ") || ""],
    ["Envase", snapshotText(label.snapshot?.envase)],
    ["Vínculos", snapshotText(label.snapshot?.vinculos)],
    ["Recipiente", snapshotText(label.snapshot?.recipiente)],
    ["Advertências", snapshotText(label.snapshot?.advertencias)],
    ["Conformidade", snapshotText(label.snapshot?.conformidade)],
    ["Conservação", label.conservacao || ""], ["Uso", label.uso_recomendado || ""], ["Observações", label.observacoes || ""],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}