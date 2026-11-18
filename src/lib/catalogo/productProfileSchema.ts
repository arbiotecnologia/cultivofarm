import { z } from "zod";

const text = z.string().nullable().optional();
const quantity = z.number().finite().nullable().optional();
export function parseProductProfileRows(profile: unknown, targets: unknown, crops: unknown, formulas: unknown, productId: string) {
  const root = z.object({
    id: z.string().min(1), produto_id: z.literal(productId),
    updated_at: z.string().datetime({ offset: true }),
    status_validacao: z.enum(["rascunho", "em_revisao", "aprovado", "arquivado"]),
    resumo_curto: text, beneficio_combinado: text, explicacao_tecnica: text,
    explicacao_produtor: text, explicacao_b2b: text, indicacoes_uso: text,
    janela_aplicacao: text, cuidados_aplicacao: text, compatibilidade: text,
    observacoes_regulatorias: text,
    validado_em: z.string().nullable().default(null), created_at: z.string().default(""),
  }).passthrough().nullable().parse(profile);
  const targetRows = z.array(z.object({
    id: z.string().min(1), produto_id: z.literal(productId), alvo_nome: z.string(),
    alvo_tipo: z.string(), descricao: text, prioridade: z.number().finite(), ativo: z.boolean(),
  }).passthrough()).parse(targets);
  const cropRows = z.array(z.object({
    id: z.string().min(1), produto_id: z.literal(productId), cultura_id: text, cultura_nome: text,
    fase_recomendada: text, objetivo_uso: text, dose_recomendada: text, observacao: text, ativo: z.boolean(),
  }).passthrough()).parse(crops);
  const formulaRows = z.array(z.object({
    microrganismo_id: text, component_insumo_id: text, volume_ml: quantity, proporcao: quantity,
    microrganismos: z.object({ id: z.string(), nome: z.string(), nome_cientifico: text, funcao_agronomica: text, tipo: z.string() }).nullable().optional(),
    insumo: z.object({ nome: z.string() }).nullable().optional(),
  }).passthrough()).parse(formulas);
  return { profile: root, targets: targetRows, crops: cropRows, formulas: formulaRows };
}