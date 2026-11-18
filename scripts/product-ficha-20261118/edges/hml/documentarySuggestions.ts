import { z } from "npm:zod@3.25.76";

export const DOCUMENTARY_FIELDS = ["descricao", "modo_acao", "funcao_completa", "modo_aplicacao", "resumo_curto", "explicacao_tecnica", "explicacao_produtor", "explicacao_b2b", "indicacoes_uso", "janela_aplicacao", "cuidados_aplicacao", "compatibilidade", "observacoes_regulatorias", "beneficio_combinado", "mecanismo_acao", "beneficios_agronomicos", "armazenamento"] as const;
export const sourceSchema = z.object({ url: z.string().url().refine(v => { const u = new URL(v); return v.length <= 2048 && !/[\s\\\u0000-\u001f\u007f]/.test(v) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(v) && /^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?#]|$)/.test(v) && u.protocol === "https:" && !u.username && !u.password && u.hostname !== "localhost" && !u.hostname.endsWith(".local"); }), title: z.string().min(1), excerpt: z.string().min(1) }).strict();
export const documentarySchema = z.object({
  candidates: z.array(z.object({ key: z.string().min(1), name: z.string().min(1), manufacturer: z.string().nullable(), registration: z.string().nullable(), sources: z.array(sourceSchema).min(1) }).strict()).max(8),
  suggestions: z.array(z.object({ candidate_key: z.string(), field: z.enum(DOCUMENTARY_FIELDS), value: z.string().min(1).max(12000), sources: z.array(sourceSchema).min(1) }).strict()).max(40),
}).strict().superRefine((result, context) => {
  const keys = new Set(result.candidates.map(c => c.key));
  if (keys.size !== result.candidates.length) context.addIssue({ code: "custom", message: "Identificações duplicadas" });
  const pairs = result.suggestions.map(s => `${s.candidate_key}\u0000${s.field}`);
  if (new Set(pairs).size !== pairs.length || result.suggestions.some(s => !keys.has(s.candidate_key))) context.addIssue({ code: "custom", message: "Sugestões ambíguas ou sem identificação" });
});
export type DocumentaryResult = z.infer<typeof documentarySchema>;
export type DocumentaryIdentity = { name: string; manufacturer: string; registration: string; entity: "produto" | "microrganismo"; id?: string; scientificName?: string; strain?: string; purpose?: string; synonyms?: string; concentration?: string; presentation?: string; researchScope?: "species" | "product_strain" };
export type DocumentaryEvidence = { field: string; value: string; identity: DocumentaryIdentity; sources: z.infer<typeof sourceSchema>[] };
export function selectedDocumentaryEvidence(result: DocumentaryResult, candidate: string, selected: readonly string[], allowed: readonly string[], identity: DocumentaryIdentity): DocumentaryEvidence[] {
  const values = selectedDocumentaryValues(result, candidate, selected, allowed);
  return result.suggestions.filter(s => s.candidate_key === candidate && values[s.field] === s.value).map(s => ({ field: s.field, value: s.value, identity, sources: s.sources }));
}
export function selectedDocumentaryValues(result: DocumentaryResult, candidate: string, selected: readonly string[], allowed: readonly string[]): Record<string, string> {
  if (!result.candidates.some(c => c.key === candidate)) return {};
  return Object.fromEntries(result.suggestions.filter(s => s.candidate_key === candidate && selected.includes(s.field) && allowed.includes(s.field) && s.sources.length > 0).map(s => [s.field, s.value]));
}
/** Cross-check model citations against URLs observed in native search/tool output, not invented URLs. */
export function retainVerifiedSources(result: DocumentaryResult, urls: ReadonlySet<string>): DocumentaryResult {
  const candidates = result.candidates.map(c => ({ ...c, sources: c.sources.filter(s => urls.has(s.url)) })).filter(c => c.sources.length > 0);
  const keys = new Set(candidates.map(c => c.key));
  const suggestions = result.suggestions.map(s => ({ ...s, sources: s.sources.filter(v => urls.has(v.url)) })).filter(s => keys.has(s.candidate_key) && s.sources.length > 0);
  return { candidates, suggestions };
}