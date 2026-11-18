import { z } from "zod";
import { SOURCE_TYPES, CONFIDENCE_LEVELS } from "@/hooks/useCatalogSources";
import { TARGET_TYPES } from "@/hooks/useCatalogTargetsCrops";
import { validateOptionalSourceUrl } from "./safeSourceUrl";

const nullableText = z.string().nullable();
export const PRODUCT_RELATION_FIELDS = {
  crop: [
    "cultura_id",
    "cultura_nome",
    "fase_recomendada",
    "objetivo_uso",
    "dose_recomendada",
    "observacao",
    "ativo",
  ],
  target: [
    "catalogo_alvo_id",
    "alvo_nome",
    "alvo_tipo",
    "descricao",
    "prioridade",
    "ativo",
  ],
  source: [
    "fonte_titulo",
    "fonte_url",
    "fonte_tipo",
    "idioma_original",
    "pais_origem",
    "resumo_evidencia",
    "nivel_confianca",
    "data_consulta",
    "observacoes",
  ],
} as const;
export type ProductRelationKind = keyof typeof PRODUCT_RELATION_FIELDS;
export interface ProductRelation {
  kind: ProductRelationKind;
  id: string | null;
  /** Exact observed row: canonical recommendations have no updated_at column. */
  expected: Record<string, unknown> | null;
  fields: Record<string, unknown>;
}
export function parseProductRelationRow(
  row: unknown,
  kind: ProductRelationKind,
  productId: string,
) {
  const base = {
    id: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
  };
  const schema =
    kind === "source"
      ? z.object({
          ...base,
          entidade_tipo: z.literal("produto"),
          entidade_id: z.literal(productId),
          updated_at: z.string().datetime({ offset: true }),
          fonte_titulo: z.string(),
          fonte_url: nullableText,
          fonte_tipo: z.enum(SOURCE_TYPES),
          nivel_confianca: z.enum(CONFIDENCE_LEVELS),
          idioma_original: nullableText,
          pais_origem: nullableText,
          resumo_evidencia: nullableText,
          data_consulta: nullableText,
          observacoes: nullableText,
        })
      : kind === "target"
        ? z.object({
            ...base,
            produto_id: z.literal(productId),
            alvo_nome: z.string(),
            alvo_tipo: z.enum(TARGET_TYPES),
            catalogo_alvo_id: nullableText,
            descricao: nullableText,
            prioridade: z.number().int().min(1).max(10),
            ativo: z.boolean(),
          })
        : z.object({
            ...base,
            produto_id: z.literal(productId),
            cultura_id: nullableText,
            cultura_nome: nullableText,
            fase_recomendada: nullableText,
            objetivo_uso: nullableText,
            dose_recomendada: nullableText,
            observacao: nullableText,
            ativo: z.boolean(),
          });
  return schema.passthrough().parse(row);
}
export function validateProductRelation(child: ProductRelation) {
  const allowed: readonly string[] = PRODUCT_RELATION_FIELDS[child.kind];
  if (Object.keys(child.fields).some((key) => !allowed.includes(key)))
    throw new Error("Campo de vínculo não permitido.");
  if (child.id && (!child.expected || child.expected.id !== child.id))
    throw new Error("Releia a versão do vínculo.");
  if (
    child.kind === "crop" &&
    (!child.fields.cultura_id || !child.fields.cultura_nome)
  )
    throw new Error("Selecione a cultura e seu nome canônico.");
  if (child.kind === "target") {
    z.object({
      alvo_nome: z.string().min(1),
      alvo_tipo: z.enum(TARGET_TYPES),
      prioridade: z.number().int().min(1).max(10),
    }).parse(child.fields);
  }
  if (child.kind === "source") {
    z.object({
      fonte_titulo: z.string().min(1),
      fonte_tipo: z.enum(SOURCE_TYPES),
      nivel_confianca: z.enum(CONFIDENCE_LEVELS),
    }).parse(child.fields);
    validateOptionalSourceUrl(child.fields.fonte_url);
  }
  return child;
}
export function stageProductRelation(
  previous: ProductRelation[],
  child: ProductRelation,
) {
  validateProductRelation(child);
  return [
    ...previous.filter(
      (row) => !(child.id && row.kind === child.kind && row.id === child.id),
    ),
    child,
  ];
}
