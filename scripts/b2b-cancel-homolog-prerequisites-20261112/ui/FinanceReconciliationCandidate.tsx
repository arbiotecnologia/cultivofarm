import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HOMOLOG_REF, validTitle, type ReconciliationTitle } from "./reconciliationContract";

/** Inactive integration slot. The parent passes its canonical scoped read, never a new client. */
export function FinanceReconciliationCandidate({ targetRef, scopeKey, organizationId, readTitle }: {
  targetRef: string; scopeKey: string; organizationId: string;
  readTitle: (invoiceId: string) => Promise<ReconciliationTitle | null>;
}) {
  const [invoice, setInvoice] = useState("");
  const [title, setTitle] = useState<ReconciliationTitle | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const lock = useRef(false);
  useEffect(() => {
    generation.current++; setInvoice(""); setTitle(null); setStatus(null); setBusy(false);
    return () => { generation.current++; };
  }, [targetRef, scopeKey, organizationId]);
  if (targetRef !== HOMOLOG_REF || !organizationId) return null;
  async function locate() {
    const id = invoice.trim();
    if (lock.current || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
    const current = generation.current;
    lock.current = true; setBusy(true); setTitle(null); setStatus(null);
    try {
      const result = await readTitle(id);
      if (current !== generation.current) return;
      if (!validTitle(result, id, organizationId)) { setStatus("Título indisponível para esta nota e empresa."); return; }
      setTitle(result);
    } catch { if (current === generation.current) setStatus("Consulta indisponível. Tente novamente."); }
    finally { lock.current = false; if (current === generation.current) setBusy(false); }
  }
  return <section aria-label="Reconciliação Financeiro" className="space-y-4 border-t pt-4">
    <h2 className="text-lg font-semibold">Reconciliação Financeiro</h2>
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="reconciliation-invoice">Nota fiscal</Label>
        <Input id="reconciliation-invoice" value={invoice} disabled={busy} onChange={e => { setInvoice(e.target.value); setTitle(null); setStatus(null); }} /></div>
      <Button onClick={locate} disabled={busy || !invoice.trim()}><Search className="mr-2 h-4 w-4" />Localizar título</Button>
    </div>
    {status && <p role="status">{status}</p>}
    {title && <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Título</dt><dd className="break-all">{title.titleId}</dd></div>
        <div><dt className="text-muted-foreground">Pedido</dt><dd className="break-all">{title.orderId}</dd></div>
        <div><dt className="text-muted-foreground">Nota</dt><dd>{title.invoiceStatus}</dd></div>
        <div><dt className="text-muted-foreground">Reconciliação</dt><dd>{title.reconciliationStatus}</dd></div>
      </dl>
      <p>{title.titleStatus} · {title.installments.some(x => x.received > 0) ? "Há pagamento. Reconciliação pelo Financeiro, sem estorno automático." : "Sem pagamento registrado nas parcelas consultadas."}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Recebido</th><th>Status</th></tr></thead>
        <tbody>{title.installments.map(x => <tr key={x.id} className="border-t"><td className="max-w-48 break-all py-2">{x.id}</td><td>{x.dueDate}</td><td>{x.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td>{x.received.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td>{x.status}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}