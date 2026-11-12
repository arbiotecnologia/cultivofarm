export const HOMOLOG_REF = "vrlcdwmlytukrjezrrnf";
export type ReconciliationTitle = {
  invoiceId: string; titleId: string; orderId: string; organizationId: string;
  invoiceStatus: string; titleStatus: string; reconciliationStatus: string;
  installments: { id: string; dueDate: string; amount: number; received: number; status: string }[];
};
export function validTitle(value: ReconciliationTitle | null, invoiceId: string, organizationId: string): value is ReconciliationTitle {
  return !!value && value.invoiceId === invoiceId && value.organizationId === organizationId &&
    !!value.titleId && !!value.orderId && value.installments.length > 0 &&
    new Set(value.installments.map(x => x.id)).size === value.installments.length &&
    value.installments.every(x => !!x.id && Number.isFinite(x.amount) && x.amount >= 0 && Number.isFinite(x.received) && x.received >= 0);
}