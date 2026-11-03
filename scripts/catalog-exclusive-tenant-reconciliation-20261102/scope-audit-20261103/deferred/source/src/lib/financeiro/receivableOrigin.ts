import type { ReceivableMoney } from './receivableMoney';
import { additionalInterest } from './receivableMoney';
export const MONEY_ORIGIN_MESSAGE = 'Origem monetária não comprovada. Recebimento bloqueado.';
export interface ProvenReceivable extends ReceivableMoney {
  id: string; receivable_id: string; original_amount: number;
  monetary_origin: { contract: 'RECEIVABLE_MONEY_V1'; installment_id: string; receivable_id: string; source: 'price_snapshot_v1' | 'b2b_immutable_schedule_v1' | 'b2b_document_allocation_v1'; organization_id?: string; order_id?: string; schedule_id?: string; document_id?: string; snapshot_principal: number; snapshot_interest: number };
}
/** Only adopt the canonical read envelope, not arbitrary properties from a table or UI draft. */
export function requireReceivableOrigin(value: unknown): ProvenReceivable {
  const p = value as ProvenReceivable | null;
  const o = p?.monetary_origin;
  if (!p || !o || o.contract !== 'RECEIVABLE_MONEY_V1' || !['price_snapshot_v1','b2b_immutable_schedule_v1','b2b_document_allocation_v1'].includes(o.source) || typeof p.id !== 'string' || !p.id.trim() || typeof p.receivable_id !== 'string' || !p.receivable_id.trim() || o.installment_id !== p.id || o.receivable_id !== p.receivable_id || p.monetary_semantics !== 'financed_total_v1' || !Number.isFinite(o.snapshot_principal) || !Number.isFinite(o.snapshot_interest) || o.snapshot_principal < 0 || o.snapshot_interest < 0 || Math.round((o.snapshot_principal + o.snapshot_interest)*100) !== Math.round(p.original_amount*100) || p.financed_interest_amount !== o.snapshot_interest) throw new Error(MONEY_ORIGIN_MESSAGE);
  if (o.source !== 'price_snapshot_v1') {
    const tenant = (p as ProvenReceivable & { organization_id?: unknown }).organization_id;
    const root = o.source === 'b2b_immutable_schedule_v1' ? o.schedule_id : o.document_id;
    if (typeof o.organization_id !== 'string' || !o.organization_id.trim() || tenant !== o.organization_id || typeof o.order_id !== 'string' || !o.order_id.trim() || typeof root !== 'string' || !root.trim()) throw new Error(MONEY_ORIGIN_MESSAGE);
  }
  if (!Number.isFinite(p.original_amount) || p.original_amount < 0) throw new Error(MONEY_ORIGIN_MESSAGE);
  additionalInterest(p);
  return p;
}
export async function readProvenReceivables(client: { rpc: (name: any, args: any) => PromiseLike<{data: unknown; error: unknown}> }, titleId: string | null, offset = 0, limit = 1000) {
  const { data, error } = await client.rpc('rpc_receivable_money_projection_v1', {p_receivable_id:titleId,p_offset:offset,p_limit:limit});
  if (error || !Array.isArray(data)) throw new Error(MONEY_ORIGIN_MESSAGE);
  const ids = new Set<string>();
  return data.map(value => {
    const row = requireReceivableOrigin(value);
    // Internal envelope consistency does not prove it answers the requested title.
    // null is the server-scoped KPI mode, never a client authorization bypass.
    if ((titleId !== null && row.receivable_id !== titleId) || ids.has(row.id)) throw new Error(MONEY_ORIGIN_MESSAGE);
    ids.add(row.id);
    return row;
  });
}