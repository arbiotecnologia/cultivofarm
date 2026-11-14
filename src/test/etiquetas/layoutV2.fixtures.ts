import { LABEL_FORMATS, type RecipientLabel, formatForVolumeMl } from '@/lib/etiquetasRecipientes';
export const QA_ORIGIN = 'https://id-preview--cf4a99d8-4f13-43a9-98bb-c02d12786e8f.lovable.app';
export function qaLabel(volumeMl: number): RecipientLabel {
  const format = formatForVolumeMl(volumeMl); const size = LABEL_FORMATS[format]; const codigo = `QA-${format}`;
  return { id: '11111111-1111-4111-8111-111111111111', trace_token: '22222222-2222-4222-8222-222222222222', codigo_etiqueta: `QA-${volumeMl / 1000}L-001`, status: 'gerada', tipo_etiqueta: 'interna', template_versao: `${codigo}@v1`, snapshot: {
    layout_versao: 'recipiente-v2', template: { codigo, largura_mm: size.width, altura_mm: size.height }, template_versao: `${codigo}@v1`, produto_nome: 'PRODUTO QA SINTÉTICO', lote_codigo: 'LOTE-QA-TESTE', validade_em: '2099-12-31', toxicidade: 'DADO DE TESTE — toxicidade simulada para homologação.', empresa: { nome: 'EMPRESA QA · TESTE' }, recipiente: { volume_por_unidade: volumeMl, seq: 1, total: 3 },
    ...(volumeMl === 1000 ? {} : { envase: { data_envase: '2099-01-01' }, cliente_nome: 'CLIENTE QA', propriedade_nome: 'PROPRIEDADE QA', os_codigo: 'OS-QA-TESTE', composicao: 'COMPOSIÇÃO QA SIMULADA', observacoes: 'VALIDADE SINTÉTICA 31/12/2099 · NÃO OPERACIONAL' }),
  } };
}
