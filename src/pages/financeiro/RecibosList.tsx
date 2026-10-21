import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, XCircle, Loader2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { brl as fmt } from "@/lib/financial/format";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
import { financialReceiptCurrentLocator, readReceiptCurrentState } from "@/lib/financeiro/receiptCurrentState";
import { recordReceiptPrepare, type ReceiptPrepareStage } from "@/lib/financeiro/receiptPrepareDiagnostics";

interface Receipt {
  id: string;
  organization_id: string;
  receipt_year: number;
  storage_bucket: string | null;
  receipt_number: string;
  payment_date: string;
  amount: number;
  status: string;
  customer_id: string | null;
  storage_path: string | null;
  authenticity_code: string;
  issued_at: string;
  receivable_id: string | null;
  payment_id: string;
  cancel_reason: string | null;
  customer?: { nome?: string; razao_social?: string } | null;
  method?: { name?: string } | null;
}

function ReceiptDownload({ receipt, tenant, listScope }: { receipt: Receipt; tenant: string; listScope: string }) {
  const resource = JSON.stringify(["receipt-pdf", listScope, receipt]);
  const access = useStorageAccessScope(resource);
  const opener = useAuthenticatedAttachmentOpener(resource, "financial-receipts");
  const request = useRef<AbortController | null>(null);
  const latest = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState({ scope: "", path: "", status: "", number: "" });
  let listed = "";
  try { listed = financialReceiptCurrentLocator(receipt, tenant).path; } catch { /* fail closed */ }
  const interrupted = useRef(false);
  useLayoutEffect(() => {
    setBusy(false); setPrepared({ scope: "", path: "", status: "", number: "" });
    // Session renewal/revocation changes the scope mid-preparation: neutral notice, no auto-retry.
    if (interrupted.current && access.ready) toast.info("Sessão atualizada durante o preparo. Prepare o PDF novamente.");
    interrupted.current = false;
    return () => { if (request.current) interrupted.current = true; request.current?.abort(); request.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.scope]);
  const isPrepared = access.ready && prepared.scope === access.scope && !!opener.urls[prepared.path];
  const download = async () => {
    const current = access.capture();
    if (!current() || !listed || request.current) return;
    const controller = new AbortController();
    request.current = controller; latest.current = controller;
    const valid = () => current() && !controller.signal.aborted && request.current === controller;
    const started = Date.now(); let stage: ReceiptPrepareStage = "fresh_read"; let timedOut = false;
    const note = (outcome: "ok" | "timeout" | "fence" | "error" | "stale_state") => recordReceiptPrepare({ source: "list", stage, outcome, elapsedMs: Date.now() - started });
    const timeout = setTimeout(() => {
      if (request.current !== controller) return;
      timedOut = true; controller.abort(); request.current = null;
      if (current()) { setBusy(false); toast.error("Recibo indisponível"); }
    }, 15_000);
    controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
    setBusy(true);
    // Bytes not confirmed by the post-read (timeout, fence, error, late reply) are revoked in finally.
    let opened = ""; let kept = false; let outcome: "ok" | "error" | "stale_state" = "error";
    try {
      if (isPrepared) {
        // Prepared bytes (possibly from before a cancel elsewhere) are re-confirmed against server state.
        const fresh = await readReceiptCurrentState(receipt.id, tenant, controller.signal);
        if (!valid()) return;
        if (fresh.status !== prepared.status || fresh.path !== prepared.path) {
          opener.discard(prepared.path); setPrepared({ scope: "", path: "", status: "", number: "" });
          outcome = "stale_state"; toast.error("Recibo atualizado. Prepare o PDF novamente."); return;
        }
        stage = "download"; outcome = "ok";
        opener.download(prepared.path, `${prepared.number}${prepared.status === "CANCELED" ? "-CANCELADO" : ""}.pdf`);
        return;
      }
      const before = await readReceiptCurrentState(receipt.id, tenant, controller.signal);
      if (!valid()) return;
      // CANCELED always renders its own object; ISSUED renders only when never generated.
      if (before.status === "CANCELED" || !before.generated) {
        stage = "edge";
        const { data, error } = await supabase.functions.invoke("generate-financial-receipt", {
          body: { receipt_id: receipt.id }, signal: controller.signal,
        });
        if (!valid()) return;
        // Status-bound contract: path/status must match the fresh server state; never consume url.
        if (error || data?.path !== before.path || data?.receipt_number !== before.receipt_number || data?.status !== before.status) throw new Error("Recibo indisponível");
      }
      if (!valid()) return;
      // Single watchdog covers Edge, bytes and the post-bytes status read until finally.
      // Parent signal propagates timeout/fence into the opener's own I/O; only a true
      // result proves fresh bytes exist. A swallowed failure never reaches "prepared".
      stage = "bytes";
      const loaded = await opener.open(before.path, () => {}, controller.signal);
      if (loaded) opened = before.path;
      if (!valid()) return;
      if (!loaded) throw new Error("Recibo indisponível");
      // A cancel concurrent with preparation invalidates the bytes just fetched.
      stage = "post_read";
      const after = await readReceiptCurrentState(receipt.id, tenant, controller.signal);
      if (!valid()) return;
      if (after.status !== before.status || after.path !== before.path) {
        opener.discard(before.path); outcome = "stale_state"; toast.error("Recibo atualizado. Prepare o PDF novamente."); return;
      }
      kept = true; outcome = "ok";
      setPrepared({ scope: access.scope, path: before.path, status: before.status, number: before.receipt_number });
    } catch {
      if (valid()) toast.error("Recibo indisponível");
    } finally {
      clearTimeout(timeout);
      note(timedOut ? "timeout" : !current() ? "fence" : outcome);
      // A newer request may own the same path after a timeout; never revoke its bytes.
      if (opened && !kept && latest.current === controller) opener.discard(opened);
      if (request.current === controller) {
        request.current = null;
        if (current()) setBusy(false);
      }
    }
  };
  return <Button size="sm" variant="outline" onClick={download} disabled={!access.ready || !listed || busy || opener.loadingPaths.length > 0}
    title={isPrepared ? "Baixar PDF" : "Preparar PDF"} aria-label={isPrepared ? "Baixar PDF" : "Preparar PDF"}>
    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
  </Button>;
}


export default function RecibosList() {
  const { profile } = useAuth();
  const tenant = profile?.organization_id ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [numberFilter, setNumberFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [cancelOpen, setCancelOpen] = useState<Receipt | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const resource = JSON.stringify(["financial-receipts", from, to, statusFilter, numberFilter, customerFilter]);
  const access = useStorageAccessScope(resource);
  const [result, setResult] = useState({ scope: "", rows: [] as Receipt[], loading: false });
  const [refresh, setRefresh] = useState(0);
  const pendingCancel = useRef<AbortController | null>(null);
  const dialogEpoch = useRef(0);
  useLayoutEffect(() => {
    setCancelOpen(null); setReason(""); setBusy(false); dialogEpoch.current++;
    return () => { pendingCancel.current?.abort(); pendingCancel.current = null; dialogEpoch.current++; };
  }, [access.scope]);
  useEffect(() => {
    const current = access.capture();
    const controller = new AbortController();
    const valid = () => current() && !controller.signal.aborted;
    if (!valid()) return;
    setResult({ scope: access.scope, rows: [], loading: true });
    const timeout = setTimeout(() => {
      controller.abort();
      if (current()) { setResult({ scope: access.scope, rows: [], loading: false }); toast.error("Recibos indisponíveis"); }
    }, 15_000);
    const load = async () => {
      try {
        if (!valid()) return;
        let q = supabase
          .from("financial_receipts" as any)
          .select("*, customer:customer_id(nome, razao_social), method:payment_method_id(name)")
          .eq("organization_id", tenant)
          .order("issued_at", { ascending: false })
          .limit(500);
        if (from) q = q.gte("payment_date", from);
        if (to) q = q.lte("payment_date", to);
        if (statusFilter) q = q.eq("status", statusFilter);
        if (numberFilter) q = q.ilike("receipt_number", `%${numberFilter}%`);
        if (customerFilter) q = q.eq("customer_id", customerFilter);
        if (!valid()) return;
        const { data, error } = await q.abortSignal(controller.signal);
        if (!valid()) return;
        const receipts = (data ?? []) as unknown as Receipt[];
        if (error || receipts.some(r => r.organization_id !== tenant)) throw new Error("Recibos indisponíveis");
        if (valid()) setResult({ scope: access.scope, rows: receipts, loading: false });
      } catch {
        if (valid()) { toast.error("Recibos indisponíveis"); setResult({ scope: access.scope, rows: [], loading: false }); }
      } finally { clearTimeout(timeout); }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timeout); };
    // Scope includes actor, tenant, roles, epoch and all filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.scope, refresh]);

  const visible = access.ready && result.scope === access.scope;
  const rows = visible ? result.rows : [];
  const loading = visible && result.loading;
  const selectCancel = (receipt: Receipt | null) => {
    if (pendingCancel.current) return;
    dialogEpoch.current++;
    setCancelOpen(receipt); setReason("");
  };
  const cancel = async () => {
    const current = access.capture();
    const receipt = cancelOpen;
    const epoch = dialogEpoch.current;
    const submittedReason = reason;
    if (!current() || !receipt || receipt.organization_id !== tenant || !rows.includes(receipt) || pendingCancel.current) return;
    if (submittedReason.trim().length < 5) { toast.error("Motivo precisa ter ao menos 5 caracteres"); return; }
    const controller = new AbortController(); pendingCancel.current = controller;
    const valid = () => current() && !controller.signal.aborted && pendingCancel.current === controller && dialogEpoch.current === epoch;
    const timeout = setTimeout(() => {
      if (pendingCancel.current !== controller) return;
      controller.abort(); pendingCancel.current = null;
      if (current()) { setBusy(false); toast.error("Não foi possível confirmar o cancelamento. Consulte o recibo antes de tentar novamente."); }
    }, 15_000);
    controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
    setBusy(true);
    try {
      if (!valid()) return;
      const { error } = await supabase.rpc("cancel_financial_receipt", {
        _receipt_id: receipt.id, _reason: submittedReason,
      }).abortSignal(controller.signal);
      if (!valid()) return;
      if (error) throw new Error("Cancelamento indisponível");
      if (!valid()) return;
      toast.success("Recibo cancelado");
      if (!valid()) return;
      setCancelOpen(null); setReason("");
      if (valid()) setRefresh(n => n + 1);
    } catch {
      if (valid()) toast.error("Cancelamento indisponível");
    } finally {
      clearTimeout(timeout);
      if (pendingCancel.current === controller) {
        pendingCancel.current = null;
        if (current()) setBusy(false);
      }
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Recibos Emitidos</h1>
        <p className="text-sm text-muted-foreground">Histórico, download e cancelamento de recibos.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label>Número</Label><Input value={numberFilter} onChange={(e) => setNumberFilter(e.target.value)} placeholder="REC-2026-…" /></div>
          <div>
            <Label>Status</Label>
            <select className="w-full border rounded h-9 px-2 bg-background" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="ISSUED">Emitido</option>
              <option value="CANCELED">Cancelado</option>
            </select>
          </div>
          <div><Label>Cliente (id)</Label><Input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder="UUID" /></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cód. Aut.</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const customerName = r.customer?.nome ?? r.customer?.razao_social ?? "—";
                  const methodName = r.method?.name ?? "—";
                  const isCanceled = r.status === "CANCELED";
                  return (
                    <TableRow key={r.id} className={isCanceled ? "opacity-70" : ""}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1">
                          {r.receipt_number}
                          {isCanceled && <Badge variant="destructive" className="text-[10px]">CANCELADO</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{customerName}</TableCell>
                      <TableCell>{formatDateDisplay(r.payment_date)}</TableCell>
                      <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                      <TableCell className="text-xs">{methodName}</TableCell>
                      <TableCell>
                        <Badge variant={isCanceled ? "destructive" : "default"}>{isCanceled ? "Cancelado" : "Emitido"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.authenticity_code}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <ReceiptDownload key={JSON.stringify([access.scope, r])} receipt={r} tenant={tenant} listScope={access.scope} />
                        {r.receivable_id && (
                          <Button asChild size="sm" variant="outline" title="Abrir recebimento">
                            <Link to={`/financeiro/receber?id=${r.receivable_id}`}>
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </Button>
                        )}
                        {!isCanceled && (
                          <Button size="sm" variant="outline" onClick={() => { if (access.capture()()) selectCancel(r); }} disabled={!access.ready || busy} title="Cancelar" aria-label="Cancelar">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum recibo</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={access.ready && !!cancelOpen} onOpenChange={(o) => !o && selectCancel(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancelar recibo {cancelOpen?.receipt_number}</DialogTitle>
          </DialogHeader>
          <Label>Motivo do cancelamento *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Informe o motivo (mín. 5 caracteres)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => selectCancel(null)} disabled={busy}>Voltar</Button>
            <Button variant="destructive" onClick={cancel} disabled={busy || !access.ready}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
