import { useState, useMemo, useEffect, useRef } from "react";
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
import { Eye, XCircle, Settings2, BarChart3, ShieldCheck } from "lucide-react";
import { B2BForecastCell } from "@/components/financeiro/B2BForecastCell";
import { B2BPaymentMethodCell } from "@/components/financeiro/B2BPaymentMethodCell";
import {
  useB2BReceivables,
  useCancelB2BReceivable,
  usePartnerFinancialSettings,
  useUpdatePartnerFinancialSettings,
  useFinancialSettingsPartners,
  useFinancialSettingsMethods,
} from "@/hooks/useB2BFinanceiro";
import { brl } from "@/lib/financial/format";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { activePaymentMethodValid, canConfigurePartnerSettings, emptyPartnerSettings, samePartnerSettings, type PartnerSettings } from "@/lib/financeiro/partnerSettings";

const finStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pendente: "secondary",
  gerado: "outline",
  parcial: "outline",
  recebido: "default",
  vencido: "destructive",
  cancelado: "outline",
};

export default function FinanceiroB2B() {
  const { role, roles } = useAuth();
  const fence = useStorageAccessScope("b2b-financial");
  const [filters, setFilters] = useState<{ status?: string; financial_status?: string; q?: string }>({});
  const [settingsFor, setSettingsFor] = useState<{ partner_id: string; partner_name: string } | null>(null);

  const { data = [], isLoading } = useB2BReceivables({
    status: filters.status,
    financial_status: filters.financial_status,
  });
  const cancel = useCancelB2BReceivable();

  const canCancel = role === "administrador" || role === "financeiro";
  const canSettings = fence.ready && canConfigurePartnerSettings(roles);
  const partners = useFinancialSettingsPartners(canSettings);
  const [selectedPartner, setSelectedPartner] = useState("");
  useEffect(() => { setSettingsFor(null); setSelectedPartner(""); }, [fence.scope]);

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


      {canSettings && <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 min-w-0 w-full sm:w-80">
          <Label htmlFor="financial-partner">Parceiro</Label>
          <Select value={selectedPartner} onValueChange={setSelectedPartner} disabled={!partners.data || partners.isFetching}>
            <SelectTrigger id="financial-partner"><SelectValue placeholder="Selecionar parceiro" /></SelectTrigger>
            <SelectContent>{(partners.data ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome_fantasia || p.razao_social}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={!partners.data?.some(p => p.id === selectedPartner) || partners.isFetching}
          onClick={() => { const p = partners.data?.find(p => p.id === selectedPartner); if (p) setSettingsFor({ partner_id: p.id, partner_name: p.nome_fantasia || p.razao_social }); }}>
          <Settings2 className="h-4 w-4 mr-1" />Configurar parceiro
        </Button>
        {partners.isError && <p role="alert" className="text-sm text-destructive">Parceiros indisponíveis para esta sessão.</p>}
      </div>}

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
                  <TableHead className="text-right">Valor do pedido</TableHead>
                  <TableHead>Previsão / confirmação</TableHead>
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
                    <TableCell><B2BForecastCell orderId={r.partner_order_id} /></TableCell>
                    <TableCell><B2BPaymentMethodCell orderId={r.partner_order_id} /></TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {canSettings && (
                        <Button
                          size="icon" variant="ghost" title="Configurar parceiro"
                          onClick={() => setSettingsFor({ partner_id: r.partner_id, partner_name: r.partner_name })}
                        ><Settings2 className="h-4 w-4" /></Button>
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

      {canSettings && settingsFor && <PartnerFinancialSettingsDialog
        key={`${fence.scope}:${settingsFor.partner_id}`}
        open={!!settingsFor}
        onClose={() => setSettingsFor(null)}
        partner={settingsFor}
      />}
    </div>
  );
}

export function PartnerFinancialSettingsDialog({
  open, onClose, partner,
}: {
  open: boolean; onClose: () => void; partner: { partner_id: string; partner_name: string } | null;
}) {
  const { roles } = useAuth();
  const fence = useStorageAccessScope("b2b-financial");
  const allowed = fence.ready && canConfigurePartnerSettings(roles);
  const query = usePartnerFinancialSettings(partner?.partner_id, open && allowed);
  const methods = useFinancialSettingsMethods(open && allowed);
  const save = useUpdatePartnerFinancialSettings();
  const [baseline, setBaseline] = useState<PartnerSettings | null | undefined>(undefined);
  const [form, setForm] = useState<PartnerSettings>(() => emptyPartnerSettings(partner?.partner_id ?? ""));
  const [failure, setFailure] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (baseline !== undefined || !query.isSuccess || query.isFetching || query.isFetchedAfterMount === false || query.data === undefined || !partner) return;
    setBaseline(query.data);
    setForm(query.data ?? emptyPartnerSettings(partner.partner_id));
  }, [baseline, query.isSuccess, query.isFetching, query.isFetchedAfterMount, query.data, partner]);
  const conflict = !save.isPending && baseline !== undefined && query.data !== undefined && !samePartnerSettings(baseline, query.data);
  const validMethod = activePaymentMethodValid(form.default_payment_method, methods.data ?? []);
  const ready = allowed && baseline !== undefined && query.isSuccess && !query.isFetching && !query.isError
    && methods.isSuccess && !methods.isFetching && !methods.isError && validMethod && !conflict && !failure;
  const numbersValid = Number.isInteger(form.payment_terms_days) && form.payment_terms_days >= 0
    && (form.credit_limit === null || Number.isFinite(form.credit_limit) && form.credit_limit >= 0);
  if (!partner || !allowed) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting.current && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Configuração Financeira — {partner.partner_name}</DialogTitle>
        </DialogHeader>
        {(conflict || failure) && <p role="alert" className="text-sm text-destructive">{conflict || failure === "settings_conflict" ? "A configuração mudou. Seu rascunho foi preservado; feche e reabra para revisar a versão atual." : "Não foi possível confirmar o salvamento. Seu rascunho foi preservado; feche e reabra para conferir."}</p>}
        {(query.isError || methods.isError) && <p role="alert" className="text-sm text-destructive">Configuração ou métodos indisponíveis. Salvamento bloqueado.</p>}
        {baseline === undefined ? (
          <div className="py-8 text-center text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="billing-trigger">Gatilho de cobrança</Label>
              <Select
                value={form.billing_trigger ?? "na_entrega"}
                onValueChange={(v) => setForm((f: any) => ({ ...f, billing_trigger: v }))}
              >
                <SelectTrigger id="billing-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="na_aprovacao">Na aprovação</SelectItem>
                  <SelectItem value="na_producao_finalizada">Produção finalizada</SelectItem>
                  <SelectItem value="na_entrega">Na entrega</SelectItem>
                  <SelectItem value="manual">Manual (padrão para novo cadastro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="payment-days">Prazo (dias)</Label>
                <Input
                  id="payment-days"
                  type="number" min={0}
                  value={form.payment_terms_days ?? 7}
                  onChange={(e) => setForm((f: any) => ({ ...f, payment_terms_days: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="default-method">Forma padrão</Label>
                <Select
                  value={form.default_payment_method ?? ""}
                  onValueChange={(v) => setForm((f: any) => ({ ...f, default_payment_method: v }))}
                >
                  <SelectTrigger id="default-method"><SelectValue placeholder="Selecionar método ativo" /></SelectTrigger>
                  <SelectContent>
                    {form.default_payment_method && !validMethod && <SelectItem disabled value={form.default_payment_method}>{form.default_payment_method} — inválido/inativo</SelectItem>}
                    {(methods.data ?? []).filter(m => activePaymentMethodValid(m.name, methods.data ?? [])).map(m => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {methods.isSuccess && !validMethod && <p role="alert" className="text-sm text-destructive">Selecione explicitamente um método ativo cadastrado.</p>}
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
          <Button variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</Button>
          <Button
            disabled={save.isPending || !ready || !numbersValid}
            onClick={async () => {
              if (!ready || !numbersValid || submitting.current || baseline === undefined) return;
              const current = fence.capture();
              submitting.current = true;
              try {
                await save.mutateAsync({ draft: { ...form, partner_id: partner.partner_id }, baseline });
                if (current()) onClose();
              } catch (error) { if (current()) setFailure(error instanceof Error ? error.message : "unconfirmed"); }
              finally { submitting.current = false; }
            }}
          >Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
