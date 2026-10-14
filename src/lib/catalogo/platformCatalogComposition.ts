import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { ProductFamily } from "@/lib/catalogo/platformCatalogFamily";

/**
 * Composição de produtos GLOBAIS (Platform Superadmin). Ponte local para RPCs CANDIDATAS NÃO aplicadas
 * (`scripts/rbac-audit/proposed-platform-global-product-composition.sql`); falha fechada enquanto ausentes.
 *
 * Fonte canônica da receita biológica EXISTENTE: `formulacoes` (somente leitura aqui; editor atual preservado).
 * Declarações cobrem só o que a receita não representa: ingrediente ativo, nutriente, outro componente
 * e teor garantido de microrganismo. Nunca copia volume da receita; sem conversão UFC, kg↔L ou densidade.
 */
export const COMPOSITION_UNITS = ["mL/L", "g/L", "g/kg", "%m/m", "%m/v", "%v/v", "UFC/mL", "UFC/g"] as const;
export type CompositionUnit = (typeof COMPOSITION_UNITS)[number];
export const COMPOSITION_BASES = ["por_volume_produto", "por_massa_produto"] as const;
export type CompositionBase = (typeof COMPOSITION_BASES)[number];
export const BASE_LABEL: Record<CompositionBase, string> = {
  por_volume_produto: "Por volume do produto (L/mL)", por_massa_produto: "Por massa do produto (kg/g)",
};
/** Matriz unidade→base (espelha o servidor). Base continua escolha explícita do usuário. */
export const UNIT_BASE: Record<CompositionUnit, CompositionBase> = {
  "mL/L": "por_volume_produto", "g/L": "por_volume_produto", "%m/v": "por_volume_produto", "%v/v": "por_volume_produto",
  "UFC/mL": "por_volume_produto", "g/kg": "por_massa_produto", "%m/m": "por_massa_produto", "UFC/g": "por_massa_produto",
};
export const COMPONENT_TYPES = ["microrganismo", "ingrediente_ativo", "nutriente", "outro"] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];
export const COMPONENT_LABEL: Record<ComponentType, string> = {
  microrganismo: "Microrganismo (teor garantido)", ingrediente_ativo: "Ingrediente ativo", nutriente: "Nutriente", outro: "Outro componente",
};
export const FAMILY_COMPONENTS: Record<ProductFamily, readonly ComponentType[]> = {
  biologico: ["microrganismo", "outro"], quimico: ["ingrediente_ativo", "outro"], fertilizante_adubo: ["nutriente", "outro"],
};
export const NATUREZAS = ["teor_garantido", "concentracao_declarada"] as const;
export type Natureza = (typeof NATUREZAS)[number];
export const NATUREZA_LABEL: Record<Natureza, string> = { teor_garantido: "Teor garantido", concentracao_declarada: "Concentração declarada" };
export const COMPOSITION_MAX_ITEMS = 50;
export const PERCENT_UNITS: readonly CompositionUnit[] = ["%m/m", "%m/v", "%v/v"];
export const UFC_UNITS: readonly CompositionUnit[] = ["UFC/mL", "UFC/g"];

export interface DeclarationDraft {
  tipo_componente: ComponentType; microrganismo_id: string | null; componente_nome: string | null;
  quantidade: number | null; unidade: CompositionUnit | null; base: CompositionBase | null; natureza: Natureza;
}
export type CompositionStatus = "rascunho" | "completo";

/** Limite de magnitude por unidade (mesmos valores do servidor). */
export function maxQuantity(unit: CompositionUnit) {
  if (PERCENT_UNITS.includes(unit)) return 100;
  if (UFC_UNITS.includes(unit)) return 1e15;
  return 1000;
}
function decimals(n: number) { const s = String(n); return s.includes("e-") ? 99 : (s.split(".")[1]?.length ?? 0); }

/**
 * Validação local (o servidor revalida). Retorna lista de problemas em português; vazia = válido.
 * `recipeMicroIds`: micros presentes na receita; `recipeMicroWithConcentration`: os que já têm concentração na receita.
 */
export function validateDeclarations(family: ProductFamily | null, status: CompositionStatus, items: DeclarationDraft[],
  recipeMicroWithConcentration: ReadonlySet<string> = new Set()): string[] {
  const problems: string[] = [];
  if (family === null) return ["Classifique a família do produto antes de declarar composição."];
  if (items.length > COMPOSITION_MAX_ITEMS) problems.push(`No máximo ${COMPOSITION_MAX_ITEMS} componentes.`);
  if (status === "completo" && items.length === 0) problems.push("Composição completa exige ao menos um componente.");
  const micros = new Set<string>(); const names = new Set<string>();
  items.forEach((it, i) => {
    const n = `Linha ${i + 1}`;
    if (!FAMILY_COMPONENTS[family].includes(it.tipo_componente)) problems.push(`${n}: tipo de componente não pertence à família.`);
    if (it.tipo_componente === "microrganismo") {
      if (!it.microrganismo_id) problems.push(`${n}: selecione um microrganismo do catálogo.`);
      else if (micros.has(it.microrganismo_id)) problems.push(`${n}: microrganismo repetido.`);
      else micros.add(it.microrganismo_id);
      if (it.componente_nome) problems.push(`${n}: microrganismo não aceita nome livre.`);
      if (it.unidade && !UFC_UNITS.includes(it.unidade)) problems.push(`${n}: teor de microrganismo só em UFC/mL ou UFC/g (volume fica na receita).`);
      if (it.natureza !== "teor_garantido") problems.push(`${n}: microrganismo aceita somente teor garantido.`);
      if (it.microrganismo_id && recipeMicroWithConcentration.has(it.microrganismo_id))
        problems.push(`${n}: a receita já informa a concentração deste microrganismo; não duplique a mesma medida.`);
    } else {
      const name = it.componente_nome?.trim() ?? "";
      if (it.microrganismo_id) problems.push(`${n}: apenas microrganismos usam o catálogo de microrganismos.`);
      if (name.length < 2 || name.length > 160) problems.push(`${n}: informe o nome do componente (2 a 160 caracteres).`);
      else if (names.has(`${it.tipo_componente}|${name.toLowerCase()}`)) problems.push(`${n}: componente repetido.`);
      else names.add(`${it.tipo_componente}|${name.toLowerCase()}`);
      if (it.unidade && UFC_UNITS.includes(it.unidade)) problems.push(`${n}: UFC só se aplica a microrganismos.`);
    }
    const filled = [it.quantidade !== null, it.unidade !== null, it.base !== null];
    if (filled.some(Boolean) && !filled.every(Boolean)) problems.push(`${n}: quantidade, unidade e base vão juntas.`);
    if (status === "completo" && !filled.every(Boolean)) problems.push(`${n}: composição completa exige quantidade, unidade e base.`);
    if (it.quantidade !== null) {
      if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) problems.push(`${n}: quantidade deve ser positiva.`);
      else if (decimals(it.quantidade) > 6) problems.push(`${n}: no máximo 6 casas decimais.`);
      else if (it.unidade && it.quantidade > maxQuantity(it.unidade)) problems.push(`${n}: quantidade acima do limite para ${it.unidade}.`);
    }
    if (it.unidade && it.base && UNIT_BASE[it.unidade] !== it.base) problems.push(`${n}: base incompatível com a unidade.`);
  });
  return problems;
}

const version = z.string().datetime({ offset: true });
const num = z.union([z.number(), z.string()]).nullable();
export const recipeRowSchema = z.object({
  formulacao_id: z.string().uuid(), microrganismo_id: z.string().uuid(), micro_nome: z.string(), micro_ativo: z.boolean(),
  component_insumo_id: z.string().uuid().nullable(), insumo_nome: z.string().nullable(), volume_ml: num, proporcao: num,
  concentracao: num, unidade: z.string().nullable(), e_volume_fixo: z.boolean().nullable(),
}).strict();
export const declarationRowSchema = z.object({
  id: z.string().uuid(), ordem: z.number().int(), tipo_componente: z.enum(COMPONENT_TYPES), microrganismo_id: z.string().uuid().nullable(),
  micro_nome: z.string().nullable(), micro_ativo: z.boolean().nullable(), componente_nome: z.string().nullable(), quantidade: num,
  unidade: z.enum(COMPOSITION_UNITS).nullable(), base: z.enum(COMPOSITION_BASES).nullable(), natureza: z.enum(NATUREZAS),
}).strict();
export const compositionSchema = z.object({
  produto: z.object({ id: z.string().uuid(), nome: z.string(), familia_catalogo: z.enum(["biologico", "quimico", "fertilizante_adubo"]).nullable(),
    updated_at: version }).strict(),
  conjunto: z.object({ status: z.enum(["rascunho", "completo"]), updated_at: version }).strict().nullable(),
  receita: z.array(recipeRowSchema).max(50), declaracoes: z.array(declarationRowSchema).max(50),
  receita_has_more: z.boolean(), declaracoes_has_more: z.boolean(),
}).strict();
export type Composition = z.infer<typeof compositionSchema>;
export const compositionReceiptSchema = z.object({
  produto_id: z.string().uuid(), status: z.enum(["rascunho", "completo"]), itens: z.number().int().min(0).max(50),
  updated_at: version, idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean(),
}).strict();
export const compositionReasonSchema = z.string().trim().min(10).max(500);

type Rpc = (name: "platform_read_global_product_composition" | "platform_set_global_product_composition", args: Record<string, unknown>) =>
  { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const rpc = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export function compositionError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "40001") return "O produto mudou ou esta solicitação já foi usada. Reabra para conferir os dados.";
  if (code === "42501") return "Sem permissão para editar o catálogo global.";
  if (code === "23514" || code === "22023") return "O servidor recusou a composição. Confira unidades, bases e duplicidades.";
  return "Não foi possível confirmar a composição. Confira os dados antes de tentar novamente.";
}

/** Leitor unificado: receita (origem `formulacoes`) + declarações, com origem explícita. Sem SELECT direto. */
export async function readComposition(id: string, signal: AbortSignal): Promise<Composition> {
  const { data, error } = await rpc()("platform_read_global_product_composition", { p_produto_id: id, p_limit: 50, p_offset: 0 }).abortSignal(signal);
  const parsed = compositionSchema.safeParse(data);
  if (signal.aborted || error || !parsed.success || parsed.data.produto.id !== id) throw new Error("Não foi possível consultar a composição.");
  return parsed.data;
}

export function toPayload(items: DeclarationDraft[]) {
  return items.map((it, i) => ({
    ordem: i + 1, tipo_componente: it.tipo_componente,
    microrganismo_id: it.tipo_componente === "microrganismo" ? it.microrganismo_id : null,
    componente_nome: it.tipo_componente === "microrganismo" ? null : (it.componente_nome?.trim() || null),
    quantidade: it.quantidade, unidade: it.unidade, base: it.base, natureza: it.natureza,
  }));
}

export async function setComposition(target: Composition, status: CompositionStatus, items: DeclarationDraft[],
  reason: string, key: string, signal: AbortSignal) {
  const withConc = new Set(target.receita.filter((r) => r.concentracao !== null).map((r) => r.microrganismo_id));
  const problems = validateDeclarations(target.produto.familia_catalogo, status, items, withConc);
  if (problems.length) throw new Error(problems[0]);
  const cleanReason = compositionReasonSchema.parse(reason);
  const { data, error } = await rpc()("platform_set_global_product_composition", {
    p_produto_id: target.produto.id, p_expected_updated_at: target.produto.updated_at, p_status: status,
    p_itens: toPayload(items), p_reason: cleanReason, p_idempotency_key: key,
  }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(compositionError(error));
  const receipt = compositionReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.produto_id !== target.produto.id || receipt.data.idempotency_key !== key
    || receipt.data.status !== status || receipt.data.itens !== items.length || receipt.data.updated_at === target.produto.updated_at)
    throw new Error(compositionError(null));
  return receipt.data;
}

/** Converte a declaração lida em rascunho editável (sem alterar valores). */
export function toDraft(row: z.infer<typeof declarationRowSchema>): DeclarationDraft {
  return { tipo_componente: row.tipo_componente, microrganismo_id: row.microrganismo_id, componente_nome: row.componente_nome,
    quantidade: row.quantidade === null ? null : Number(row.quantidade), unidade: row.unidade, base: row.base, natureza: row.natureza };
}
