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
  identity: z.object({
    entity: z.literal("produto"), id: z.string().uuid(), name: z.string().min(1).max(1000),
    manufacturer: z.string().max(1000), registration: z.string().max(1000),
    scientificName: z.string().max(2000).optional(), strain: z.string().max(2000).optional(),
    purpose: z.string().max(2000).optional(), synonyms: z.string().max(2000).optional(),
    concentration: z.string().max(2000).optional(), presentation: z.string().max(2000).optional(),
    researchScope: z.enum(["species", "product_strain"]).optional(),
  }).strict(),
  sources: z.array(sourceSchema).min(1).max(20),
}).strict()).max(40);
export type ProductEvidenceHistory = { profile_id: string; profile_revision: string; evidence: DocumentaryEvidence[] };

/** Compare UTC whole seconds first, then exact decimal fractions; never let
 * Date's millisecond precision erase PostgreSQL microseconds. */
function revisionInstant(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):?(\d{2}))$/.exec(value);
  if (!match || (match[4] !== undefined && (Number(match[4]) > 23 || Number(match[5]) > 59))) return null;
  const seconds = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(seconds)) return null;
  return { seconds, fraction: match[2] ?? "" };
}
const revisionSchema = z.string().datetime({ offset: true }).refine(value => revisionInstant(value) !== null, "Revisão temporal inválida");
function compareRevisions(left: string, right: string) {
  const a = revisionInstant(left), b = revisionInstant(right);
  if (!a || !b) return null;
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  const length = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(length, "0"), bf = b.fraction.padEnd(length, "0");
  return af === bf ? 0 : af < bf ? -1 : 1;
}

export function parseProductEvidenceEnvelope(value: unknown, productId: string) {
  return z.object({
    product_id: z.literal(productId), profile_id: z.string().uuid().nullable(),
    profile_revision: revisionSchema.nullable(), evidence: productEvidenceSchema,
    history: z.object({
      profile_id: z.string().uuid(), profile_revision: revisionSchema,
      evidence: productEvidenceSchema,
    }).strict().nullable().optional(),
  }).strict().superRefine((row, ctx) => {
    if ((row.profile_id === null) !== (row.profile_revision === null) || row.evidence.some(e => e.identity.id !== productId)) {
      ctx.addIssue({ code: "custom", message: "Versão ou produto da evidência divergente" });
    }
    const order = row.history && row.profile_revision ? compareRevisions(row.history.profile_revision, row.profile_revision) : null;
    if (row.history && (row.history.profile_id !== row.profile_id || !row.profile_revision || order === null ||
      order > 0 ||
      (order === 0 && JSON.stringify(row.history.evidence) === JSON.stringify(row.evidence)) ||
      row.history.evidence.some(e => e.identity.id !== productId))) {
      ctx.addIssue({ code: "custom", message: "Histórico da evidência divergente" });
    }
  }).parse(value) as { product_id: string; profile_id: string | null; profile_revision: string | null; evidence: DocumentaryEvidence[]; history?: ProductEvidenceHistory | null };
}

export function matchingProductEvidence(evidence: DocumentaryEvidence[], values: Record<string, unknown>, id: string, name: string) {
  return productEvidenceSchema.parse(evidence).filter(e => e.value === values[e.field] && e.identity.id === id && e.identity.name === name);
}

export function productResearchIdentity(product: {
  id: string; nome: string; funcao_completa?: string | null; familia_catalogo?: string | null;
}, dossier?: { mapa_manufacturer?: string | null; mapa_registration_number?: string | null; strain_name?: string | null } | null): DocumentaryIdentity {
  return {
    entity: "produto", id: product.id, name: product.nome,
    manufacturer: dossier?.mapa_manufacturer ?? "", registration: dossier?.mapa_registration_number ?? "",
    strain: product.familia_catalogo === "fertilizante_adubo" || product.familia_catalogo === "quimico" ? "" : dossier?.strain_name ?? "",
    purpose: (product.familia_catalogo === "fertilizante_adubo"
      ? `Fertilizante/adubo comercial acabado. Registro de fertilizante não equivale a registro de agrotóxico. Não inferir teores, garantias nutricionais, composição, dose, registro, preço ou aprovação. ${product.funcao_completa ?? ""}`
      : product.funcao_completa ?? "").slice(0, 2000), researchScope: "product_strain",
  };
}