export const LABEL_FORMATS = {
  '100x150': { width: 100, height: 150 },
  '100x100': { width: 100, height: 100 },
  '80x50': { width: 80, height: 50 },
  '50x30': { width: 50, height: 30 },
} as const;
export type LabelFormat = keyof typeof LABEL_FORMATS;
export type OperationalFormat = '100x150' | '100x100' | '80x50';
// Envase stores volume_por_unidade in mL, never total lot volume.
export function formatForVolumeMl(volume: unknown): OperationalFormat {
  if (volume === 20000) return '100x150';
  if (volume === 5000) return '100x100';
  if (volume === 1000) return '80x50';
  throw new Error('Volume por recipiente não aprovado. Use 20 L, 5 L ou 1 L; confira o envase.');
}
export function resolveOperationalTemplates(volumes: unknown[], catalog: unknown[]): { format: OperationalFormat; codigo: string }[] {
  if (!volumes.length) throw new Error('Nenhum recipiente disponível. Consulte os envases do lote.');
  const formats = [...new Set(volumes.map(formatForVolumeMl))];
  return formats.map(format => {
    const size = LABEL_FORMATS[format];
    const codes = [...new Set(catalog.map(record).filter(t => t.ativo === true && t.largura_mm === size.width && t.altura_mm === size.height).map(t => text(t.codigo)).filter(Boolean))];
    if (codes.length !== 1) throw new Error(`Modelo ${format} mm ausente ou ambíguo no cadastro. Solicite regularização; nenhum código será inventado.`);
    return { format, codigo: codes[0] ?? '' };
  }).sort((a, b) => LABEL_FORMATS[b.format].height - LABEL_FORMATS[a.format].height);
}
export function approvedDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || (value.length > 10 && !Number.isFinite(Date.parse(value)))) throw new Error('Validade aprovada ausente ou inválida. Regularize a validade do lote e gere novamente.');
  const iso = value.slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new Error('Validade aprovada inválida. Regularize o lote.');
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
export function recipientVolumeMl(label: RecipientLabel): number {
  const r = record(label.snapshot.recipiente);
  const raw = r.volume_por_unidade ?? r.volume_ml ?? label.snapshot.volume_por_unidade;
  if (typeof raw === 'number') return raw;
  const volume = r.volume ?? label.snapshot.volume;
  const unit = text(r.unidade ?? label.snapshot.unidade).toLowerCase();
  if (typeof volume === 'number' && unit === 'l') return volume * 1000;
  if (typeof volume === 'number' && unit === 'ml') return volume;
  throw new Error('Volume por recipiente ausente no snapshot. Regularize a etiqueta.');
}
export function outputFormat(label: RecipientLabel, fallback: LabelFormat): LabelFormat {
  return label.tipo_etiqueta === 'interna' || label.snapshot.layout_versao === 'recipiente-v2' ? formatForVolumeMl(recipientVolumeMl(label)) : fallback;
}
export function validateRecipientV2(label: RecipientLabel, format: LabelFormat) {
  if (label.snapshot.layout_versao !== 'recipiente-v2') throw new Error('Etiqueta legada: regularização para recipiente-v2 obrigatória antes de exportar ou imprimir recipientes.');
  const validity = approvedDate(label.snapshot.validade_em);
  const toxicity = text(label.snapshot.toxicidade).trim();
  if (!toxicity) throw new Error('Toxicidade aprovada ausente. Regularize o produto e gere novamente; não preencha texto presumido.');
  const expected = formatForVolumeMl(recipientVolumeMl(label));
  if (format !== expected || (snapshotTemplate(label).format && snapshotTemplate(label).format !== expected)) throw new Error('Modelo incompatível com o volume do recipiente. Regularize o modelo canônico.');
  const s = label.snapshot; const r = record(s.recipiente);
  if (!text(s.produto_nome) || !text(s.lote_codigo) || !text(record(s.empresa).nome)) throw new Error('Produto, lote ou empresa ausente no snapshot. Regularize a etiqueta.');
  if (!Number.isInteger(r.seq) || !Number.isInteger(r.total) || Number(r.seq) < 1 || Number(r.total) < Number(r.seq)) throw new Error('Sequência do recipiente ausente ou inválida. Regularize a etiqueta.');
  return { validity, toxicity, volume: `${recipientVolumeMl(label) / 1000} L`, sequence: `${r.seq}/${r.total}` };
}
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : Array.isArray(value) ? value.map(text).filter(Boolean).join('; ') : '';

export interface RecipientLabel {
  id: string;
  codigo_etiqueta: string;
  trace_token: string;
  status: string;
  tipo_etiqueta: string;
  template_versao?: string;
  snapshot: Record<string, unknown>;
}
export function snapshotTemplate(label: RecipientLabel): { codigo: string; version: string; format?: LabelFormat } {
  const template = record(label.snapshot.template);
  const codigo = text(template.codigo);
  const version = text(label.snapshot.template_versao) || text(label.template_versao);
  if (version && (!codigo || !version.startsWith(`${codigo}@v`) || !/^[1-9]\d*$/.test(version.slice(codigo.length + 2)))) throw new Error('Versão do modelo incompatível com snapshot.template.codigo.');
  if (template.versao != null && version && version !== `${codigo}@v${text(template.versao)}`) throw new Error('Versões do modelo divergentes no snapshot.');
  if (label.template_versao && text(label.snapshot.template_versao) && label.template_versao !== text(label.snapshot.template_versao)) throw new Error('Versão da etiqueta diverge do snapshot.');
  let format: LabelFormat | undefined;
  if (template.largura_mm != null || template.altura_mm != null) {
    format = (Object.keys(LABEL_FORMATS) as LabelFormat[]).find(key => LABEL_FORMATS[key].width === template.largura_mm && LABEL_FORMATS[key].height === template.altura_mm);
    if (!format) throw new Error('Dimensões do modelo não correspondem aos quatro formatos suportados.');
  }
  return { codigo, version, format };
}
export function parseLabel(value: unknown): RecipientLabel {
  const row = record(value);
  if (!isUuid(row.id) || !isUuid(row.trace_token) || !text(row.codigo_etiqueta) || !Object.keys(record(row.snapshot)).length) throw new Error('Etiqueta sem identificação ou snapshot válido.');
  const label = { id: row.id, trace_token: row.trace_token, codigo_etiqueta: text(row.codigo_etiqueta), status: text(row.status), tipo_etiqueta: text(row.tipo_etiqueta), template_versao: text(row.template_versao) || undefined, snapshot: record(row.snapshot) };
  snapshotTemplate(label);
  return label;
}
export function generationPayload(origin: { envaseId?: string; loteId?: string }, tipo: string, template: string) {
  const id = origin.envaseId ?? origin.loteId;
  if (!isUuid(id) || Boolean(origin.envaseId) === Boolean(origin.loteId)) throw new Error('Informe exatamente um envase ou lote válido.');
  if (!tipo || !template.trim()) throw new Error('Selecione tipo e modelo cadastrado.');
  return { ...(origin.envaseId ? { envase_id: id } : { lote_id: id }), tipo_etiqueta: tipo, template_codigo: template };
}
export function parseGeneratedIds(value: unknown): string[] {
  const ids = record(value).etiqueta_ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every(isUuid) || new Set(ids).size !== ids.length) throw new Error('Resposta de geração inválida; não reenvie automaticamente.');
  return ids;
}
export function selectedCopies(labels: RecipientLabel[], copies: Record<string, number>): RecipientLabel[] {
  const result: RecipientLabel[] = [];
  labels.forEach(label => {
    const quantity = copies[label.id] ?? 0;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 500) throw new Error('Quantidade inválida (0 a 500).');
    if (quantity && ['cancelada', 'revogada', 'substituida'].includes(label.status.toLowerCase())) throw new Error('Etiqueta inativa não pode ser impressa.');
    for (let i = 0; i < quantity; i++) result.push(label);
  });
  if (!result.length || result.length > 500) throw new Error('Selecione de 1 a 500 cópias.');
  return result;
}
export function snapshotFields(label: RecipientLabel): [string, string][] {
  const s = label.snapshot;
  const compliance = record(s.conformidade);
  const links = record(s.vinculos);
  const composition = Array.isArray(s.composicao) ? s.composicao.map(v => {
    if (typeof v === 'string') return v;
    const c = record(v); return [text(c.nome), text(c.quantidade), text(c.unidade)].filter(Boolean).join(' ');
  }).filter(Boolean).join('; ') : text(s.composicao);
  return [
    ['Empresa', text(s.empresa_nome) || text(record(s.empresa).nome)],
    ['Produto', text(s.produto_nome)], ['Lote', text(s.lote_codigo)],
    ['Cliente', text(links.cliente_nome) || text(s.cliente_nome) || text(record(s.cliente).nome)],
    ['Propriedade', text(links.fazenda_nome) || text(s.propriedade_nome) || text(s.fazenda_nome) || text(record(s.propriedade).nome)],
    ['Pedido', text(links.pedido_codigo) || text(s.pedido_codigo)], ['OS', text(links.os_codigo) || text(links.codigo_os) || text(s.os_codigo) || text(s.ordem_servico_codigo)],
    ['Volume', s.volume != null ? [text(s.volume), text(s.unidade)].filter(Boolean).join(' ') : ''],
    ['Fabricação', text(s.fabricado_em)], ['Validade', text(s.validade_em)],
    ['Envase', text(record(s.envase).data_envase)], ['Toxicidade', text(s.toxicidade)],
    ['Composição', composition || text(s.cepas)], ['Conservação', text(s.conservacao)],
    ['Uso', text(s.uso_recomendado)], ['Observações', text(s.observacoes)],
    ['Responsável técnico', [text(compliance.responsavel_tecnico_nome), text(compliance.responsavel_tecnico_registro)].filter(Boolean).join(' · ')],
    ['Registro MAPA', text(compliance.registro_mapa)],
    ['Avisos', text(s.advertencias) || text(compliance.advertencias)],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));
}
export function secureTraceUrl(token: string, origin: string): string {
  if (!isUuid(token)) throw new Error('Token de rastreio inválido.');
  const url = new URL('https://app.cultivofarm.com.br');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) throw new Error('Origem de rastreio insegura.');
  return `${url.origin}/rastrear-produto/${token}`;
}
export function safeSnapshotLogo(label: RecipientLabel): string | undefined {
  const logo = text(label.snapshot.logo_url) || text(record(label.snapshot.empresa).logo_url);
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo)) return logo;
  try { const url = new URL(logo); if (url.protocol === 'https:' && url.hostname === 'swzpzcwiasxmjutrmvkm.supabase.co' && url.pathname.startsWith('/storage/v1/object/public/') && !url.search && !url.hash) return url.href; } catch { /* No logo is invented. */ }
  return undefined;
}