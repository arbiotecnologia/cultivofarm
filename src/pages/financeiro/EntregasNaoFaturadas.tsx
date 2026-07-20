import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { KpiCard } from "@/components/financeiro/KpiCard";
import { Ban, Wallet, Truck, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/financial/format";
import { ConfirmarEntregaFinanceiroDialog } from "@/components/financeiro/ConfirmarEntregaFinanceiroDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const MOTIVOS = [
  { value: "bonificacao", label: "Bonificação" },
  { value: "amostra", label: "Amostra" },
  { value: "complemento_gratuito", label: "Complemento gratuito" },
  { value: "correcao_entrega", label: "Correção de entrega" },
  { value: "outro", label: "Outro" },
];

export default function EntregasNaoFaturadas() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<any | null>(null);
  const [nbTarget, setNbTarget] = useState<any | null>(null);
  const [motivo, setMotivo] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["entregas-nao-faturadas"],
    queryFn: async () => {
      const q: any = supabase
        .from("entregas")
        .select(`id, status, financial_status, data_saida, entregue_em, quantidade_entregue, volume_entregue_ml, cliente_id, ordem_servico_id, receivable_id,
                 comprovante_status, recebimento_confirmado_em, assinatura_tipo, validation_token,
                 clientes(nome), produtos(id, nome, valor_litro_brl), lotes(id, codigo_lote)`)
        .eq("financial_status", "PENDING_BILLING")
        .eq("status", "entregue")
        .is("receivable_id", null)
        .order("entregue_em", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });


  const totals = useMemo(() => {
    let valor = 0;
    let old = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    items.forEach((e: any) => {
      const v = Number(e.quantidade_entregue || 0) * Number(e.produtos?.valor_litro_brl || 0);
      valor += v;
      const dt = new Date(e.entregue_em || e.data_saida);
      if (dt < sevenDaysAgo) old++;
    });
    return { count: items.length, valor, old };
  }, [items]);

  const markNB = useMutation({
    mutationFn: async () => {
      if (!nbTarget) throw new Error("Entrega inválida");
      if (!motivo || !justificativa.trim()) throw new Error("Informe motivo e justificativa");
      const reason = `${MOTIVOS.find((m) => m.value === motivo)?.label}: ${justificativa.trim()}`;
      const { error } = await supabase.rpc("fn_mark_entrega_not_billable" as any, {
        _entrega_id: nbTarget.id,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrega marcada como sem cobrança");
      qc.invalidateQueries({ queryKey: ["entregas-nao-faturadas"] });
      setNbTarget(null); setMotivo(""); setJustificativa("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Entregas não faturadas" description={`${items.length} entrega(s) aguardando geração financeira`} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard label="Entregas pendentes" value={String(totals.count)} icon={Truck} tone="warning" />
        <KpiCard label="Valor estimado" value={brl(totals.valor)} icon={Wallet} tone="default" />
        <KpiCard label="Pendentes > 7 dias" value={String(totals.old)} icon={Ban} tone={totals.old > 0 ? "danger" : "default"} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor estimado</TableHead>
                <TableHead>Comprovante</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Tudo faturado 🎉</TableCell></TableRow>
              ) : items.map((e: any) => {
                const valor = Number(e.quantidade_entregue || 0) * Number(e.produtos?.valor_litro_brl || 0);
                const cs = e.comprovante_status || "pendente";
                const compBadge = (() => {
                  switch (cs) {
                    case "confirmado": return { variant: "default" as const, label: "Recebimento confirmado", hint: "Recebimento confirmado." };
                    case "anexado": return { variant: "secondary" as const, label: "Comprovante anexado", hint: "Comprovante aguardando confirmação." };
                    case "assinatura_digital_coletada": return { variant: "secondary" as const, label: "Assinatura digital", hint: "Comprovante aguardando confirmação." };
                    case "formulario_gerado": return { variant: "outline" as const, label: "Formulário gerado", hint: "Entrega ainda sem recebimento confirmado." };
                    case "dispensado": return { variant: "outline" as const, label: "Assinatura dispensada", hint: "Recebimento confirmado." };
                    case "rejeitado": return { variant: "destructive" as const, label: "Comprovante rejeitado", hint: "Entrega ainda sem recebimento confirmado." };
                    default: return { variant: "outline" as const, label: "Comprovante pendente", hint: "Entrega ainda sem recebimento confirmado." };
                  }
                })();
                return (
                  <TableRow key={e.id}>
                    <TableCell>{fmtDate(e.entregue_em || e.data_saida)}</TableCell>
                    <TableCell className="font-medium">{e.clientes?.nome}</TableCell>
                    <TableCell>{e.produtos?.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{e.lotes?.codigo_lote}</TableCell>
                    <TableCell className="text-right">{e.quantidade_entregue}</TableCell>
                    <TableCell className="text-right">{brl(valor)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={compBadge.variant} className="w-fit">{compBadge.label}</Badge>
                        <span className="text-[10px] text-muted-foreground">{compBadge.hint}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {e.validation_token && (
                        <Button size="sm" variant="ghost" title="Ver validação pública"
                          onClick={() => window.open(`/validar-entrega/${e.validation_token}`, "_blank")}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setSel(e)}>Faturar</Button>
                      <Button size="sm" variant="outline" onClick={() => setNbTarget(e)} title="Marcar como sem cobrança">
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmarEntregaFinanceiroDialog open={!!sel} onClose={() => setSel(null)} entrega={sel} />

      <Dialog open={!!nbTarget} onOpenChange={(v) => !v && setNbTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marcar entrega como sem cobrança</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Cliente <strong>{nbTarget?.clientes?.nome}</strong> — {nbTarget?.produtos?.nome}</p>
            <div>
              <Label>Motivo *</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Justificativa *</Label>
              <Textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNbTarget(null)}>Cancelar</Button>
            <Button onClick={() => markNB.mutate()} disabled={markNB.isPending || !motivo || !justificativa.trim()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
