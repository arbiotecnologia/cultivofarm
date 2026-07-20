import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
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

interface Receipt {
  id: string;
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



export default function RecibosList() {
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [numberFilter, setNumberFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [cancelOpen, setCancelOpen] = useState<Receipt | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("financial_receipts" as any)
      .select("*, customer:customer_id(nome, razao_social), method:payment_method_id(name)")
      .order("issued_at", { ascending: false })
      .limit(500);
    if (from) q = q.gte("payment_date", from);
    if (to) q = q.lte("payment_date", to);
    if (statusFilter) q = q.eq("status", statusFilter);
    if (numberFilter) q = q.ilike("receipt_number", `%${numberFilter}%`);
    if (customerFilter) q = q.eq("customer_id", customerFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [from, to, statusFilter, numberFilter, customerFilter]);

  const download = async (r: Receipt) => {
    try {
      if (!r.storage_path) {
        const { data, error } = await supabase.functions.invoke("generate-financial-receipt", {
          body: { receipt_id: r.id },
        });
        if (error) throw error;
        if ((data as any)?.url) window.open((data as any).url, "_blank");
      } else {
        const { data } = await supabase.storage
          .from("financial-receipts")
          .createSignedUrl(r.storage_path, 3600);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const cancel = async () => {
    if (!cancelOpen) return;
    if (reason.trim().length < 5) {
      toast.error("Motivo precisa ter ao menos 5 caracteres");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("cancel_financial_receipt", {
      _receipt_id: cancelOpen.id,
      _reason: reason,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Recibo cancelado");
    setCancelOpen(null);
    setReason("");
    load();
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
                        <Button size="sm" variant="outline" onClick={() => download(r)} title="Baixar PDF">
                          <Download className="w-4 h-4" />
                        </Button>
                        {r.receivable_id && (
                          <Button asChild size="sm" variant="outline" title="Abrir recebimento">
                            <Link to={`/financeiro/receber?id=${r.receivable_id}`}>
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </Button>
                        )}
                        {!isCanceled && (
                          <Button size="sm" variant="outline" onClick={() => setCancelOpen(r)} title="Cancelar">
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

      <Dialog open={!!cancelOpen} onOpenChange={(o) => !o && setCancelOpen(null)}>
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
            <Button variant="outline" onClick={() => setCancelOpen(null)}>Voltar</Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
