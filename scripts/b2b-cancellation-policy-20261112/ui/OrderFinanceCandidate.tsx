import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DetalhePedidoDrawer } from "@/components/pedidos-b2b/DetalhePedidoDrawer";
import { CancelResidualCandidate } from "./CancelResidualCandidate";

type Capability = { available: true; order_id: string; version: number; residual_amount: number };
function parse(data: unknown, orderId: string): Capability | null {
  if (!data || typeof data !== "object") return null;
  const c = data as Record<string, unknown>;
  return c.available === true && c.order_id === orderId && typeof c.version === "number" && Number.isInteger(c.version) && c.version > 0 && typeof c.residual_amount === "number" && Number.isFinite(c.residual_amount) && c.residual_amount > 0
    ? c as Capability : null;
}
export function OrderFinanceCandidate({ orderId, scopeKey, onConfirmed }: { orderId: string; scopeKey: string; onConfirmed: () => void }) {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setCapability(null);
    void supabase.rpc("rpc_b2b_cancel_residual_capability_v1" as never, { p_order: orderId } as never).then(({ data, error }) => {
      if (active) setCapability(error ? null : parse(data, orderId));
    }, () => { if (active) setCapability(null); });
    return () => { active = false; };
  }, [orderId, scopeKey, revision]);
  if (!capability) return null;
  return <section aria-label="Financeiro" className="border-t pt-4">
    <h2 className="text-lg font-semibold mb-3">Financeiro</h2>
    <CancelResidualCandidate orderId={orderId} scopeKey={scopeKey} available observedVersion={capability.version} residualAmount={capability.residual_amount} onConfirmed={() => { setCapability(null); setRevision(x => x + 1); onConfirmed(); }} />
  </section>;
}
/** Inactive caller patch: canonical detail's existing extra slot, no operational source edits. */
export function OrderDetailCandidate({ orderId, scopeKey, open, onOpenChange, onConfirmed, empresaNome }: { orderId: string; scopeKey: string; open: boolean; onOpenChange: (open: boolean) => void; onConfirmed: () => void; empresaNome: string | null }) {
  return <DetalhePedidoDrawer orderId={orderId} open={open} onOpenChange={onOpenChange} viewerScope="comercial" empresaNome={empresaNome}
    extra={open ? <OrderFinanceCandidate key={`${scopeKey}:${orderId}`} orderId={orderId} scopeKey={scopeKey} onConfirmed={onConfirmed} /> : null} />;
}