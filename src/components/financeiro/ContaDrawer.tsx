import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/financeiro/StatusBadge";
import { brl, fmtDate } from "@/lib/financial/format";
import { resumoSaldoReceber } from "@/lib/financeiro/contasReceber";
import { resumoSaldoPagar, saldoParcelaPagar } from "@/lib/financeiro/contasPagar";
import { useState } from "react";
import { BaixaDialog } from "./BaixaDialog";
import { DocumentosPanel } from "./DocumentosPanel";
import { DocumentosReceberTab } from "./DocumentosReceberTab";
import { PagamentosTab } from "./PagamentosTab";
import { FiscalTab } from "./FiscalTab";
import { HistoricoTab } from "./HistoricoTab";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Kind = "receivable" | "payable";

interface Props { open: boolean; onClose: () => void; kind: Kind; contaId: string | null; }

export function ContaDrawer({ open, onClose, kind, contaId }: Props) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const [baixa, setBaixa] = useState<any>(null);
  const canDeleteDoc = role === "administrador" || role === "gestor";

  const parentTable = kind === "receivable" ? "accounts_receivable" : "accounts_payable";
  const instTable = kind === "receivable" ? "accounts_receivable_installments" : "accounts_payable_installments";
  const fkCol = kind === "receivable" ? "receivable_id" : "payable_id";
  const docOwner: any = kind === "receivable" ? "RECEIVABLE" : "PAYABLE";

  const { data: conta, isLoading: contaLoading, isError: contaErro, refetch: refetchConta } = useQuery({
    queryKey: ["fin-conta", kind, contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const sel = kind === "receivable"
        ? "*, clientes(nome), category:financial_categories(name)"
        : "*, category:financial_categories(name)";
      const { data, error } = await supabase.from(parentTable as any).select(sel).eq("id", contaId!).maybeSingle();
      if (error) throw error; return data as any;
    },
  });

  const { data: installments = [], isLoading: instLoading, isError: instErro, refetch: refetchInst } = useQuery({
    queryKey: ["fin-inst", kind, contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase.from(instTable as any).select("*").eq(fkCol, contaId!).order("installment_number");
      if (error) throw error; return data as any[];
    },
  });

  const cancelInst = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("rpc_cancel_financial_installment" as any, { p_installment_id: id, p_kind: kind, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Parcela cancelada"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const isReceivable = kind === "receivable";
  const resumoR = resumoSaldoReceber(installments);
  const resumoP = resumoSaldoPagar(installments);
  // Ajustes acumulados e saldo seguem a MESMA fórmula dos KPIs em ambos os ramos.
  const resumo = isReceivable
    ? resumoR
    : { recebido: resumoP.pago, juros: resumoP.juros, multa: resumoP.multa, desconto: resumoP.desconto, saldo: resumoP.saldo };
  const totalPago = resumo.recebido;
  const saldoTotal = resumo.saldo;

  const carregandoBase = contaLoading || instLoading;
  const erroBase = contaErro || instErro;

  if (erroBase) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isReceivable ? "Conta a Receber" : "Conta a Pagar"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col items-start gap-2 text-sm text-destructive">
            <span>Não foi possível carregar os dados da conta.</span>
            <Button size="sm" variant="outline" onClick={() => { refetchConta(); refetchInst(); }}>
              Tentar novamente
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isReceivable ? "Conta a Receber" : "Conta a Pagar"}</SheetTitle>
        </SheetHeader>

        {!conta && carregandoBase && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}

        {conta && (
          <Tabs defaultValue="resumo" className="mt-4">
            <TabsList className="w-full justify-start flex-wrap h-auto">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
              <TabsTrigger value="pagamentos">{kind === "receivable" ? "Recebimentos" : "Pagamentos"}</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              {kind === "receivable" && <TabsTrigger value="fiscal">Fiscal</TabsTrigger>}
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {kind === "receivable" && <div><span className="text-muted-foreground">Cliente:</span> <strong>{conta.clientes?.nome ?? "—"}</strong></div>}
                {kind === "payable" && <div><span className="text-muted-foreground">Fornecedor:</span> <strong>{conta.supplier_name ?? "—"}</strong></div>}
                <div><span className="text-muted-foreground">Categoria:</span> {conta.category?.name ?? "—"}</div>
                <div><span className="text-muted-foreground">Valor total:</span> <strong>{brl(conta.total_amount)}</strong></div>
                {isReceivable ? (
                  <>
                    <div><span className="text-muted-foreground">Recebido:</span> {brl(resumo.recebido)}</div>
                    <div><span className="text-muted-foreground">Juros acumulados:</span> {brl(resumo.juros)}</div>
                    <div><span className="text-muted-foreground">Multa acumulada:</span> {brl(resumo.multa)}</div>
                    <div><span className="text-muted-foreground">Desconto acumulado:</span> {brl(resumo.desconto)}</div>
                    <div><span className="text-muted-foreground">Saldo:</span> <strong>{brl(saldoTotal)}</strong></div>
                  </>
                ) : (
                  <>
                    <div><span className="text-muted-foreground">Pago:</span> {brl(resumo.recebido)}</div>
                    <div><span className="text-muted-foreground">Juros acumulados:</span> {brl(resumo.juros)}</div>
                    <div><span className="text-muted-foreground">Multa acumulada:</span> {brl(resumo.multa)}</div>
                    <div><span className="text-muted-foreground">Desconto acumulado:</span> {brl(resumo.desconto)}</div>
                    <div><span className="text-muted-foreground">Saldo:</span> <strong>{brl(saldoTotal)}</strong></div>
                  </>
                )}
                <div><span className="text-muted-foreground">1º vencimento:</span> {fmtDate(conta.first_due_date)}</div>
                <div><span className="text-muted-foreground">Parcelas:</span> {conta.installment_count}</div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={conta.status} /></div>
                {kind === "receivable" ? (
                  <div><span className="text-muted-foreground">NF-e:</span> {conta.fiscal_invoice_required ? (conta.fiscal_invoice_status ?? "PENDING") : "Não obrigatória"}</div>
                ) : (
                  <div><span className="text-muted-foreground">Data NF Fornecedor:</span> {fmtDate(conta.supplier_invoice_date)}</div>
                )}
              </div>
              {conta.description && <div className="text-sm"><span className="text-muted-foreground">Descrição:</span> {conta.description}</div>}
              {conta.notes && <div className="text-sm"><span className="text-muted-foreground">Notas:</span> {conta.notes}</div>}
            </TabsContent>

            <TabsContent value="parcelas" className="mt-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead className="w-12">#</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>{kind === "receivable" ? "Recebido" : "Pago"}</TableHead><TableHead>Juros</TableHead><TableHead>Multa</TableHead><TableHead>Desconto</TableHead><TableHead>Saldo</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {instLoading && <TableRow><TableCell colSpan={isReceivable ? 10 : 6} className="text-center text-muted-foreground py-8">Carregando parcelas…</TableCell></TableRow>}
                    {!instLoading && instErro && (
                      <TableRow>
                        <TableCell colSpan={isReceivable ? 10 : 6} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2 text-sm text-destructive">
                            <span>Não foi possível carregar as parcelas.</span>
                            <Button size="sm" variant="outline" onClick={() => refetchInst()}>Tentar novamente</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {installments.map((r: any) => {
                      const recebido = kind === "receivable" ? r.received_amount : r.paid_amount;
                      const aberto = r.status !== "PAID" && r.status !== "CANCELED";
                      // Mesma fórmula dos KPIs em ambos os ramos.
                      const saldoP = isReceivable ? resumoSaldoReceber([r]).saldo : saldoParcelaPagar(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{r.installment_number}</TableCell>
                          <TableCell>{fmtDate(r.due_date)}</TableCell>
                          <TableCell>{brl(r.original_amount)}</TableCell>
                          <TableCell>{brl(recebido)}</TableCell>
                          <TableCell>{brl(r.interest_amount)}</TableCell>
                          <TableCell>{brl(r.penalty_amount)}</TableCell>
                          <TableCell>{brl(r.discount_amount)}</TableCell>
                          <TableCell className="font-medium">{brl(saldoP)}</TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-right space-x-1">
                            {aberto && <Button size="sm" variant="outline" onClick={() => setBaixa(r)}><Wallet className="h-3 w-3 mr-1" />Baixar</Button>}
                            {aberto && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Motivo do cancelamento (mín. 5 caracteres):"); if (reason && reason.trim().length >= 5) cancelInst.mutate({ id: r.id, reason: reason.trim() }); else if (reason !== null) toast.error("Motivo precisa ter ao menos 5 caracteres"); }}>Cancelar</Button>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!installments.length && !instLoading && !instErro && <TableRow><TableCell colSpan={isReceivable ? 10 : 6} className="text-center text-muted-foreground py-8">Sem parcelas</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="pagamentos" className="mt-4">
              <PagamentosTab kind={kind} contaId={contaId} />
            </TabsContent>

            <TabsContent value="documentos" className="mt-4">
              {isReceivable ? (
                <DocumentosReceberTab contaId={contaId} canDelete={canDeleteDoc} />
              ) : (
                <DocumentosPanel ownerType={docOwner} ownerId={contaId} defaultType="BOLETO" canDelete={canDeleteDoc} />
              )}
            </TabsContent>

            {kind === "receivable" && (
              <TabsContent value="fiscal" className="mt-4">
                <FiscalTab receivable={conta} />
              </TabsContent>
            )}

            <TabsContent value="historico" className="mt-4">
              <HistoricoTab kind={kind} contaId={contaId} />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
      <BaixaDialog open={!!baixa} onClose={() => setBaixa(null)} kind={kind} installment={baixa} />
    </Sheet>
  );
}
