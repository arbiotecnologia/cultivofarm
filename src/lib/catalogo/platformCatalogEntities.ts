import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gestão GLOBAL de microrganismos e culturas (Platform Superadmin).
 * Pontes locais para RPCs candidatas NÃO aplicadas (`proposed-platform-global-micro-cultura-admin.sql`);
 * falham fechadas enquanto ausentes. Sem preço, dose, B2B, código, produto ou tenant no payload.
 */
export type EntityKind = "micro" | "cultura";
export const microTypes = ["bacteria", "fungo", "levedura", "consorcio"] as const;

type FieldKind = "text" | "longtext" | "number" | "boolean" | "tipo";
export interface EntityField { name: string; label: string; kind: FieldKind; max?: number; required?: boolean; createOnly?: boolean }

export const entityFields: Record<EntityKind, EntityField[]> = {
  micro: [
    { name: "nome", label: "Nome", kind: "text", max: 200, required: true },
    { name: "tipo", label: "Tipo", kind: "tipo", required: true, createOnly: true },
    { name: "nome_cientifico", label: "Nome científico", kind: "text", max: 300 },
    { name: "concentracao_ufc_ml", label: "Concentração (UFC/mL)", kind: "number" },
    { name: "concentracao_label", label: "Rótulo da concentração", kind: "text", max: 120 },
    { name: "fornecedor", label: "Fornecedor", kind: "text", max: 200 },
    { name: "producao_on_farm", label: "Produção on farm", kind: "boolean", required: true },
    { name: "meio_cultivo", label: "Meio de cultivo", kind: "longtext", max: 5000 },
    { name: "funcao_agronomica", label: "Função agronômica", kind: "longtext", max: 5000 },
    { name: "observacoes", label: "Observações", kind: "longtext", max: 5000 },
    { name: "descricao", label: "Descrição", kind: "longtext", max: 5000 },
  ],
  cultura: [
    { name: "nome", label: "Nome", kind: "text", max: 120, required: true },
    { name: "descricao", label: "Descrição", kind: "longtext", max: 2000 },
  ],
};

const text = (max: number) => z.string().max(max).nullable();
const ufc = z.number().finite().positive().max(1e18).nullable();
export const microValuesSchema = z.object({
  nome: z.string().trim().min(1).max(200), tipo: z.enum(microTypes), nome_cientifico: text(300),
  concentracao_ufc_ml: ufc, concentracao_label: text(120), fornecedor: text(200), producao_on_farm: z.boolean().nullable(),
  meio_cultivo: text(5000), funcao_agronomica: text(5000), observacoes: text(5000), descricao: text(5000),
}).strict();
export const cultureValuesSchema = z.object({ nome: z.string().trim().min(1).max(120), descricao: text(2000) }).strict();
export const valuesSchema = { micro: microValuesSchema, cultura: cultureValuesSchema } as const;
export type EntityValues = Record<string, string | number | boolean | null>;

const version = z.string().datetime({ offset: true });
export const microDetailSchema = microValuesSchema.extend({
  id: z.string().uuid(), codigo: z.string().nullable(), ativo: z.boolean(), updated_at: version,
}).strict();
export const cultureDetailSchema = cultureValuesSchema.extend({ id: z.string().uuid(), ativo: z.boolean(), updated_at: version }).strict();
export type EntityDetail = { id: string; ativo: boolean; updated_at: string } & EntityValues;

export const ENTITY_PAGE_LIMIT = 20;
const listItem = z.object({ id: z.string().uuid(), nome: z.string(), ativo: z.boolean(), codigo: z.string().nullable().optional() }).strict();
export const entityPageSchema = z.object({ items: z.array(listItem).max(ENTITY_PAGE_LIMIT), has_more: z.boolean() }).strict();
export type EntityPage = z.infer<typeof entityPageSchema>;

const receiptSchema = z.object({ id: z.string().uuid(), ativo: z.boolean(), updated_at: version, codigo: z.string().min(1).optional(),
  idempotency_key: z.string().uuid(), audit_id: z.string().uuid(), idempotent: z.boolean() }).strict();
export const reasonSchema = z.string().trim().min(10).max(500);

const rpcNames = {
  micro: { list: "platform_read_global_microorganisms", detail: "platform_read_global_microorganism_detail",
    create: "platform_create_global_microorganism", update: "platform_update_global_microorganism", status: "platform_set_global_microorganism_status" },
  cultura: { list: "platform_read_global_cultures", detail: "platform_read_global_culture_detail",
    create: "platform_create_global_culture", update: "platform_update_global_culture", status: "platform_set_global_culture_status" },
} as const;
type Rpc = (name: string, args: Record<string, unknown>) => { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const rpc = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export function entityError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "40001") return "O item mudou ou esta solicitação já foi usada. Reabra para conferir os dados.";
  if (code === "42501") return "Sem permissão para alterar o catálogo global.";
  if (code === "23505") return "Já existe um item com este nome.";
  return "Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.";
}

export async function readEntityPage(kind: EntityKind, search: string, offset: number, signal: AbortSignal): Promise<EntityPage> {
  const args: Record<string, unknown> = { p_search: search.trim().slice(0, 120), p_limit: ENTITY_PAGE_LIMIT, p_offset: offset };
  if (kind === "micro") args.p_only_active = false;
  const { data, error } = await rpc()(rpcNames[kind].list, args).abortSignal(signal);
  const parsed = entityPageSchema.safeParse(data);
  if (signal.aborted || error || !parsed.success) throw new Error("Não foi possível consultar o catálogo global.");
  return parsed.data;
}

export async function readEntityDetail(kind: EntityKind, id: string, signal: AbortSignal): Promise<EntityDetail> {
  const { data, error } = await rpc()(rpcNames[kind].detail, { p_id: id }).abortSignal(signal);
  const parsed = (kind === "micro" ? microDetailSchema : cultureDetailSchema).safeParse(data);
  if (signal.aborted || error || !parsed.success || parsed.data.id !== id) throw new Error("Não foi possível carregar os dados do item.");
  return parsed.data as EntityDetail;
}

function confirm(data: unknown, key: string, check: (r: z.infer<typeof receiptSchema>) => boolean) {
  const receipt = receiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.idempotency_key !== key || !check(receipt.data)) throw new Error(entityError(null));
  return receipt.data;
}

export async function createEntity(kind: EntityKind, values: EntityValues, reason: string, key: string, signal: AbortSignal) {
  const body = valuesSchema[kind].parse(values);
  if (kind === "micro" && typeof (body as EntityValues).producao_on_farm !== "boolean") throw new Error("Informe se há produção on farm.");
  const { data, error } = await rpc()(rpcNames[kind].create, { p_payload: body, p_reason: reasonSchema.parse(reason), p_idempotency_key: key })
    .abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(entityError(error));
  // Item novo nasce inativo; micro exige código gerado no servidor.
  return confirm(data, key, (r) => r.ativo === false && (kind !== "micro" || !!r.codigo));
}

/** Envia apenas campos alterados da whitelist; `tipo` nunca é editável. */
export function entityPatch(kind: EntityKind, detail: EntityDetail, values: EntityValues) {
  const patch: EntityValues = {};
  for (const field of entityFields[kind]) {
    if (field.createOnly) continue;
    if (values[field.name] !== detail[field.name]) patch[field.name] = values[field.name];
  }
  return patch;
}

export async function updateEntity(kind: EntityKind, detail: EntityDetail, values: EntityValues, reason: string, key: string, signal: AbortSignal) {
  const full = valuesSchema[kind].parse(kind === "micro" ? { ...values, tipo: detail.tipo } : values);
  const patch = entityPatch(kind, detail, full);
  if (Object.keys(patch).length === 0) throw new Error("Nenhuma alteração para salvar.");
  const { data, error } = await rpc()(rpcNames[kind].update, { p_id: detail.id, p_expected_updated_at: detail.updated_at,
    p_patch: patch, p_reason: reasonSchema.parse(reason), p_idempotency_key: key }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(entityError(error));
  return confirm(data, key, (r) => r.id === detail.id && r.updated_at !== detail.updated_at);
}

export async function setEntityStatus(kind: EntityKind, detail: EntityDetail, ativo: boolean, reason: string, key: string, signal: AbortSignal) {
  const { data, error } = await rpc()(rpcNames[kind].status, { p_id: detail.id, p_expected_updated_at: detail.updated_at, p_ativo: ativo,
    p_reason: reasonSchema.parse(reason), p_idempotency_key: key }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw new Error(entityError(error));
  return confirm(data, key, (r) => r.id === detail.id && r.ativo === ativo && r.updated_at !== detail.updated_at);
}
