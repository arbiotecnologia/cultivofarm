import { AccountingPendingNotice, AccountingPendingBadge } from "@/components/pedidos/AccountingPendingNotice";
import { isAccountingPending } from "@/lib/orderAccountingState";
import { useEffect, useMemo, useState } from "react";
import { PromoteAccountingPendingButton } from "@/components/pedidos/PromoteAccountingPendingButton";
import { usePartnerOrdersAdmin, PartnerOrderAdmin } from "@/hooks/usePartnerOrdersAdmin";
import { usePartnerOrderItems } from "@/hooks/usePartnerOrders";
import { useUnreadCountsByOrder } from "@/hooks/usePartnerUnreadMessages";
import {
  useApprovePartnerOrder,
  useRejectPartnerOrder,
  useSetDeliveryDate,
  useUpdateCommercialNotes,
  useRequestPartnerOrderItems,
} from "@/hooks/usePartnerOrderActions";
import { useApproveB2BCredit, usePartnerCredit } from "@/hooks/useB2BFinanceiro";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { formatDateDisplay as fmtDate } from "@/lib/date-utils";
import { brl as fmt } from "@/lib/financial/format";
import { partnerOrderStatusLabel, partnerOrderStatusVariant } from "@/lib/partnerOrderStatus";
import { OrderMessagesPanel } from "@/components/comercial/OrderMessagesPanel";
import {
  minDeliveryDateISO,
  isDeliveryDateValid,
  MIN_DELIVERY_HINT,
  MIN_DELIVERY_ERROR,
} from "@/lib/b2bDeliveryDate";
import { toast } from "sonner";
import { TimelinePedidoDialog } from "@/components/portal-parceiro/TimelinePedidoDialog";
import { ResponderCotacaoDialog } from "@/components/comercial/ResponderCotacaoDialog";
import { FaseSlaBadge } from "@/components/comercial/FaseSlaBadge";
import { useOrdersSlaMap } from "@/hooks/useOrdersSlaMap";
import { b2bToast } from "@/lib/b2bToast";
import { PedidoItemProdutoInfo } from "@/components/pedidos-b2b/PedidoItemProdutoInfo";
import { PaymentTermsSection } from "@/components/comercial/PaymentTermsSection";
import { orderItemQuantityLabel } from "@/lib/comercial/orderItemPresentation";
import { CommercialOrderEntry } from "@/components/comercial/CommercialOrderEntry";
import { CommercialOwnerOrdersSection } from "@/components/comercial/CommercialOwnerOrdersSection";
import { useInternalOrderEntry } from "@/hooks/useInternalOrderEntry";
import { PEDIDOS_B2B_DEFAULT_STATUS, usePedidosB2BStatusFilter } from "@/hooks/usePedidosB2BStatusFilter";
import { useActiveTenantName } from "@/hooks/useActiveTenantName";
import { ResaleOsAvailabilityPanel } from "@/components/comercial/ResaleOsAvailabilityPanel";
import { C2PilotEconomicApproval } from "@/components/pedidos-b2b/C2PilotEconomicApproval";
import { useOrderEconomicDiagnosis } from "@/hooks/useOrderEconomicDiagnosis";




const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "aguardando_aprovacao_credito", label: "Aguardando aprovação de crédito" },
  { value: "aguardando_cotacao", label: "Aguardando cotação" },
  { value: "em_analise_comercial", label: "Em análise" },
  { value: "aguardando_itens", label: "Aguardando itens" },
  { value: "aprovado", label: "Aprovado" },
  { value: "reprovado", label: "Reprovado" },
  { value: "reprovado_sem_itens", label: "Reprovado — sem itens" },
  { value: "solicitado", label: "Solicitado" },
  { value: "cancelado", label: "Cancelado" },
];
const STATUS_VALUES = STATUS_OPTIONS.map((s) => s.value);

/** Lê o nome do tenant SOMENTE quando o diálogo está aberto — a lista não monta leitura secundária. */
function WithTenantName({ children }: { children: (name: string | null) => JSX.Element }) {
  const { name } = useActiveTenantName();
  return children(name);
}

export default function PedidosB2B() {
  const { role, roles = [] } = useAuth();
  const internalEntry = useInternalOrderEntry();
  const canApproveCredit =
    role === "administrador" || role === "gestor" || role === "financeiro";
  const [statusFilter, setStatusFilter] = usePedidosB2BStatusFilter(STATUS_VALUES, PEDIDOS_B2B_DEFAULT_STATUS);
  const { data: orders = [], isLoading, actorScope, actorReady } = usePartnerOrdersAdmin({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { data: unread = {} } = useUnreadCountsByOrder(orderIds);
  const { data: slaMap } = useOrdersSlaMap(orderIds);

  // Detalhe preso ao escopo do ator: troca de identidade/tenant/papéis/época ou revogação fecha o detalhe;
  // enquanto aberto, a linha é atualizada pela leitura cercada (CAS usa o updated_at mais recente).
  const [detailState, setDetailState] = useState<{ scope: string; order: PartnerOrderAdmin } | null>(null);
  const detail = detailState && detailState.scope === actorScope && actorReady
    ? (orders.find((o) => o.id === detailState.order.id) ?? detailState.order) : null;
  const setDetail = (o: PartnerOrderAdmin | null) => setDetailState(o ? { scope: actorScope, order: o } : null);
  const economicDiagnosis = useOrderEconomicDiagnosis(detail && isAccountingPending(detail) ? detail.id : null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [estDate, setEstDate] = useState("");
  const [commercialNotes, setCommercialNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [creditNotes, setCreditNotes] = useState("");

  const { data: items = [] } = usePartnerOrderItems(detail?.id ?? null);
  const { data: credit } = usePartnerCredit(
    detail?.status === "aguardando_aprovacao_credito" ? detail?.partner_id : null,
  );
  const approve = useApprovePartnerOrder();
  const reject = useRejectPartnerOrder();
  const setDate = useSetDeliveryDate();
  const updateNotes = useUpdateCommercialNotes();
  const approveCredit = useApproveB2BCredit();
  const requestItems = useRequestPartnerOrderItems();
  const [requestItemsOpen, setRequestItemsOpen] = useState(false);
  const [requestItemsMotivo, setRequestItemsMotivo] = useState("");
  useEffect(() => {
    // Troca de ator/tenant/revogação: fecha detalhe e todos os diálogos de ação derivados dele.
    setDetailState(null); setRejectOpen(false); setTimelineOpen(false); setQuoteOpen(false); setRequestItemsOpen(false);
  }, [actorScope]);
  const canAttemptPromotion = roles.some((r) => r === "administrador" || r === "gestor" || r === "gestor_comercial");
  const itemsCount = items.length;
  const hasItems = itemsCount > 0;

  const openDetail = (o: PartnerOrderAdmin) => {
    setDetail(o);
    setApprovalNotes(o.approval_notes ?? "");
    setEstDate(o.estimated_delivery_date ?? "");
    setCommercialNotes(o.commercial_notes ?? "");
    setCreditNotes("");
  };

  const handleApproveCredit = async () => {
    if (!detail) return;
    const orderNumero = detail.numero;
    try {
      const result: any = await b2bToast.promise(
        approveCredit.mutateAsync({
          partner_order_id: detail.id,
          notes: creditNotes || undefined,
        }),
        {
          action: "approve-credit",
          orderNumero,
          loading: `Liberando pedido ${orderNumero} para análise comercial…`,
          success: (r: any) => {
            const label = partnerOrderStatusLabel(r?.status ?? "em_analise_comercial");
            return `Crédito aprovado · ${orderNumero} → ${label}`;
          },
        },
      );
      setCreditNotes("");
      setStatusFilter("em_analise_comercial");
      setDetailState((current) => current && current.order.id === detail.id && current.scope === actorScope
        ? { ...current, order: { ...current.order, status: result?.status ?? "em_analise_comercial", ready_for_production: false } }
        : null);
    } catch {
      /* já tratado */
    }
  };

  const handleApprove = async () => {
    if (!detail) return;
    if (estDate && !isDeliveryDateValid(estDate)) {
      toast.error(MIN_DELIVERY_ERROR);
      return;
    }
    const orderNumero = detail.numero;
    try {
      await b2bToast.promise(
        approve.mutateAsync({
          order_id: detail.id,
          approval_notes: approvalNotes,
          estimated_delivery_date: estDate || null,
        }),
        {
          action: "approve-order",
          orderNumero,
          loading: `Aprovando pedido ${orderNumero}…`,
          success: `Pedido ${orderNumero} aprovado comercialmente`,
        },
      );
      setDetail(null);
    } catch {
      /* já tratado */
    }
  };

  const handleReject = async () => {
    if (!detail || !rejectReason.trim()) return;
    const orderNumero = detail.numero;
    try {
      await b2bToast.promise(
        reject.mutateAsync({ order_id: detail.id, approval_notes: rejectReason }),
        {
          action: "reject-order",
          orderNumero,
          loading: `Reprovando pedido ${orderNumero}…`,
          success: `Pedido ${orderNumero} reprovado`,
        },
      );
      setRejectOpen(false);
      setRejectReason("");
      setDetail(null);
    } catch {
      /* já tratado */
    }
  };

  const handleRequestItems = async () => {
    if (!detail || !requestItemsMotivo.trim()) return;
    const orderNumero = detail.numero;
    try {
      await b2bToast.promise(
        requestItems.mutateAsync({ order_id: detail.id, motivo: requestItemsMotivo }),
        {
          action: "generic",
          orderNumero,
          loading: `Solicitando complementação do pedido ${orderNumero}…`,
          success: `Pedido ${orderNumero} devolvido ao parceiro para complementação`,
        },
      );
      setRequestItemsOpen(false);
      setRequestItemsMotivo("");
      setDetail(null);
    } catch {
      /* já tratado */
    }
  };



  const handleSaveDate = () => {
    if (!detail || !estDate) return;
    if (!isDeliveryDateValid(estDate)) {
      toast.error(MIN_DELIVERY_ERROR);
      return;
    }
    setDate.mutate({ order_id: detail.id, estimated_delivery_date: estDate });
  };

  const handleSaveNotes = () => {
    if (!detail) return;
    updateNotes.mutate({ order_id: detail.id, commercial_notes: commercialNotes });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Pedidos B2B</h1>
        <p className="text-sm text-muted-foreground">
          Análise e aprovação comercial dos pedidos enviados pelos parceiros.
        </p>
      </div>

      <CommercialOrderEntry state={internalEntry.ready ? internalEntry.data : undefined} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-center justify-between">
            <CardTitle className="text-base">Filtros</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido encontrado.</div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Parceiro</TableHead>
                      <TableHead>Criado</TableHead>
                      <TableHead>Desejada</TableHead>
                      <TableHead>Prevista</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => {
                      const n = unread[o.id] ?? 0;
                      return (
                        <TableRow
                          key={o.id}
                          onClick={() => openDetail(o)}
                          className="cursor-pointer hover:bg-accent/40"
                        >
                          <TableCell className="font-mono">{o.numero}</TableCell>
                          <TableCell>{o.partner_accounts?.razao_social ?? "—"}</TableCell>
                          <TableCell>{fmtDate(o.created_at)}</TableCell>
                          <TableCell>{o.requested_delivery_date ? fmtDate(o.requested_delivery_date) : "—"}</TableCell>
                          <TableCell>{o.estimated_delivery_date ? fmtDate(o.estimated_delivery_date) : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant={partnerOrderStatusVariant(o.status)}>
                                {partnerOrderStatusLabel(o.status)}
                              </Badge>
                              <FaseSlaBadge info={slaMap?.get(o.id) ?? null} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{fmt(o.total)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {n > 0 && (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[10px] gap-1">
                                  <MessageSquare className="h-3 w-3" /> {n}
                                </Badge>
                              )}
                              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openDetail(o); }}>Abrir</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2">
                {orders.map((o) => {
                  const n = unread[o.id] ?? 0;
                  return (
                    <button
                      key={o.id}
                      onClick={() => openDetail(o)}
                      className="w-full text-left border rounded-lg p-3 space-y-1"
                    >
                      <div className="flex justify-between gap-2">
                        <div className="font-mono text-sm">{o.numero}</div>
                        <Badge variant={partnerOrderStatusVariant(o.status)}>
                          {partnerOrderStatusLabel(o.status)}
                        </Badge>
                      </div>
                      <div className="text-sm">{o.partner_accounts?.razao_social ?? "—"}</div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{fmtDate(o.created_at)}</span>
                        <span className="flex items-center gap-2">
                          {n > 0 && (
                            <Badge variant="destructive" className="h-4 px-1 text-[10px] gap-1">
                              <MessageSquare className="h-3 w-3" /> {n}
                            </Badge>
                          )}
                          <span className="font-semibold text-foreground">{fmt(o.total)}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Canal administrativo da empresa dona da carteira: somente leitura, via RPC
          canônica escopada. Sempre montado — pedidos já visíveis na lista administrativa
          são deduplicados por ID; quieto quando o contrato não está instalado, o ator não
          é admin/gestor_comercial interno ou a carteira não tem pedidos no filtro. */}
      <CommercialOwnerOrdersSection statusFilter={statusFilter} excludeIds={orderIds} />

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Pedido {detail.numero}</DialogTitle>
                <DialogDescription>
                  {detail.partner_accounts?.razao_social} · {fmtDate(detail.created_at)} · <Badge variant={partnerOrderStatusVariant(detail.status)}>{partnerOrderStatusLabel(detail.status)}</Badge>{isAccountingPending(detail) && <> <AccountingPendingBadge /></>}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <PaymentTermsSection
                  partnerOrderId={detail.id}
                  accountingPending={isAccountingPending(detail)}
                  canApprove={role === "administrador" || role === "financeiro" || role === "gestor_comercial"}
                  requiresFinancialApproval={(detail as any).requires_financial_approval}
                  requiresCreditApproval={(detail as any).requires_credit_approval}
                  requiresGuarantee={(detail as any).requires_guarantee}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Data desejada</div>
                    <div>{detail.requested_delivery_date ? fmtDate(detail.requested_delivery_date) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-semibold">{fmt(detail.total)}</div>
                  </div>
                </div>


                <div>
                  <div className="text-xs text-muted-foreground mb-1">Itens</div>
                  <div className="border rounded-md divide-y">
                    {items.map((i: any) => (
                      <div key={i.id} className="p-2 flex justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <PedidoItemProdutoInfo item={i} />
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {orderItemQuantityLabel(i)} · {fmt(Number(i.preco_unitario))} cada
                          </div>
                        </div>
                        <div className="font-semibold whitespace-nowrap">{fmt(Number(i.subtotal))}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <ResaleOsAvailabilityPanel orderId={detail.id} actorScope={actorScope} />
                {isAccountingPending(detail) && <>
                  <AccountingPendingNotice audience="commercial" diagnosis={economicDiagnosis.isError ? null : economicDiagnosis.data} />
                  <C2PilotEconomicApproval key={`${actorScope}:${detail.id}`} orderId={detail.id} />
                </>}
                <PromoteAccountingPendingButton order={detail} canAttempt={canAttemptPromotion} />
                {detail.status === "aguardando_aprovacao_credito" && (
                  <div className="border rounded-md p-3 space-y-2 bg-destructive/5">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <ShieldCheck className="h-4 w-4" /> Análise de crédito
                    </div>
                    {credit ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Limite</div>
                          <div className="font-semibold">{fmt(Number(credit.credit_limit ?? 0))}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Em aberto</div>
                          <div className="font-semibold">{fmt(Number(credit.saldo_em_aberto ?? 0))}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Disponível</div>
                          <div className="font-semibold">{fmt(Number(credit.credito_disponivel ?? 0))}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Valor do pedido</div>
                          <div className="font-semibold">{fmt(Number(detail.total ?? 0))}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Carregando dados de crédito...</div>
                    )}
                    {canApproveCredit && !isAccountingPending(detail) ? (
                      <>
                        <Textarea
                          rows={2}
                          placeholder="Observações da aprovação de crédito (opcional)"
                          value={creditNotes}
                          onChange={(e) => setCreditNotes(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRejectOpen(true)}
                            disabled={reject.isPending}
                          >
                            Recusar por crédito
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleApproveCredit}
                            disabled={approveCredit.isPending}
                          >
                            {approveCredit.isPending ? "Aprovando..." : "Aprovar crédito e liberar"}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {isAccountingPending(detail)
                          ? "Decisão de crédito bloqueada enquanto a contabilidade da empresa estiver pendente."
                          : "Apenas Administrador, Gestor ou Financeiro podem aprovar crédito."}
                      </div>
                    )}
                  </div>
                )}

                <OrderMessagesPanel orderId={detail.id} authorType="comercial" />


                <div className="border-t pt-3 space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Previsão de entrega</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={estDate}
                          onChange={(e) => setEstDate(e.target.value)}
                          min={minDeliveryDateISO()}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveDate}
                          disabled={!estDate || !isDeliveryDateValid(estDate) || setDate.isPending}
                        >
                          Salvar
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">{MIN_DELIVERY_HINT}</p>
                      {estDate && !isDeliveryDateValid(estDate) && (
                        <p className="text-[11px] text-destructive">{MIN_DELIVERY_ERROR}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Observações comerciais (internas)</label>
                    <Textarea rows={2} value={commercialNotes} onChange={(e) => setCommercialNotes(e.target.value)} />
                    <Button variant="outline" size="sm" onClick={handleSaveNotes} disabled={updateNotes.isPending}>
                      Salvar observações
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Notas de aprovação / reprovação</label>
                    <Textarea rows={2} value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} />
                  </div>
                </div>
              </div>

              {(!hasItems || detail.status === "aguardando_itens") &&
                detail.status !== "aprovado" &&
                detail.status !== "reprovado" &&
                detail.status !== "reprovado_sem_itens" && (
                <div className="border rounded-md p-3 bg-amber-50 dark:bg-amber-950/30 border-amber-300 text-amber-900 dark:text-amber-200 text-xs flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {detail.status === "aguardando_itens"
                        ? "Pedido aguardando complementação do parceiro."
                        : "Este pedido não possui itens — não pode ser aprovado."}
                    </div>
                    {detail.itens_pendentes_motivo && (
                      <div>Motivo: {detail.itens_pendentes_motivo}</div>
                    )}
                    {detail.itens_pendentes_solicitado_em && (
                      <div className="text-amber-700 dark:text-amber-300">
                        Solicitado em {fmtDate(detail.itens_pendentes_solicitado_em)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setTimelineOpen(true)}>
                  <Clock className="h-4 w-4 mr-1" /> Linha do tempo
                </Button>
                {detail.status === "aguardando_cotacao" && (
                  <Button onClick={() => setQuoteOpen(true)} disabled={!hasItems}>
                    Responder cotação
                  </Button>
                )}
                {!hasItems && detail.status !== "aguardando_itens" && detail.status !== "reprovado_sem_itens" && (
                  <Button
                    variant="outline"
                    onClick={() => setRequestItemsOpen(true)}
                    disabled={requestItems.isPending}
                  >
                    Solicitar complementação
                  </Button>
                )}
                <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={reject.isPending}>
                  Reprovar
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={
                    approve.isPending ||
                    isAccountingPending(detail) ||
                    !hasItems ||
                    detail.status === "aprovado" ||
                    detail.status === "aguardando_aprovacao_credito" ||
                    detail.status === "aguardando_cotacao" ||
                    detail.status === "aguardando_itens"
                  }
                  title={
                    isAccountingPending(detail)
                      ? "Bloqueado: contabilidade da empresa pendente"
                      : !hasItems
                      ? "Adicione ao menos 1 item para aprovar"
                      : detail.status === "aguardando_cotacao"
                        ? "Responda a cotação antes de aprovar"
                        : undefined
                  }
                >
                  {approve.isPending ? "Aprovando..." : "Aprovar pedido"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {timelineOpen && <WithTenantName>{(tenantName) => <TimelinePedidoDialog
        supplierName={tenantName}
        orderId={detail?.id ?? null}
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
      />}</WithTenantName>}

      <ResponderCotacaoDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        orderId={detail?.id ?? null}
        orderNumero={detail?.numero ?? null}
        items={items as any}
        onResponded={() => setDetail(null)}
      />


      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar pedido</DialogTitle>
            <DialogDescription>Informe o motivo. Será enviado ao parceiro.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo da reprovação..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || reject.isPending}>
              Reprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={requestItemsOpen} onOpenChange={setRequestItemsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar complementação de itens</DialogTitle>
            <DialogDescription>
              O pedido será devolvido ao parceiro com status “Aguardando itens”. Informe o que precisa ser ajustado.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={requestItemsMotivo}
            onChange={(e) => setRequestItemsMotivo(e.target.value)}
            placeholder="Ex.: incluir os produtos cotados, ajustar quantidade do item X…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestItemsOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleRequestItems}
              disabled={!requestItemsMotivo.trim() || requestItems.isPending}
            >
              Solicitar complementação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
