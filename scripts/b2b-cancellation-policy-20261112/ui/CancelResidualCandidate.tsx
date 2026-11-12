import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Inactive integration slot for the canonical order detail. Capability must come from server, never roles alone. */
export function CancelResidualCandidate({ orderId, observedVersion, residualAmount, available, scopeKey, onConfirmed }: {
  orderId: string; observedVersion: number; residualAmount: number; available: boolean; scopeKey: string; onConfirmed: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1; setReason(""); setResult(null); setBusy(false);
    return () => { generation.current += 1; };
  }, [scopeKey, orderId, available]);
  if (!available) return null;
  const submit = async () => {
    if (lock.current || !available || !reason.trim() || residualAmount <= 0 || !Number.isInteger(observedVersion) || observedVersion <= 0) return;
    lock.current = true; setBusy(true); setResult(null); const current = generation.current;
    try {
      const { data, error } = await supabase.rpc("rpc_b2b_forecast_cancel_residual_v1" as never, {
        p_order: orderId, p_expected_version: observedVersion, p_reason: reason.trim(),
      } as never);
      if (current !== generation.current) return;
      if (error) throw error;
      const ack = data as unknown as { state?: string; forecast_id?: string; version?: number } | null;
      if (!ack?.forecast_id || !Number.isInteger(ack.version) || !["cancelado_residual", "cancelado_antes_nf"].includes(ack.state ?? "")) throw new Error("Resultado não confirmado; consulte novamente antes de repetir.");
      setResult("Saldo não faturado cancelado. Documentos, títulos e mercadoria permanecem nos respectivos fluxos."); onConfirmed();
    } catch (e) { if (current === generation.current) setResult(e instanceof Error ? e.message : "Cancelamento não confirmado; consulte novamente."); }
    finally { lock.current = false; if (current === generation.current) setBusy(false); }
  };
  return <section className="space-y-3">
    <h3 className="font-medium">Cancelar saldo não faturado</h3>
    <p>Saldo: {residualAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
    <Label htmlFor="cancel-reason">Motivo</Label>
    <Input id="cancel-reason" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
    <Button variant="destructive" disabled={busy || !reason.trim() || residualAmount <= 0} onClick={submit}>Cancelar saldo</Button>
    {result && <p role="status">{result}</p>}
  </section>;
}

export function FiscalCancellationResult({ result }: { result: unknown }) {
  const r = result && typeof result === "object" ? result as Record<string, unknown> : null;
  if (r?.final !== true) return <p>Cancelamento fiscal não confirmado; pendência ou consulta deve ser resolvida no fluxo fiscal.</p>;
  return <p>{r.financialReconciliationRequired === true
    ? "Nota cancelada. Há pagamento; reconciliação pelo Financeiro é necessária, sem estorno automático."
    : "Nota cancelada e título totalmente em aberto cancelado. Estoque e devolução permanecem separados."}</p>;
}