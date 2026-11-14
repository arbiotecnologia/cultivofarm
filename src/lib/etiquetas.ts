import { formatForVolumeMl, recipientVolumeMl, type RecipientLabel } from './etiquetasRecipientes';
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
  quantidade_embalagens?: number | null; snapshot?: Snapshot | null; metadata?: Snapshot | null;
  template_codigo?: string | null; template_versao?: string | null; cq_liberado?: boolean | null;
  substituida_por_id?: string | null;
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function labelTemplate(label: LabelData): LabelTemplate {
  if (label.snapshot?.layout_versao === 'recipiente-v2') return `etiqueta-op-${formatForVolumeMl(recipientVolumeMl(asRecipientLabel(label)))}`;
  const template = recordOf(label.snapshot?.template);
  // Frozen canonical snapshot first, persisted version second, older consumer shapes last.
  const candidates = [template.codigo, label.template_versao?.split("@v")[0],
    typeof label.snapshot?.template_versao === "string" ? label.snapshot.template_versao.split("@v")[0] : null,
    label.template_codigo, label.snapshot?.template_codigo, label.metadata?.template_codigo];
  for (const code of candidates) if (typeof code === "string" && Object.prototype.hasOwnProperty.call(LABEL_TEMPLATES, code)) return code as LabelTemplate;
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
  if (Array.isArray(value)) return [...new Set(value.map(snapshotText).filter(Boolean))].join("; ");
  if (typeof value === "object") return Object.entries(value).flatMap(([key, v]) => {
    const label = SNAPSHOT_FIELDS[key];
    const text = label ? snapshotText(v) : "";
    return text ? [`${label}: ${text}`] : [];
  }).join(" · ");
  if (isUuid(value)) return "";
  return String(value);
}
function recordOf(value: unknown): Snapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Snapshot : {};
}
// Positive display vocabulary: unknown fields, private keys and internal IDs are never serialized.
const SNAPSHOT_FIELDS: Record<string, string> = {
  nome: "Nome", nome_cientifico: "Nome científico", cepa: "Cepa", concentracao: "Concentração",
  microrganismo: "Microrganismo", percentual: "Percentual", unidade: "Unidade", quantidade: "Quantidade",
  data_envase: "Data do envase", data: "Data", operador: "Operador", tipo_embalagem: "Embalagem",
  volume_por_unidade: "Volume por recipiente", volume: "Volume", numero: "Número", sequencia: "Sequência", seq: "Sequência", total: "Total",
  codigo_embalagem: "Código da embalagem", recipiente_seq: "Recipiente", recipiente_total: "Total de recipientes",
  codigo_lote: "Lote", lote_codigo: "Lote", os_codigo: "Ordem de serviço", codigo_os: "Ordem de serviço",
  cliente_nome: "Cliente", fazenda_nome: "Propriedade", produto_nome: "Produto", protocolo_nome: "Protocolo",
  cliente: "Cliente", fazenda: "Propriedade", ordem_servico: "Ordem de serviço", protocolo: "Protocolo",
  responsavel_tecnico_nome: "Responsável técnico", responsavel_tecnico_registro: "Registro do responsável técnico",
  registro_mapa: "Registro MAPA", registro: "Registro", versao: "Versão", aprovado_em: "Aprovado em",
  responsavel_informacao: "Responsável pela informação", fonte_documento: "Fonte documental",
  advertencias: "Advertências", transporte_texto: "Transporte", conservacao_texto: "Conservação", uso_texto: "Uso",
  texto: "Texto", descricao: "Descrição", observacoes: "Observações",
};
function usefulFields(value: unknown, keys: string[]): string {
  const record = recordOf(value);
  return snapshotText(Object.fromEntries(keys.filter(key => record[key] != null).map(key => [key, record[key]])));
}
export function canPrintLabel(label: LabelData): boolean {
  return label.cq_liberado === true && !label.substituida_por_id && ["gerada", "impressa", "ativa", "ativo"].includes(label.status);
}
export function correctionReplacement(data: unknown): string {
  assertMutationAck(data);
  const id = recordOf(data).nova_etiqueta_id;
  if (!isUuid(id)) throw new Error("Correção sem substituta confirmada. Consulte antes de repetir.");
  return id;
}
export function replaceLabelIds(ids: string[], previous: string, replacement: string): string[] {
  return [...new Set(ids.map(id => id === previous ? replacement : id))];
}
export function snapshotCompany(label: LabelData) {
  const company = label.snapshot?.empresa;
  const record = company && typeof company === "object" ? company as Snapshot : {};
  return { name: typeof record.nome === "string" ? record.nome : "", logo: typeof record.logo_url === "string" && /^https:\/\//.test(record.logo_url) ? record.logo_url : null };
}
export function labelDetails(label: LabelData): [string, string][] {
  return [
    ["Composição", snapshotText(label.snapshot?.composicao) || label.cepas?.join(", ") || ""],
    ["Envase", usefulFields(label.snapshot?.envase, ["data_envase", "data", "operador", "tipo_embalagem", "volume_por_unidade", "quantidade", "unidade"])],
    ["Vínculos", usefulFields(label.snapshot?.vinculos, ["os_codigo", "codigo_os", "cliente_nome", "fazenda_nome", "produto_nome", "protocolo_nome", "cliente", "fazenda", "ordem_servico", "protocolo"])],
    ["Recipiente", snapshotText(label.snapshot?.recipiente)],
    ["Advertências", snapshotText(label.snapshot?.advertencias)],
    ["Conformidade", usefulFields(label.snapshot?.conformidade, ["responsavel_tecnico_nome", "responsavel_tecnico_registro", "registro_mapa", "registro", "versao", "aprovado_em", "responsavel_informacao", "fonte_documento", "advertencias", "transporte_texto"])],
    ["Conservação", label.conservacao || ""], ["Uso", label.uso_recomendado || ""], ["Observações", label.observacoes || ""],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}
export function asRecipientLabel(label: LabelData): RecipientLabel {
  return { ...label, template_versao: label.template_versao ?? undefined, snapshot: label.snapshot ?? {} };
}
