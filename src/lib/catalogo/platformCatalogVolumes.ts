import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * Apresentações/volumes GLOBAIS (Platform Superadmin).
 * Pontes para RPCs candidatas NÃO aplicadas (`proposed-platform-global-volumes-admin.sql`); falham fechadas enquanto ausentes.
 * Decimais trafegam SOMENTE como string (sem float JS). Moeda fixa BRL; vínculo pai, ativo e derivados nunca no payload.
 */
export type VolumeItemTipo = "produto" | "microrganismo";
export const VOLUME_PAGE_LIMIT = 20;
export const VOLUME_ML_RE = /^\d{1,7}(\.\d{1,3})?$/;
export const PRECO_RE = /^\d{1,9}(\.\d{1,2})?$/;

/** Normaliza texto digitado (vírgula decimal) e valida contra os mesmos limites do SQL. Retorna null se inválido. */
export function parseDecimalText(raw: string, kind: "volume" | "preco"): string | null {
  const t = raw.trim().replace(",", ".");
  if (!(kind === "volume" ? VOLUME_ML_RE : PRECO_RE).test(t)) return null;
  const [int, frac = ""] = t.split(".");
  const intN = int.replace(/^0+(?=\d)/, "");
  const fracN = frac.replace(/0+$/, "");
  if (/^0*$/.test(intN) && fracN === "") return null; // > 0
  if (kind === "volume" && (intN.length > 7 || (intN.length === 7 && (intN !== "1000000" || fracN !== "")))) return null;
  return fracN ? `${intN}.${fracN}` : intN;
}

const dec = z.string().regex(/^\d+(\.\d+)?$/);
const version = z.string().datetime({ offset: true });
export const volumeRowSchema = z.object({
  id: z.string().uuid(), item_tipo: z.enum(["produto", "microrganismo"]), item_id: z.string().uuid(),
  volume_ml: dec, rotulo: z.string().nullable(), preco_brl: dec, moeda: z.literal("BRL"), ativo: z.boolean(),
  ordem: z.number().int(), preco_litro_brl: dec.nullable(), valor_dose_100ml_brl: dec.nullable(), doses_por_volume: dec.nullable(),
  updated_at: version,
}).strict();
export type VolumeRow = z.infer<typeof volumeRowSchema>;
const money = z.union([z.number(), z.string()]).nullable();
const pricingSchema = z.object({ valor_litro_brl: money, valor_dose_brl: money, valor_ha_brl: money }).strict();
export type ParentPricing = z.infer<typeof pricingSchema>;
export const volumePageSchema = z.object({
  item: z.object({ tipo: z.enum(["produto", "microrganismo"]), id: z.string().uuid(), nome: z.string(), codigo: z.string().nullable(),
    ativo: z.boolean(), pricing: pricingSchema }).strict(),
  items: z.array(volumeRowSchema).max(VOLUME_PAGE_LIMIT), has_more: z.boolean(),
}).strict();
export type VolumePage = z.infer<typeof volumePageSchema>;
const receiptSchema = z.object({ id: z.string().uuid(), item_tipo: z.enum(["produto", "microrganismo"]), item_id: z.string().uuid(),
  ativo: z.boolean(), updated_at: version, repriced: z.boolean(), idempotency_key: z.string().uuid(), audit_id: z.string().uuid(),
  idempotent: z.boolean() }).strict();
export const reasonSchema = z.string().trim().min(10).max(500);

export interface VolumeValues { volume_ml: string; preco_brl: string; rotulo: string | null; ordem: number }
const valuesSchema = z.object({ volume_ml: dec, preco_brl: dec, rotulo: z.string().trim().max(60).nullable(),
  ordem: z.number().int().min(0).max(9999) }).strict();

/** Erro de confirmação com projeção antes/depois do pai, devolvida pelo servidor (nada persistiu). */
export class VolumeConfirmationRequired extends Error {
  constructor(public repriced: boolean, public before: ParentPricing | null, public after: ParentPricing | null) {
    super("Esta alteração afeta uma apresentação ativa ou o preço do item. Confira e confirme explicitamente.");
  }
}

type Rpc = (name: string, args: Record<string, unknown>) => { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
const rpc = () => supabase.rpc.bind(supabase) as unknown as Rpc;

export function volumeError(error: unknown): Error {
  const e = (typeof error === "object" && error !== null ? error : {}) as { code?: string; message?: string; details?: string };
  if (e.code === "55000" && e.message === "catalog_volume_confirmation_required") {
    try {
      const d = JSON.parse(e.details ?? "") as { repriced?: unknown; parent_before?: unknown; parent_after?: unknown };
      const b = pricingSchema.safeParse(d.parent_before); const a = pricingSchema.safeParse(d.parent_after);
      return new VolumeConfirmationRequired(d.repriced === true, b.success ? b.data : null, a.success ? a.data : null);
    } catch { return new VolumeConfirmationRequired(false, null, null); }
  }
  if (e.code === "40001") return new Error("A apresentação ou o item mudou, ou a solicitação já foi usada. Reabra para conferir.");
  if (e.code === "42501") return new Error("Sem permissão para alterar apresentações globais.");
  if (e.code === "23505") return new Error("Já existe uma apresentação ativa com este volume para o item.");
  return new Error("Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.");
}

export async function readVolumePage(tipo: VolumeItemTipo, itemId: string, offset: number, signal: AbortSignal): Promise<VolumePage> {
  const { data, error } = await rpc()("platform_read_global_item_volumes", { p_item_tipo: tipo, p_item_id: itemId,
    p_limit: VOLUME_PAGE_LIMIT, p_offset: offset }).abortSignal(signal);
  const parsed = volumePageSchema.safeParse(data);
  if (signal.aborted || error || !parsed.success || parsed.data.item.id !== itemId || parsed.data.item.tipo !== tipo
    || parsed.data.items.some((v) => v.item_id !== itemId || v.item_tipo !== tipo)) {
    throw new Error("Não foi possível consultar as apresentações.");
  }
  return parsed.data;
}

function confirmReceipt(data: unknown, key: string, check: (r: z.infer<typeof receiptSchema>) => boolean) {
  const r = receiptSchema.safeParse(data);
  if (!r.success || r.data.idempotency_key !== key || !check(r.data)) throw volumeError(null);
  return r.data;
}

export async function createVolume(tipo: VolumeItemTipo, itemId: string, values: VolumeValues, reason: string, key: string, signal: AbortSignal) {
  const body = valuesSchema.parse(values);
  const { data, error } = await rpc()("platform_create_global_volume", { p_item_tipo: tipo, p_item_id: itemId, p_payload: body,
    p_reason: reasonSchema.parse(reason), p_idempotency_key: key }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw volumeError(error);
  // Nasce inativa e nunca reprecifica o pai.
  return confirmReceipt(data, key, (r) => r.ativo === false && r.repriced === false && r.item_id === itemId && r.item_tipo === tipo);
}

export function volumePatch(row: VolumeRow, values: VolumeValues) {
  const patch: Partial<VolumeValues> = {};
  if (values.volume_ml !== row.volume_ml) patch.volume_ml = values.volume_ml;
  if (values.preco_brl !== row.preco_brl) patch.preco_brl = values.preco_brl;
  if ((values.rotulo ?? null) !== (row.rotulo ?? null)) patch.rotulo = values.rotulo;
  if (values.ordem !== row.ordem) patch.ordem = values.ordem;
  return patch;
}

export async function updateVolume(row: VolumeRow, values: VolumeValues, confirm: boolean, reason: string, key: string, signal: AbortSignal) {
  valuesSchema.parse(values);
  const patch = volumePatch(row, values);
  if (Object.keys(patch).length === 0) throw new Error("Nenhuma alteração para salvar.");
  const { data, error } = await rpc()("platform_update_global_volume", { p_id: row.id, p_expected_updated_at: row.updated_at, p_patch: patch,
    p_confirm: confirm, p_reason: reasonSchema.parse(reason), p_idempotency_key: key }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw volumeError(error);
  return confirmReceipt(data, key, (r) => r.id === row.id && r.ativo === row.ativo && r.updated_at !== row.updated_at);
}

export async function setVolumeStatus(row: VolumeRow, ativo: boolean, confirm: boolean, reason: string, key: string, signal: AbortSignal) {
  const { data, error } = await rpc()("platform_set_global_volume_status", { p_id: row.id, p_expected_updated_at: row.updated_at, p_ativo: ativo,
    p_confirm: confirm, p_reason: reasonSchema.parse(reason), p_idempotency_key: key }).abortSignal(signal);
  if (signal.aborted) throw new Error("Solicitação encerrada.");
  if (error) throw volumeError(error);
  return confirmReceipt(data, key, (r) => r.id === row.id && r.ativo === ativo && r.updated_at !== row.updated_at);
}

/** Exibe decimal-string em BRL sem converter para float além da formatação. */
export function fmtBrl(v: string | number | null | undefined) {
  if (v == null || v === "") return "—";
  const [i, f = ""] = String(v).split(".");
  return `R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(f + "00").slice(0, Math.max(2, f.length))}`;
}
