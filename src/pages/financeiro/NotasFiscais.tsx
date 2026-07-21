import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { FileText } from "lucide-react";
import { brl, fmtDate } from "@/lib/financial/format";
import { DocumentosPanel } from "@/components/financeiro/DocumentosPanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const STATUS = ["PENDING", "ISSUED", "CANCELED", "ERROR"] as const;

export default function NotasFiscais() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("ALL");
  const [sel, setSel] = useState<any | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["fiscal-invoices", filtro],
    queryFn: async () => {
      let q = supabase.from("fiscal_invoices").select("*, accounts_receivable(customer_id, description, clientes:customer_id(nome))").order("created_at", { ascending: false });
      if (filtro !== "ALL") q = q.eq("status", filtro);
      const { data, error } = await q;
      if (error) throw error; return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, patch }: any) => {
      const { error } = await supabase.from("fiscal_invoices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["fiscal-invoices"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader 
        title="Notas Fiscais" 
        description="Registro e acompanhamento de documentos fiscais"
        action={
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        } 
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Tipo</TableHead><TableHead>Número</TableHead><TableHead>Emissão</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma nota fiscal</TableCell></TableRow> :
                items.map((n: any) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.accounts_receivable?.clientes?.nome || "—"}</TableCell>
                    <TableCell>{n.invoice_type}</TableCell>
                    <TableCell className="font-mono text-xs">{n.invoice_number || "—"}</TableCell>
                    <TableCell>{fmtDate(n.issue_date)}</TableCell>
                    <TableCell>{brl(n.total_amount)}</TableCell>
                    <TableCell><Badge variant={n.status === "ISSUED" ? "default" : n.status === "ERROR" ? "destructive" : "secondary"}>{n.status}</Badge></TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setSel(n)}>Abrir</Button></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>Nota fiscal</SheetTitle></SheetHeader>
          {sel && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Número</Label><Input defaultValue={sel.invoice_number || ""} onBlur={(e) => updateStatus.mutate({ id: sel.id, patch: { invoice_number: e.target.value } })} /></div>
                <div><Label>Série</Label><Input defaultValue={sel.series || ""} onBlur={(e) => updateStatus.mutate({ id: sel.id, patch: { series: e.target.value } })} /></div>
                <div className="col-span-2"><Label>Chave de acesso</Label><Input defaultValue={sel.access_key || ""} onBlur={(e) => updateStatus.mutate({ id: sel.id, patch: { access_key: e.target.value } })} /></div>
                <div><Label>Data emissão</Label><Input type="date" defaultValue={sel.issue_date || ""} onBlur={(e) => updateStatus.mutate({ id: sel.id, patch: { issue_date: e.target.value || null } })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select defaultValue={sel.status} onValueChange={(v) => updateStatus.mutate({ id: sel.id, patch: { status: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Anexos (XML / DANFE)</Label>
                <DocumentosPanel ownerType="FISCAL_INVOICE" ownerId={sel.id} defaultType="XML" canDelete />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
