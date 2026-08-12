import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DocumentosPanel } from "./DocumentosPanel";
import { toast } from "sonner";

interface Props {
  receivable: any;
}

const STATUS_OPTS = [
  { v: "NOT_REQUIRED", l: "Não obrigatória" },
  { v: "PENDING", l: "Pendente" },
  { v: "ISSUED", l: "Emitida" },
  { v: "CANCELED", l: "Cancelada" },
];

export function FiscalTab({ receivable }: Props) {
  const qc = useQueryClient();
  const arId = receivable?.id;

  const { data: invoice, refetch } = useQuery({
    queryKey: ["fiscal-invoice-by-ar", arId],
    enabled: !!arId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("fiscal_invoices").select("*").eq("receivable_id", arId).maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState<any>({});
  useEffect(() => {
    setForm({
      status: (invoice as any)?.status ?? (receivable as any)?.fiscal_invoice_status ?? "PENDING",
      invoice_number: (invoice as any)?.invoice_number ?? (receivable as any)?.fiscal_invoice_number ?? "",
      series: (invoice as any)?.series ?? "",
      access_key: (invoice as any)?.access_key ?? (receivable as any)?.fiscal_access_key ?? "",
      issue_date: (invoice as any)?.issue_date ?? (receivable as any)?.fiscal_issue_date ?? "",
    });
  }, [invoice, receivable]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rpc_upsert_fiscal_invoice_manual" as any, {
        p_receivable_id: arId,
        p_payload: {
          status: form.status,
          invoice_number: form.invoice_number || null,
          series: form.series || null,
          access_key: form.access_key || null,
          issue_date: form.issue_date || null,
          invoice_type: (invoice as any)?.invoice_type ?? "NFE",
          total_amount: (invoice as any)?.total_amount ?? receivable.total_amount,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Dados fiscais atualizados");
      qc.invalidateQueries({ queryKey: ["fiscal-invoice-by-ar", arId] });
      qc.invalidateQueries({ queryKey: ["ar-list"] });
      qc.invalidateQueries({ queryKey: ["fiscal-invoices"] });
      refetch();
    },
    onError: (e: any) => toast.error(e.message || "Falha ao salvar dados fiscais"),
  });

  const required = receivable?.fiscal_invoice_required;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm">NF-e obrigatória:</Label>
        <Badge variant={required ? "default" : "secondary"}>{required ? "Sim" : "Não"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Status fiscal</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Número NF-e</Label><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
        <div><Label>Série</Label><Input value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} /></div>
        <div className="col-span-2"><Label>Chave de acesso</Label><Input value={form.access_key} onChange={(e) => setForm({ ...form, access_key: e.target.value })} /></div>
        <div><Label>Data emissão</Label><Input type="date" value={form.issue_date || ""} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">Salvar dados fiscais</Button>

      {(invoice as any)?.id && (
        <div className="pt-3 border-t">
          <Label className="text-xs uppercase text-muted-foreground">Anexos fiscais (XML / DANFE)</Label>
          <DocumentosPanel ownerType="FISCAL_INVOICE" ownerId={(invoice as any).id} defaultType="XML" canDelete />
        </div>
      )}
    </div>
  );
}
