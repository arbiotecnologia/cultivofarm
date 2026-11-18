import { z } from "zod";
import { sourceSchema, type DocumentaryEvidence, type DocumentaryIdentity } from "./documentarySuggestions";

/** Documentary content only. Economic, regulatory decisions and composition never enter inference. */
export const PRODUCT_DOCUMENTARY_FIELDS = [
  "resumo_curto", "explicacao_tecnica", "explicacao_produtor", "explicacao_b2b",
  "indicacoes_uso", "janela_aplicacao", "cuidados_aplicacao", "compatibilidade", "beneficio_combinado",
] as const;
export const productEvidenceSchema = z.array(z.object({
  field: z.enum(PRODUCT_DOCUMENTARY_FIELDS), value: z.string().min(1).max(12000),
  identity: z.object({ entity: z.literal("produto"), id: z.string().uuid(), name: z.string().min(1), manufacturer: z.string(), registration: z.string() }).passthrough(),
  sources: z.array(sourceSchema).min(1).max(20),
}).strict()).max(40);

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