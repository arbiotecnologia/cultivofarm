import { z } from "zod";
import { sourceSchema, type DocumentaryEvidence, type DocumentaryIdentity } from "./documentarySuggestions";

/** Documentary content only. Economic, regulatory decisions and composition never enter inference. */
export const PRODUCT_DOCUMENTARY_FIELDS = [
  "resumo_curto", "explicacao_tecnica", "explicacao_produtor", "explicacao_b2b",
  "indicacoes_uso", "janela_aplicacao", "cuidados_aplicacao", "compatibilidade", "beneficio_combinado",
] as const;
export const productEvidenceSchema = z.array(z.object({
  field: z.enum(PRODUCT_DOCUMENTARY_FIELDS), value: z.string().min(1).max(12000),
  candidate_key: z.string().min(1).max(200),
  identity: z.object({ entity: z.literal("produto"), id: z.string().uuid(), name: z.string().min(1), manufacturer: z.string(), registration: z.string() }).passthrough(),
  sources: z.array(sourceSchema).min(1).max(20),
}).strict()).max(40);
export type ProductEvidenceHistory = { profile_id: string; profile_revision: string; evidence: DocumentaryEvidence[] };

export function parseProductEvidenceEnvelope(value: unknown, productId: string) {
  return z.object({
    product_id: z.literal(productId), profile_id: z.string().uuid().nullable(),
    profile_revision: z.string().datetime({ offset: true }).nullable(), evidence: productEvidenceSchema,
    history: z.object({
      profile_id: z.string().uuid(), profile_revision: z.string().datetime({ offset: true }),
      evidence: productEvidenceSchema,
    }).strict().nullable().optional(),
  }).strict().superRefine((row, ctx) => {
    if ((row.profile_id === null) !== (row.profile_revision === null) || row.evidence.some(e => e.identity.id !== productId)) {
      ctx.addIssue({ code: "custom", message: "Versão ou produto da evidência divergente" });
    }
    if (row.history && (row.history.profile_id !== row.profile_id || !row.profile_revision ||
      Date.parse(row.history.profile_revision) >= Date.parse(row.profile_revision) ||
      row.history.evidence.some(e => e.identity.id !== productId))) {
      ctx.addIssue({ code: "custom", message: "Histórico da evidência divergente" });
    }
  }).parse(value) as { product_id: string; profile_id: string | null; profile_revision: string | null; evidence: DocumentaryEvidence[]; history?: ProductEvidenceHistory | null };
}

export function matchingProductEvidence(evidence: DocumentaryEvidence[], values: Record<string, unknown>, id: string) {
  return productEvidenceSchema.parse(evidence.filter(e => e.value === values[e.field] && e.identity.id === id));
}

export function productResearchIdentity(product: {
  id: string; nome: string; funcao_completa?: string | null;
}, dossier?: { mapa_manufacturer?: string | null; mapa_registration_number?: string | null; strain_name?: string | null } | null): DocumentaryIdentity {
  return {
    entity: "produto", id: product.id, name: product.nome,
    manufacturer: dossier?.mapa_manufacturer ?? "", registration: dossier?.mapa_registration_number ?? "",
    strain: dossier?.strain_name ?? "", purpose: product.funcao_completa ?? "", researchScope: "product_strain",
  };
}