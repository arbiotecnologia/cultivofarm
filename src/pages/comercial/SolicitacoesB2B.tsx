import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, ArrowRight } from "lucide-react";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { usePartnerOrdersAdmin } from "@/hooks/usePartnerOrdersAdmin";
import { useComercialSimulacoesAll } from "@/hooks/useProdutorSolicitacoes";
import {
  partnerOrderStatusLabel,
  partnerOrderStatusVariant,
} from "@/lib/partnerOrderStatus";
import { DetalhePedidoDrawer } from "@/components/pedidos-b2b/DetalhePedidoDrawer";
import { DetalheSimulacaoDrawer } from "@/components/pedidos-b2b/DetalheSimulacaoDrawer";
import { useActiveTenantName } from "@/hooks/useActiveTenantName";
import { useAuth } from "@/hooks/useAuth";
import { SellerFinanceOrderReview } from "@/components/pedidos-b2b/SellerFinanceOrderReview";

const SIM_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviada_gestor: "Enviada ao gestor",
  convertida_pedido: "Convertida em pedido",
  arquivada: "Arquivada",
};

type TipoFiltro =
  | "all"
  | "pedido"
  | "simulacao"
  | "pedido_de_simulacao"
  | "simulacao_nao_convertida";

/** Lê o nome do tenant SOMENTE quando o diálogo está aberto — a lista não monta leitura secundária. */
function WithTenantName({ children }: { children: (name: string | null) => JSX.Element }) {
  const { name } = useActiveTenantName();
  return children(name);
}

export default function SolicitacoesB2B() {
  const { data: pedidos = [], isLoading: loadingPed, actorScope } = usePartnerOrdersAdmin();
  const { data: sims = [], isLoading: loadingSim } = useComercialSimulacoesAll();
  const { roles } = useAuth();
  // Financeiro sem papel comercial: pedido externo abre a revisão financeira canônica (servidor decide o acesso).
  const financeOnly = roles.includes("financeiro" as any) && !roles.some((r) => r === "administrador" || r === "gestor_comercial");

  const [statusPed, setStatusPed] = useState("all");
  const [statusSim, setStatusSim] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [clienteFilter, setClienteFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState<TipoFiltro>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [openPedido, setOpenPedido] = useState<string | null>(null);
  const [openSim, setOpenSim] = useState<string | null>(null);
  // Troca de ator/tenant/revogação fecha qualquer detalhe aberto.
  useEffect(() => { setOpenPedido(null); setOpenSim(null); }, [actorScope]);
  const openedOrder = openPedido ? pedidos.find((p) => p.id === openPedido) : undefined;
  const financeReview = financeOnly && !!openedOrder?.c2_external_origin_snapshot;

  // Clientes lookup for order rows
  const clienteIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...pedidos.map((p) => p.cliente_id),
            ...sims.map((s: any) => s.cliente_id),
          ].filter(Boolean) as string[],
        ),
      ),
    [pedidos, sims],
  );

  const { data: clientesMap = new Map<string, string>() } = useQuery({
    queryKey: ["comercial-clientes-lookup", clienteIds.sort().join(",")],
    enabled: clienteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome")
        .in("id", clienteIds);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((c: any) =>
        m.set(c.id, c.razao_social ?? c.nome ?? "—"),
      );
      return m;
    },
  });

  // Pedido numero lookup for cross-nav from sims → pedido gerado
  const orderNumeroById = useMemo(() => {
    const m = new Map<string, string>();
    pedidos.forEach((p) => m.set(p.id, p.numero));
    return m;
  }, [pedidos]);

  // Options
  const partnerOptions = useMemo(() => {
    const m = new Map<string, string>();
    pedidos.forEach((p) => {
      if (p.partner_id) {
        m.set(
          p.partner_id,
          p.partner_accounts?.nome_fantasia ??
            p.partner_accounts?.razao_social ??
            p.partner_id,
        );
      }
    });
    sims.forEach((s: any) => {
      if (s.partner_id && !m.has(s.partner_id))
        m.set(s.partner_id, s.partner_nome ?? s.partner_id);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [pedidos, sims]);

  const clienteOptions = useMemo(() => {
    const m = new Map<string, string>();
    clienteIds.forEach((id) => m.set(id, clientesMap.get(id) ?? "—"));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clienteIds, clientesMap]);

  const inPeriod = (iso: string) => {
    if (startDate && iso < startDate) return false;
    if (endDate && iso > endDate + "T23:59:59") return false;
    return true;
  };

  const filteredPed = useMemo(() => {
    return pedidos.filter((p) => {
      if (statusPed !== "all" && p.status !== statusPed) return false;
      if (partnerFilter !== "all" && p.partner_id !== partnerFilter) return false;
      if (clienteFilter !== "all" && p.cliente_id !== clienteFilter) return false;
      if (!inPeriod(p.created_at)) return false;
      if (tipoFilter === "simulacao" || tipoFilter === "simulacao_nao_convertida")
        return false;
      if (tipoFilter === "pedido_de_simulacao" && !p.origin_simulation_id)
        return false;
      if (search) {
        const s = search.toLowerCase();
        const parceiro =
          p.partner_accounts?.nome_fantasia ?? p.partner_accounts?.razao_social ?? "";
        const cliente = p.cliente_id ? clientesMap.get(p.cliente_id) ?? "" : "";
        if (
          !p.numero.toLowerCase().includes(s) &&
          !parceiro.toLowerCase().includes(s) &&
          !cliente.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [
    pedidos,
    statusPed,
    partnerFilter,
    clienteFilter,
    startDate,
    endDate,
    tipoFilter,
    search,
    clientesMap,
  ]);

  const filteredSim = useMemo(() => {
    return sims.filter((s: any) => {
      if (statusSim !== "all" && s.status !== statusSim) return false;
      if (partnerFilter !== "all" && s.partner_id !== partnerFilter) return false;
      if (clienteFilter !== "all" && s.cliente_id !== clienteFilter) return false;
      if (!inPeriod(s.created_at)) return false;
      if (tipoFilter === "pedido" || tipoFilter === "pedido_de_simulacao")
        return false;
      if (tipoFilter === "simulacao_nao_convertida" && s.converted_order_id)
        return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(s.titulo ?? "").toLowerCase().includes(q) &&
          !(s.cliente_nome ?? "").toLowerCase().includes(q) &&
          !(s.partner_nome ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [
    sims,
    statusSim,
    partnerFilter,
    clienteFilter,
    startDate,
    endDate,
    tipoFilter,
    search,
  ]);

  // KPIs
  const kpis = useMemo(() => {
    const simsConvertidas = sims.filter((s: any) => s.status === "convertida_pedido")
      .length;
    const simsPend = sims.filter((s: any) => s.status === "enviada_gestor").length;
    const totalPed = pedidos.reduce((a, p) => a + Number(p.total ?? 0), 0);
    const totalSim = sims.reduce((a, s: any) => a + Number(s.total_cheio ?? 0), 0);
    return {
      totPed: pedidos.length,
      totSim: sims.length,
      simsConvertidas,
      simsPend,
      totalPed,
      totalSim,
    };
  }, [pedidos, sims]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Solicitações B2B</h1>
        <p className="text-sm text-muted-foreground">
          Funil comercial completo — pedidos e simulações dos parceiros.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Pedidos" value={kpis.totPed} />
        <KpiCard label="Simulações" value={kpis.totSim} />
        <KpiCard label="Sim. convertidas" value={kpis.simsConvertidas} />
        <KpiCard label="Sim. pendentes" value={kpis.simsPend} />
        <KpiCard label="Total pedidos" value={brl(kpis.totalPed)} />
        <KpiCard label="Total simulado (tabela)" value={brl(kpis.totalSim)} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={partnerFilter} onValueChange={setPartnerFilter}>
            <SelectTrigger><SelectValue placeholder="Parceiro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos parceiros</SelectItem>
              {partnerOptions.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clienteFilter} onValueChange={setClienteFilter}>
            <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos clientes</SelectItem>
              {clienteOptions.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as TipoFiltro)}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="pedido">Somente pedidos</SelectItem>
              <SelectItem value="simulacao">Somente simulações</SelectItem>
              <SelectItem value="pedido_de_simulacao">
                Pedidos originados de simulação
              </SelectItem>
              <SelectItem value="simulacao_nao_convertida">
                Simulações não convertidas
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos ({filteredPed.length})</TabsTrigger>
          <TabsTrigger value="simulacoes">
            Simulações ({filteredSim.length})
          </TabsTrigger>
        </TabsList>

        {/* PEDIDOS */}
        <TabsContent value="pedidos" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <CardTitle className="text-base flex-1">Pedidos</CardTitle>
              <Select value={statusPed} onValueChange={setStatusPed}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pendente">Enviado</SelectItem>
                  <SelectItem value="aguardando_aprovacao_credito">
                    Aguardando crédito
                  </SelectItem>
                  <SelectItem value="em_analise_comercial">
                    Em análise comercial
                  </SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="em_producao">Em produção</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="faturado">Faturado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loadingPed ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : filteredPed.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum pedido.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Parceiro</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Prev. entrega</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPed.map((o) => (
                        <TableRow
                          key={o.id}
                          onClick={() => setOpenPedido(o.id)}
                          className="cursor-pointer hover:bg-accent/40"
                        >
                          <TableCell className="font-mono">{o.numero}</TableCell>
                          <TableCell className="text-sm">
                            {o.partner_accounts?.nome_fantasia ??
                              o.partner_accounts?.razao_social ??
                              "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {o.cliente_id
                              ? clientesMap.get(o.cliente_id) ?? "—"
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {o.origin_simulation_id ? (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs"
                                onClick={(e) => { e.stopPropagation(); setOpenSim(o.origin_simulation_id!); }}
                              >
                                Simulação <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            ) : o.c2_external_origin_snapshot ? (
                              <Badge variant="outline">Pedido do parceiro</Badge>
                            ) : (
                              <Badge variant="outline">Manual</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={partnerOrderStatusVariant(o.status)}>
                              {partnerOrderStatusLabel(o.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{fd(o.created_at)}</TableCell>
                          <TableCell>
                            {o.estimated_delivery_date
                              ? fd(o.estimated_delivery_date)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">{brl(o.total)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); setOpenPedido(o.id); }}
                            >
                              <Eye className="h-4 w-4 mr-1" /> Detalhe
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIMULAÇÕES */}
        <TabsContent value="simulacoes" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <CardTitle className="text-base flex-1">Simulações</CardTitle>
              <Select value={statusSim} onValueChange={setStatusSim}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="enviada_gestor">Enviada ao gestor</SelectItem>
                  <SelectItem value="convertida_pedido">
                    Convertida em pedido
                  </SelectItem>
                  <SelectItem value="arquivada">Arquivada</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loadingSim ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : filteredSim.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhuma simulação.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Parceiro</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Total tabela</TableHead>
                        <TableHead>Pedido gerado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSim.map((s: any) => {
                        const numPed = s.converted_order_id
                          ? orderNumeroById.get(s.converted_order_id)
                          : null;
                        return (
                          <TableRow
                            key={s.id}
                            onClick={() => setOpenSim(s.id)}
                            className="cursor-pointer hover:bg-accent/40"
                          >
                            <TableCell className="font-mono text-xs">
                              {s.id.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {s.partner_nome ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {s.cliente_nome ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {s.responsavel_nome ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {SIM_STATUS_LABEL[s.status] ?? s.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{fd(s.created_at)}</TableCell>
                            <TableCell className="text-right">
                              {brl(s.total_cheio)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {s.converted_order_id ? (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 font-mono"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenPedido(s.converted_order_id);
                                  }}
                                >
                                  {numPed ?? "Abrir"}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setOpenSim(s.id); }}
                              >
                                <Eye className="h-4 w-4 mr-1" /> Detalhe
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!!openPedido && financeReview && <SellerFinanceOrderReview
        orderId={openPedido}
        open={!!openPedido}
        onOpenChange={(o) => !o && setOpenPedido(null)}
      />}
      {!!openPedido && !financeReview && <WithTenantName>{(tenantName) => <DetalhePedidoDrawer
        empresaNome={tenantName}
        orderId={openPedido}
        open={!!openPedido}
        onOpenChange={(o) => !o && setOpenPedido(null)}
        viewerScope="comercial"
      />}</WithTenantName>}
      <DetalheSimulacaoDrawer
        simulationId={openSim}
        open={!!openSim}
        onOpenChange={(o) => !o && setOpenSim(null)}
        viewerScope="comercial"
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg md:text-xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
