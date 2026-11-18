import type { DocumentaryEvidence } from './documentarySuggestions';
import { parseTenantCatalogAck } from './tenantCatalogRoots';
export const MICRO_ROOT_FIELDS = ['codigo','nome','nome_cientifico','tipo','fornecedor','funcao_agronomica','concentracao_label','descricao','observacoes'] as const;
export const MICRO_EXTRA_FIELDS = ['sinonimos','cepa','origem','concentracao_unidade','apresentacao','culturas_uso','alvos_uso','documentos_pendentes'] as const;
export const MICRO_CONTENT_FIELDS = ['resumo_curto','mecanismo_acao','beneficios_agronomicos','explicacao_tecnica','explicacao_produtor','explicacao_b2b','indicacoes_uso','cuidados_aplicacao','compatibilidade','armazenamento','observacoes_regulatorias'] as const;
export const MICRO_SECTIONS = ['Identificação','Características técnicas','Uso agronômico','Conteúdo do catálogo','Fiscal e regulatório','Fontes e histórico'] as const;
export type MicroFichaRow = { id: string; nome: string; descricao: string | null; updated_at: string | null; owner_organization_id?: string | null; nome_cientifico?: string | null; tipo?: string; [key: string]: unknown };
export function microDraft(row: Record<string, unknown> | null, profile?: Record<string, unknown> | null): Record<string,string> {
  return Object.fromEntries([...MICRO_ROOT_FIELDS,...MICRO_EXTRA_FIELDS,...MICRO_CONTENT_FIELDS].map(f => [f, String((MICRO_CONTENT_FIELDS as readonly string[]).includes(f) ? profile?.[f] ?? '' : row?.[f] ?? (f === 'tipo' ? 'bacteria' : ''))]));
}
export function microPayload(values: Record<string,string>, baseline: Record<string,string>) {
  const changed = (fields: readonly string[]) => Object.fromEntries(fields.filter(f => values[f] !== baseline[f]).map(f => [f,values[f]?.trim() || null]));
  return { root: changed(MICRO_ROOT_FIELDS), extra: changed(MICRO_EXTRA_FIELDS), content: changed(MICRO_CONTENT_FIELDS) };
}
type Rpc = { rpc(fn: string, args: Record<string,unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> };
export async function saveMicroFicha(client: Rpc, id: string | null, version: string | null, profileVersion: string | null, values: Record<string,string>, baseline: Record<string,string>, evidence: DocumentaryEvidence[], key: string) {
  if (!values.nome?.trim()) throw new Error('Informe o nome.');
  if (id && !version) throw new Error('Versão observada ausente; recarregue a ficha.');
  const payload = microPayload(values,baseline);
  if (!id) payload.root = { ...payload.root, nome: values.nome.trim(), tipo: values.tipo || "bacteria" };
  const {data,error} = await client.rpc('tenant_microorganism_ficha_save_v1',{p_id:id,p_expected_updated_at:version,p_expected_profile_updated_at:profileVersion,p_payload:payload,p_evidence:evidence,p_key:key});
  if(error) throw Object.assign(new Error(error.code === 'PT409' ? 'A ficha mudou ou a tentativa divergiu. Rascunho preservado; confira a versão antes de salvar.' : error.code === '42501' ? 'Sem permissão para salvar esta ficha.' : error.code === 'PGRST202' ? 'O contrato completo da ficha aguarda instalação revisada. Nada foi salvo; rascunho preservado.' : 'Não foi possível salvar a ficha; rascunho preservado.'), {serverCode:error.code});
  return parseTenantCatalogAck(data,id);
}
