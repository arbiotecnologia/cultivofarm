import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Eye, Plus, XCircle, Settings2, BarChart3, ShieldCheck } from "lucide-react";
import {
  useB2BReceivables,
  useGenerateB2BReceivable,
  useCancelB2BReceivable,
  usePartnerFinancialSettings,
  useUpdatePartnerFinancialSettings,
} from "@/hooks/useB2BFinanceiro";
import { brl, fmtDate } from "@/lib/financial/format";
import { useAuth } from "@/hooks/useAuth";

const finStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pendente: "secondary",
  gerado: "outline",
  parcial: "outline",
  recebido: "default",
  vencido: "destructive",
  cancelado: "outline",
};

export default function FinanceiroB2B() {
  const { role } = useAuth();
  const [filters, setFilters] = useState<{ status?: string; financial_status?: string; q?: string }>({});
  const [settingsFor, setSettingsFor] = useState<{ partner_id: string; partner_name: string } | null>(null);

  const { data = [], isLoading } = useB2BReceivables({
    status: filters.status,
    financial_status: filters.financial_status,
  });
  const gen = useGenerateB2BReceivable();
  const cancel = useCancelB2BReceivable();

  const canGenerate = role === "administrador" || role === "financeiro" || role === "gestor";
  const canCancel = role === "administrador" || role === "financeiro";
  const canSettings = canGenerate;

  const filtered = useMemo(
    () =>
      data.filter((r) =>
        !filters.q
          ? true
          : `${r.numero} ${r.partner_name}`.toLowerCase().includes(filters.q.toLowerCase())
      ),
    [data, filters.q]
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Financeiro B2B</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/comercial/pedidos-b2b?status=aguardando_aprovacao_credito">
              <ShieldCheck className="h-4 w-4 mr-1" />Aprovações de crédito
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/financeiro/b2b/dashboard"><BarChart3 className="h-4 w-4 mr-1" />Dashboard B2B</Link>
          </Button>
        </div>
      </div>


      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Buscar</Label>
              <Input
                placeholder="Pedido ou parceiro"
                className="max-w-xs"
                value={filters.q ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status pedido</Label>
              <Select
                value={filters.status ?? "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))}
              >
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="em_producao">Em produção</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status financeiro</Label>
              <Select
                value={filters.financial_status ?? "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, financial_status: v === "all" ? undefined : v }))}
              >
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="gerado">Gerado</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>Status pedido</TableHead>
                  <TableHead>Status financeiro</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-6">Carregando…</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum pedido encontrado</TableCell></TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.partner_order_id}>
                    <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                    <TableCell className="font-medium">{r.partner_name}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={finStatusVariant[r.financial_status] ?? "secondary"}>{r.financial_status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{brl(r.total)}</TableCell>
                    <TableCell>{fmtDate(r.payment_due_date)}</TableCell>
                    <TableCell className="capitalize">{r.payment_method ?? "—"}</TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {canSettings && (
                        <Button
                          size="icon" variant="ghost" title="Configurar parceiro"
                          onClick={() => setSettingsFor({ partner_id: r.partner_id, partner_name: r.partner_name })}
                        ><Settings2 className="h-4 w-4" /></Button>
                      )}
                      {!r.receivable_id && canGenerate && r.financial_status !== "cancelado" && (
                        <Button
                          size="sm" variant="default"
                          disabled={gen.isPending}
                          onClick={() => gen.mutate(r.partner_order_id)}
                        ><Plus className="h-4 w-4 mr-1" />Gerar AR</Button>
                      )}
                      {r.receivable_id && (
                        <Button size="icon" variant="ghost" asChild title="Ver no Contas a Receber">
                          <Link to="/financeiro/receber"><Eye className="h-4 w-4" /></Link>
                        </Button>
                      )}
                      {r.receivable_id && canCancel && r.financial_status === "gerado" && (
                        <Button
                          size="icon" variant="ghost" title="Cancelar cobrança"
                          onClick={() => {
                            const motivo = window.prompt("Motivo do cancelamento (mín. 5 caracteres):");
                            if (motivo && motivo.trim().length >= 5)
                              cancel.mutate({ partner_order_id: r.partner_order_id, motivo: motivo.trim() });
                          }}
                        ><XCircle className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PartnerFinancialSettingsDialog
        open={!!settingsFor}
        onClose={() => setSettingsFor(null)}
        partner={settingsFor}
      />
    </div>
  );
}

function PartnerFinancialSettingsDialog({
  open, onClose, partner,
}: {
  open: boolean; onClose: () => void; partner: { partner_id: string; partner_name: string } | null;
}) {
  const { data: settings, isLoading } = usePartnerFinancialSettings(partner?.partner_id);
  const save = useUpdatePartnerFinancialSettings();
  const [form, setForm] = useState<any>({});

  useMemo(() => {
    if (settings) setForm(settings);
    else if (partner)
      setForm({
        partner_id: partner.partner_id,
        billing_trigger: "na_entrega",
        payment_terms_days: 7,
        default_payment_method: "pix",
        auto_generate_receivable: true,
        block_if_overdue: false,
        active: true,
      });
  }, [settings, partner]);

  if (!partner) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuração Financeira — {partner.partner_name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Gatilho de cobrança</Label>
              <Select
                value={form.billing_trigger ?? "na_entrega"}
                onValueChange={(v) => setForm((f: any) => ({ ...f, billing_trigger: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="na_aprovacao">Na aprovação</SelectItem>
                  <SelectItem value="na_producao_finalizada">Produção finalizada</SelectItem>
                  <SelectItem value="na_entrega">Na entrega (padrão)</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prazo (dias)</Label>
                <Input
                  type="number" min={0}
                  value={form.payment_terms_days ?? 7}
                  onChange={(e) => setForm((f: any) => ({ ...f, payment_terms_days: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Forma padrão</Label>
                <Select
                  value={form.default_payment_method ?? "pix"}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, default_payment_method: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pix","boleto","transferencia","dinheiro","cartao","prazo"].map(m => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Limite de crédito (R$)</Label>
              <MoneyInput
                allowEmpty
                value={form.credit_limit}
                onValueChange={(v) => setForm((f: any) => ({ ...f, credit_limit: v }))}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="font-medium text-sm">Gerar AR automaticamente</div>
                <div className="text-xs text-muted-foreground">Usa o gatilho configurado</div>
              </div>
              <Switch
                checked={!!form.auto_generate_receivable}
                onCheckedChange={(v) => setForm((f: any) => ({ ...f, auto_generate_receivable: v }))}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <div className="font-medium text-sm">Bloquear pedidos com inadimplência</div>
                <div className="text-xs text-muted-foreground">Impede novos pedidos se houver títulos vencidos</div>
              </div>
              <Switch
                checked={!!form.block_if_overdue}
                onCheckedChange={(v) => setForm((f: any) => ({ ...f, block_if_overdue: v }))}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ ...form, partner_id: partner.partner_id }, { onSuccess: onClose })
            }
          >Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
