import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
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
import { Eye, FlaskConical, ClipboardList, ArrowRight } from "lucide-react";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { usePartnerOrders } from "@/hooks/usePartnerOrders";
import { usePartnerSimulationsWithClient } from "@/hooks/useProdutorSolicitacoes";
import {
  partnerOrderStatusLabelForPartner,
  partnerOrderStatusVariantForPartner,
} from "@/lib/partnerOrderStatus";
import { DetalhePedidoDrawer } from "@/components/pedidos-b2b/DetalhePedidoDrawer";
import { DetalheSimulacaoDrawer } from "@/components/pedidos-b2b/DetalheSimulacaoDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const SIM_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviada_gestor: "Enviada ao gestor",
  convertida_pedido: "Convertida em pedido",
  arquivada: "Arquivada",
};

function withinRange(iso: string, from: string, to: string) {
  if (!from && !to) return true;
  const d = new Date(iso).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

export default function Solicitacoes() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { data: pedidos = [], isLoading: loadingPed } = usePartnerOrders(partner?.id);
  const { data: sims = [], isLoading: loadingSim } = usePartnerSimulationsWithClient(
    partner?.id,
  );

  const [openPedido, setOpenPedido] = useState<string | null>(null);
  const [openSim, setOpenSim] = useState<string | null>(null);

  // Pedidos filters
  const [pedNumero, setPedNumero] = useState("");
  const [pedCliente, setPedCliente] = useState("");
  const [pedStatus, setPedStatus] = useState("all");
  const [pedFrom, setPedFrom] = useState("");
  const [pedTo, setPedTo] = useState("");
  const [pedOrigem, setPedOrigem] = useState<"all" | "manual" | "simulacao">("all");

  // Sim filters
  const [simTitulo, setSimTitulo] = useState("");
  const [simCliente, setSimCliente] = useState("");
  const [simStatus, setSimStatus] = useState("all");
  const [simFrom, setSimFrom] = useState("");
  const [simTo, setSimTo] = useState("");
  const [simResp, setSimResp] = useState("all");
  const [simConv, setSimConv] = useState<"all" | "yes" | "no">("all");

  // Enrich pedidos com nome do cliente
  const clienteIds = useMemo(
    () => Array.from(new Set(pedidos.map((p: any) => p.cliente_id).filter(Boolean))),
    [pedidos],
  );
  const { data: clienteMap = new Map<string, string>() } = useQuery({
    queryKey: ["clientes-nomes", clienteIds],
    enabled: clienteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome")
        .in("id", clienteIds);
      if (error) throw error;
      return new Map<string, string>(
        (data ?? []).map((c: any) => [c.id, c.razao_social ?? c.nome ?? "—"]),
      );
    },
  });

  const responsaveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sims as any[]) {
      if (s.created_by && s.responsavel_nome) map.set(s.created_by, s.responsavel_nome);
    }
    return Array.from(map.entries());
  }, [sims]);

  const filteredPed = useMemo(() => {
    return pedidos.filter((p: any) => {
      const cliNome = clienteMap.get(p.cliente_id) ?? "";
      if (pedNumero && !p.numero.toLowerCase().includes(pedNumero.toLowerCase()))
        return false;
      if (pedCliente && !cliNome.toLowerCase().includes(pedCliente.toLowerCase()))
        return false;
      if (pedStatus !== "all" && p.status !== pedStatus) return false;
      if (!withinRange(p.created_at, pedFrom, pedTo)) return false;
      if (pedOrigem === "manual" && p.origin_simulation_id) return false;
      if (pedOrigem === "simulacao" && !p.origin_simulation_id) return false;
      return true;
    });
  }, [pedidos, clienteMap, pedNumero, pedCliente, pedStatus, pedFrom, pedTo, pedOrigem]);

  const filteredSim = useMemo(() => {
    return (sims as any[]).filter((s) => {
      if (simTitulo && !(s.titulo ?? "").toLowerCase().includes(simTitulo.toLowerCase()))
        return false;
      if (
        simCliente &&
        !(s.cliente_nome ?? "").toLowerCase().includes(simCliente.toLowerCase())
      )
        return false;
      if (simStatus !== "all" && s.status !== simStatus) return false;
      if (!withinRange(s.created_at, simFrom, simTo)) return false;
      if (simResp !== "all" && s.created_by !== simResp) return false;
      if (simConv === "yes" && !s.converted_order_id) return false;
      if (simConv === "no" && s.converted_order_id) return false;
      return true;
    });
  }, [sims, simTitulo, simCliente, simStatus, simFrom, simTo, simResp, simConv]);




  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Pedidos e Simulações</h1>
        <p className="text-sm text-muted-foreground">
          Visualize pedidos oficiais e simulações técnicas realizadas pela equipe do
          parceiro.
        </p>
      </div>

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos ({pedidos.length})</TabsTrigger>
          <TabsTrigger value="simulacoes">Simulações ({sims.length})</TabsTrigger>
        </TabsList>

        {/* ============ PEDIDOS ============ */}
        <TabsContent value="pedidos" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pedidos</CardTitle>
              <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6 pt-2">
                <Input
                  placeholder="Buscar número..."
                  value={pedNumero}
                  onChange={(e) => setPedNumero(e.target.value)}
                />
                <Input
                  placeholder="Buscar cliente..."
                  value={pedCliente}
                  onChange={(e) => setPedCliente(e.target.value)}
                />
                <Select value={pedStatus} onValueChange={setPedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="pendente">Enviado</SelectItem>
                    <SelectItem value="em_analise_comercial">Em análise comercial</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="em_producao">Em produção</SelectItem>
                    <SelectItem value="entregue">Entregue</SelectItem>
                    <SelectItem value="faturado">Faturado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={pedOrigem}
                  onValueChange={(v: any) => setPedOrigem(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda origem</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="simulacao">Convertido de simulação</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={pedFrom}
                  onChange={(e) => setPedFrom(e.target.value)}
                />
                <Input
                  type="date"
                  value={pedTo}
                  onChange={(e) => setPedTo(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loadingPed ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : filteredPed.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum pedido encontrado.
                </div>
              ) : (
                <>
                  {/* Cards mobile */}
                  <div className="grid gap-2 md:hidden">
                    {filteredPed.map((o: any) => (
                      <button
                        key={o.id}
                        onClick={() => setOpenPedido(o.id)}
                        className="text-left rounded-md border p-3 space-y-1 bg-card hover:bg-accent/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-mono font-semibold">{o.numero}</div>
                          <Badge variant={partnerOrderStatusVariantForPartner(o.status)}>
                            {partnerOrderStatusLabelForPartner(o.status)}
                          </Badge>
                        </div>
                        <div className="text-sm">
                          {clienteMap.get(o.cliente_id) ?? "—"}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{fd(o.created_at)}</span>
                          <span className="font-semibold text-foreground">
                            {brl(Number(o.total ?? 0))}
                          </span>
                        </div>
                        {o.origin_simulation_id ? (
                          <Badge variant="outline" className="text-[10px]">
                            <FlaskConical className="h-3 w-3 mr-1" /> Originado de
                            simulação
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Manual
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                  {/* Tabela desktop */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Entrega prev.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPed.map((o: any) => (
                        <TableRow
                          key={o.id}
                          onClick={() => setOpenPedido(o.id)}
                          className="cursor-pointer hover:bg-accent/40"
                        >
                          <TableCell className="font-mono">{o.numero}</TableCell>
                          <TableCell className="text-sm">
                            {clienteMap.get(o.cliente_id) ?? "—"}
                          </TableCell>
                          <TableCell>{fd(o.created_at)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={partnerOrderStatusVariantForPartner(o.status)}
                            >
                              {partnerOrderStatusLabelForPartner(o.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {o.origin_simulation_id ? (
                              <Badge variant="outline" className="text-[10px]">
                                <FlaskConical className="h-3 w-3 mr-1" /> Simulação
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Manual
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {o.estimated_delivery_date
                              ? fd(o.estimated_delivery_date)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {brl(Number(o.total ?? 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {o.origin_simulation_id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Ver simulação de origem"
                                  onClick={(e) => { e.stopPropagation(); setOpenSim(o.origin_simulation_id); }}
                                >
                                  <FlaskConical className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setOpenPedido(o.id); }}
                              >
                                <Eye className="h-4 w-4 mr-1" /> Detalhe
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ SIMULAÇÕES ============ */}
        <TabsContent value="simulacoes" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simulações</CardTitle>
              <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6 pt-2">
                <Input
                  placeholder="Buscar título..."
                  value={simTitulo}
                  onChange={(e) => setSimTitulo(e.target.value)}
                />
                <Input
                  placeholder="Buscar cliente..."
                  value={simCliente}
                  onChange={(e) => setSimCliente(e.target.value)}
                />
                <Select value={simStatus} onValueChange={setSimStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="enviada_gestor">Enviada ao gestor</SelectItem>
                    <SelectItem value="convertida_pedido">Convertida em pedido</SelectItem>
                    <SelectItem value="arquivada">Arquivada</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={simResp} onValueChange={setSimResp}>
                  <SelectTrigger>
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos responsáveis</SelectItem>
                    {responsaveis.map(([id, nome]) => (
                      <SelectItem key={id} value={id}>
                        {nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={simConv}
                  onValueChange={(v: any) => setSimConv(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Conversão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="yes">Convertidas</SelectItem>
                    <SelectItem value="no">Não convertidas</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={simFrom}
                    onChange={(e) => setSimFrom(e.target.value)}
                  />
                  <Input
                    type="date"
                    value={simTo}
                    onChange={(e) => setSimTo(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSim ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : filteredSim.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhuma simulação encontrada.
                </div>
              ) : (
                <>
                  {/* Cards mobile */}
                  <div className="grid gap-2 md:hidden">
                    {filteredSim.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => setOpenSim(s.id)}
                        className="text-left rounded-md border p-3 space-y-1 bg-card hover:bg-accent/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">
                            {s.titulo ?? "Simulação"}
                          </div>
                          <Badge variant="secondary">
                            {SIM_STATUS_LABEL[s.status] ?? s.status}
                          </Badge>
                        </div>
                        <div className="text-sm">{s.cliente_nome ?? "—"}</div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{s.responsavel_nome ?? "—"}</span>
                          <span className="font-semibold text-foreground">
                            {brl(Number(s.total_cheio ?? 0))}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            Valor de tabela
                          </Badge>
                          {s.converted_order_id && (
                            <Badge className="text-[10px]">
                              <ClipboardList className="h-3 w-3 mr-1" /> Convertida em
                              pedido
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Tabela desktop */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total tabela</TableHead>
                        <TableHead>Pedido gerado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSim.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">
                            {String(s.id).slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{s.titulo ?? "—"}</div>
                            <Badge variant="outline" className="text-[10px] mt-1">
                              Valor de tabela
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.cliente_nome ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.responsavel_nome ?? "—"}
                          </TableCell>
                          <TableCell>{fd(s.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {SIM_STATUS_LABEL[s.status] ?? s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {brl(Number(s.total_cheio ?? 0))}
                          </TableCell>
                          <TableCell>
                            {s.converted_order_id ? (
                              <Button
                                size="sm"
                                variant="link"
                                className="h-auto p-0"
                                onClick={() => setOpenPedido(s.converted_order_id)}
                              >
                                {s.converted_order_numero ?? "Ver pedido"}
                                <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setOpenSim(s.id)}
                            >
                              <Eye className="h-4 w-4 mr-1" /> Detalhe
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DetalhePedidoDrawer
        orderId={openPedido}
        open={!!openPedido}
        onOpenChange={(o) => !o && setOpenPedido(null)}
        viewerScope="parceiro_gestor"
      />
      <DetalheSimulacaoDrawer
        simulationId={openSim}
        open={!!openSim}
        onOpenChange={(o) => !o && setOpenSim(null)}
        viewerScope="parceiro_gestor"
      />
    </div>
  );
}
