import { FinanceReconciliationCandidate } from "./FinanceReconciliationCandidate";
import { HOMOLOG_REF, type ReconciliationTitle } from "./reconciliationContract";

/** Copy-only integration slot: parent supplies its already scoped canonical reader.
 * No client, endpoint, writer or permission is introduced by this composition.
 */
export function HomologFinanceSlot({ targetRef, organizationId, scopeKey, orderId, serverCapability, readTitle }: {
  targetRef: string; organizationId: string; scopeKey: string; orderId: string;
  serverCapability: { available: boolean; order_id: string; organization_id: string } | null;
  readTitle: (invoiceId: string) => Promise<ReconciliationTitle | null>;
}) {
  if (targetRef !== HOMOLOG_REF || !serverCapability?.available ||
      serverCapability.order_id !== orderId || serverCapability.organization_id !== organizationId) return null;
  return <FinanceReconciliationCandidate key={`${scopeKey}:${orderId}`} targetRef={targetRef}
    organizationId={organizationId} scopeKey={scopeKey} readTitle={async invoiceId => {
      const title = await readTitle(invoiceId);
      return title?.orderId === orderId ? title : null;
    }} />;
}