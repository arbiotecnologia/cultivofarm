import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, Info } from "lucide-react";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { brl } from "@/lib/financial/format";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import {
  useProdutorPedidos,
  useProdutorSimulacoes,
} from "@/hooks/useProdutorSolicitacoes";
import {
  partnerOrderStatusLabelForPartner,
  partnerOrderStatusVariantForPartner,
} from "@/lib/partnerOrderStatus";
import { DetalhePedidoDrawer } from "@/components/pedidos-b2b/DetalhePedidoDrawer";
import { DetalheSimulacaoDrawer } from "@/components/pedidos-b2b/DetalheSimulacaoDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SIM_STATUS_LABEL: Record<string, string> = {
  enviada_gestor: "Em análise",
  convertida_pedido: "Convertida em pedido",
};

const HIDDEN_SIM_STATUS = new Set(["rascunho", "arquivada"]);

export default function PortalMeusPedidos() {
  const { clienteId, clienteNome, loading } = usePortalCliente();
  const { data: pedidos = [], isLoading: loadingPed } = useProdutorPedidos(clienteId);
  const { data: simsRaw = [], isLoading: loadingSim } = useProdutorSimulacoes(clienteId);
  const [statusPed, setStatusPed] = useState("all");
  const [openPedido, setOpenPedido] = useState<string | null>(null);
  const [openSim, setOpenSim] = useState<string | null>(null);

  const sims = useMemo(
    () => simsRaw.filter((s) => !HIDDEN_SIM_STATUS.has(s.status)),
    [simsRaw],
  );

  const pedidoNumeroById = useMemo(() => {
    const m = new Map<string, string>();
    pedidos.forEach((p) => m.set(p.id, p.numero));
    return m;
  }, [pedidos]);

  const filteredPed = useMemo(
    () => (statusPed === "all" ? pedidos : pedidos.filter((p) => p.status === statusPed)),
    [pedidos, statusPed],
  );

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!clienteId) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nenhum cliente vinculado ao seu usuário. Peça ao seu parceiro comercial para
            vincular seu cadastro.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Pedidos e Simulações B2B</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe pedidos realizados por parceiros vinculados ao seu cadastro
          {clienteNome ? ` (${clienteNome})` : ""} e simulações técnicas liberadas para
          visualização.
        </p>
      </div>

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos ({pedidos.length})</TabsTrigger>
          <TabsTrigger value="simulacoes">Simulações ({sims.length})</TabsTrigger>
        </TabsList>

        {/* PEDIDOS */}
        <TabsContent value="pedidos" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center gap-2">
              <CardTitle className="text-base flex-1">Pedidos</CardTitle>
              <Select value={statusPed} onValueChange={setStatusPed}>
                <SelectTrigger className="w-full md:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pendente">Enviado</SelectItem>
                  <SelectItem value="em_analise_comercial">Em análise</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="em_producao">Em produção</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="faturado">Faturado</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loadingPed ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : filteredPed.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum pedido B2B foi vinculado ao seu cadastro até o momento.
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Parceiro</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Prev. entrega</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPed.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono">{o.numero}</TableCell>
                            <TableCell className="text-sm">
                              {o.partner_nome ?? "—"}
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
                              {o.estimated_delivery_date
                                ? fd(o.estimated_delivery_date)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">{brl(o.total)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setOpenPedido(o.id)}
                              >
                                <Eye className="h-4 w-4 mr-1" /> Detalhe
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {filteredPed.map((o) => (
                      <div
                        key={o.id}
                        className="border rounded-lg p-3 space-y-2 bg-card"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-sm">{o.numero}</div>
                            <div className="text-xs text-muted-foreground">
                              {o.partner_nome ?? "—"}
                            </div>
                          </div>
                          <Badge variant={partnerOrderStatusVariantForPartner(o.status)}>
                            {partnerOrderStatusLabelForPartner(o.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-muted-foreground">Data</div>
                            <div>{fd(o.created_at)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Prev. entrega</div>
                            <div>
                              {o.estimated_delivery_date
                                ? fd(o.estimated_delivery_date)
                                : "—"}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-muted-foreground">Total</div>
                            <div className="font-medium">{brl(o.total)}</div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setOpenPedido(o.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" /> Detalhe
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIMULAÇÕES */}
        <TabsContent value="simulacoes" className="space-y-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Simulação técnica com valores de tabela. Condições finais podem variar
              conforme pedido oficial.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simulações</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSim ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : sims.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma simulação técnica foi liberada para seu cadastro.
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Título</TableHead>
                          <TableHead>Parceiro</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor tabela</TableHead>
                          <TableHead>Pedido gerado</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sims.map((s) => {
                          const numPed = s.converted_order_id
                            ? pedidoNumeroById.get(s.converted_order_id)
                            : null;
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-mono text-xs">
                                {s.id.slice(0, 8)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {s.titulo ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {s.partner_nome ?? "—"}
                              </TableCell>
                              <TableCell>{fd(s.created_at)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {SIM_STATUS_LABEL[s.status] ?? s.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {brl(s.total_cheio)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {numPed ? (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0 font-mono"
                                    onClick={() => setOpenPedido(s.converted_order_id!)}
                                  >
                                    {numPed}
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
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
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {sims.map((s) => {
                      const numPed = s.converted_order_id
                        ? pedidoNumeroById.get(s.converted_order_id)
                        : null;
                      return (
                        <div
                          key={s.id}
                          className="border rounded-lg p-3 space-y-2 bg-card"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {s.titulo ?? "Simulação"}
                              </div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {s.id.slice(0, 8)}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {s.partner_nome ?? "—"}
                              </div>
                            </div>
                            <Badge variant="secondary">
                              {SIM_STATUS_LABEL[s.status] ?? s.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-muted-foreground">Data</div>
                              <div>{fd(s.created_at)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Valor tabela</div>
                              <div className="font-medium">{brl(s.total_cheio)}</div>
                            </div>
                            {numPed && (
                              <div className="col-span-2">
                                <div className="text-muted-foreground">Pedido gerado</div>
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 font-mono"
                                  onClick={() => setOpenPedido(s.converted_order_id!)}
                                >
                                  {numPed}
                                </Button>
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => setOpenSim(s.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" /> Detalhe
                          </Button>
                        </div>
                      );
                    })}
                  </div>
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
        viewerScope="produtor"
      />
      <DetalheSimulacaoDrawer
        simulationId={openSim}
        open={!!openSim}
        onOpenChange={(o) => !o && setOpenSim(null)}
        viewerScope="produtor"
      />
    </div>
  );
}
