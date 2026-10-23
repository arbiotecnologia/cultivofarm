import { z } from "zod";
const amount = z.number().finite().nonnegative();
const installment = z.object({ id:z.string().uuid(), numero:z.number().int(), vencimento:z.string().nullable(), valor:amount, recebido:amount, status:z.string() }).strict();
const title = z.object({ id:z.string().uuid(),order_id:z.string().uuid(),numero:z.string(),created_at:z.string().datetime({offset:true}),total:amount,status:z.string(),installments:z.array(installment) }).strict();
const schema = z.object({ contract:z.literal("C2_OWN_OBLIGATIONS_V1"),partner_id:z.string().uuid(),rows:z.array(title).max(50),limit:z.literal(50),documents_enabled:z.literal(false) }).strict();
export function parseOwnFinance(data:unknown, partnerId:string) {
  const parsed=schema.safeParse(data);
  if(!parsed.success || parsed.data.partner_id!==partnerId) throw new Error("own_finance_unavailable");
  return parsed.data;
}