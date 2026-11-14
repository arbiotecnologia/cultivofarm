import type { LabelData, LabelTemplate } from "@/lib/etiquetas";
export const fixtureId = "11111111-1111-4111-8111-111111111111";
export const replacementId = "22222222-2222-4222-8222-222222222222";
/** Synthetic persisted row with the SQL's nested template and nullable columns, not a hosted fixture. */
export function rpcLabelFixture(code: LabelTemplate = "etiqueta-op-100x150"): LabelData {
  const [width, height] = code.slice("etiqueta-op-".length).split("x").map(Number);
  return {
    id: fixtureId, codigo_etiqueta: "SYN-1", produto_nome: "Produto sintético", lote_codigo: "L1",
    trace_token: replacementId, tipo_etiqueta: "principal", status: "gerada", cq_liberado: true,
    template_versao: `${code}@v1`, template_codigo: null, metadata: null, observacoes: null,
    fabricado_em: null, validade_em: "2027-01-01", volume: null, unidade: null, protocolo_nome: null,
    conservacao: null, uso_recomendado: null, recipiente_seq: 1, recipiente_total: 1, substituida_por_id: null,
    snapshot: {
      template: { codigo: code, versao: 1, largura_mm: width, altura_mm: height },
      empresa: { nome: "Empresa sintética", logo_url: null, id: fixtureId },
      composicao: [{ nome: "Bacillus", microrganismo_id: fixtureId }],
      envase: { id: fixtureId, operador: "Operador teste", data_envase: "2026-11-14", quantidade: 1, volume_por_unidade: null },
      vinculos: { cliente_id: fixtureId, cliente_nome: "Cliente teste", fazenda_id: null, fazenda_nome: null },
      recipiente: { numero: 1, total: 1, embalagem_id: fixtureId },
      conformidade: { perfil_id: fixtureId, perfil_key: "PRIVADO", versao: 1, responsavel_tecnico_nome: "Responsável teste", registro_mapa: null },
      advertencias: null,
    },
  };
}