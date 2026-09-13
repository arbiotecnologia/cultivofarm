import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Eye,
  Clock, AlertTriangle, Factory, Truck, ClipboardCheck, Search,
  FileText, Package, Sprout, History,
} from "lucide-react";
import { OSFlowTimeline } from "@/components/visita/OSFlowTimeline";
import { formatDateDisplay } from "@/lib/date-utils";
import { RecomendacaoChat } from "@/components/shared/RecomendacaoChat";
import {
  matchTexto,
  podeDecidirPorPapel,
  textoOuTraco,
  MSG_DECISAO_INDISPONIVEL,
  MSG_GERACAO_OS_INDISPONIVEL,
  RPC_GERACAO_OS_DISPONIVEL,
} from "@/lib/fluxo-tecnico/fluxo";

const STATUS_OS_ONFARM: Record<string, { label: string; color: string }> = {
  aberta: { label: "Aberta", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  aprovada: { label: "Aprovada", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  programada: { label: "Programada", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  em_producao: { label: "Em Produção", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  em_cq: { label: "Controle Qualidade", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  envase: { label: "Envase", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  pronto_entrega: { label: "Pronto Entrega", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  entregue: { label: "Entregue", color: "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  finalizada: { label: "Finalizada", color: "bg-muted text-muted-foreground" },
  cancelada: { label: "Cancelada", color: "bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

/** Colunas mínimas realmente exibidas na fila de aprovação. */
const SELECT_PENDENTES =
  "id, status, data_vistoria, created_at, cliente_id, fazenda_id, talhao_id, solicitacao_id, proxima_acao_recomendada, clientes(nome), fazendas(nome), talhoes(nome)";

/** Colunas mínimas usadas apenas para o KPI de aprovadas. */
const SELECT_APROVACOES = "id, status_aprovacao, created_at";

/** Colunas mínimas exibidas na aba de OS On-Farm. */
const SELECT_OS_ONFARM =
  "id, numero_os, status, origem, created_at, registro_consultor_id, clientes(nome), fazendas(nome)";

export default function FluxoTecnico() {
  const { role } = useAuth();
  const [searchAprov, setSearchAprov] = useState("");
  const [searchOS, setSearchOS] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedRegistro, setSelectedRegistro] = useState<any>(null);
  const [showReview, setShowReview] = useState(false);
  const [selectedOS, setSelectedOS] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  const papelDecide = podeDecidirPorPapel(role);

  const {
    data: pendentes = [],
    refetch: refetchPendentes,
    isLoading: loadingPendentes,
    isError: errorPendentes,
    isFetching: fetchingPendentes,
  } = useQuery({
    queryKey: ["fluxo-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor")
        .select(SELECT_PENDENTES)
        .eq("status", "enviado_aprovacao")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 300000,
  });

  const {
    data: aprovacoes = [],
    refetch: refetchAprovacoes,
    isLoading: loadingAprovacoes,
    isError: errorAprovacoes,
    isFetching: fetchingAprovacoes,
  } = useQuery({
    queryKey: ["aprovacoes-todas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aprovacoes_tecnicas")
        .select(SELECT_APROVACOES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 300000,
  });

  const {
    data: ordensOnFarm = [],
    refetch: refetchOS,
    isLoading: loadingOS,
    isError: errorOS,
    isFetching: fetchingOS,
  } = useQuery({
    queryKey: ["os-onfarm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordens_servico_onfarm")
        .select(SELECT_OS_ONFARM)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 300000,
  });

  const limparSelecao = () => {
    setSelectedRegistro(null);
  };

  const fecharRevisao = () => {
    setShowReview(false);
    limparSelecao();
  };

  const openReview = (registro: any) => {
    limparSelecao();
    setSelectedRegistro(registro);
    setShowReview(true);
  };

  const filteredPendentes = pendentes.filter((r) =>
    matchTexto([r.clientes?.nome, r.fazendas?.nome, r.talhoes?.nome], searchAprov),
  );

  const filteredOS = ordensOnFarm.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    return matchTexto([o.numero_os, o.clientes?.nome, o.fazendas?.nome], searchOS);
  });

  // KPIs: falha nunca vira zero.
  const kpiPendentes = errorPendentes || loadingPendentes ? "—" : pendentes.length;
  const kpiAprovados =
    errorAprovacoes || loadingAprovacoes
      ? "—"
      : aprovacoes.filter((a: any) => a.status_aprovacao === "aprovado").length;
  const kpiIndisponivelOS = errorOS || loadingOS;
  const kpiOSAbertas = kpiIndisponivelOS
    ? "—"
    : ordensOnFarm.filter((o: any) => ["aberta", "aprovada", "programada"].includes(o.status)).length;
  const kpiEmProducao = kpiIndisponivelOS
    ? "—"
    : ordensOnFarm.filter((o: any) => o.status === "em_producao").length;
  const kpiProntas = kpiIndisponivelOS
    ? "—"
    : ordensOnFarm.filter((o: any) => o.status === "pronto_entrega").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Fluxo Técnico e Aprovação</h1>
        <p className="text-sm text-muted-foreground">Aprovação de recomendações e acompanhamento de ordens de serviço.</p>
      </div>

      {!RPC_APROVACAO_TRANSACIONAL_DISPONIVEL && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">{MSG_DECISAO_INDISPONIVEL}</p>
            <p className="text-muted-foreground">
              As decisões (aprovar, solicitar ajuste e reprovar) exigem gravação única no servidor. Enquanto isso,
              a fila permanece disponível apenas para consulta.
            </p>
          </div>
        </div>
      )}

      {errorAprovacoes && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <p className="text-sm text-destructive">Não foi possível carregar os indicadores de aprovação.</p>
          <Button variant="outline" size="sm" disabled={fetchingAprovacoes} onClick={() => { void refetchAprovacoes(); }}>
            {fetchingAprovacoes ? "Tentando..." : "Tentar novamente"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Pendentes" value={kpiPendentes} icon={Clock} color="text-yellow-500" />
        <KpiCard label="Aprovadas" value={kpiAprovados} icon={CheckCircle} color="text-green-500" />
        <KpiCard label="OS Abertas" value={kpiOSAbertas} icon={FileText} color="text-blue-500" />
        <KpiCard label="Em Produção" value={kpiEmProducao} icon={Factory} color="text-purple-500" />
        <KpiCard label="Prontas" value={kpiProntas} icon={Truck} color="text-emerald-500" />
      </div>

      <Tabs defaultValue="aprovacoes" className="w-full">
        <TabsList>
          <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
          <TabsTrigger value="os-onfarm">OS On-Farm</TabsTrigger>
        </TabsList>
        <TabsContent value="aprovacoes" className="space-y-4 pt-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, fazenda ou talhão..."
              aria-label="Buscar recomendação por cliente, fazenda ou talhão"
              value={searchAprov}
              onChange={(e) => setSearchAprov(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fazenda</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPendentes ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : errorPendentes ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <p className="text-sm text-destructive">Não foi possível carregar a fila de aprovação.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => { void refetchPendentes(); }}
                        disabled={fetchingPendentes}
                      >
                        {fetchingPendentes ? "Tentando..." : "Tentar novamente"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : filteredPendentes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {searchAprov.trim() ? "Nenhuma recomendação corresponde à busca." : "Nenhuma recomendação pendente."}
                    </TableCell>
                  </TableRow>
                ) : filteredPendentes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDateDisplay(r.data_vistoria) || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.solicitacao_id ? "secondary" : "outline"} className="text-[10px]">
                        {r.solicitacao_id ? "Demanda" : "Rotina"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{textoOuTraco(r.clientes?.nome)}</TableCell>
                    <TableCell>{textoOuTraco(r.fazendas?.nome)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openReview(r)}><Eye className="h-4 w-4 mr-1" /> Revisar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="os-onfarm" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar por nº da OS, cliente ou fazenda..."
              aria-label="Buscar ordem de serviço por número, cliente ou fazenda"
              value={searchOS}
              onChange={(e) => setSearchOS(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]" aria-label="Filtrar ordens por status"><SelectValue placeholder="Filtrar Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                {Object.entries(STATUS_OS_ONFARM).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingOS ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : errorOS ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <p className="text-sm text-destructive">Não foi possível carregar as ordens de serviço.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => { void refetchOS(); }}
                        disabled={fetchingOS}
                      >
                        {fetchingOS ? "Tentando..." : "Tentar novamente"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : filteredOS.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {searchOS.trim() || filterStatus !== "all"
                        ? "Nenhuma OS corresponde aos filtros aplicados."
                        : "Nenhuma OS encontrada."}
                    </TableCell>
                  </TableRow>
                ) : filteredOS.map((o) => {
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono font-bold">{textoOuTraco(o.numero_os)}</TableCell>
                      <TableCell>{textoOuTraco(o.clientes?.nome)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {o.origem === "recomendacao_tecnica" ? "Rec. Técnica" : "Direta"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_OS_ONFARM[o.status]?.color}>{STATUS_OS_ONFARM[o.status]?.label || textoOuTraco(o.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Ver histórico da OS ${o.numero_os ?? ""}`}
                          onClick={() => { setSelectedOS(o); setShowHistory(true); }}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={showReview} onOpenChange={(open) => { if (!open) fecharRevisao(); else setShowReview(true); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Revisão Técnica</SheetTitle></SheetHeader>
          {selectedRegistro && (
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <h3 className="font-bold flex items-center gap-2"><Sprout className="h-4 w-4" /> Diagnóstico</h3>
                <div className="text-sm grid grid-cols-2 gap-2">
                  <div className="col-span-2 font-medium text-lg">{textoOuTraco(selectedRegistro.clientes?.nome)}</div>
                  <div className="text-muted-foreground">Fazenda:</div><div>{textoOuTraco(selectedRegistro.fazendas?.nome)}</div>
                  <div className="text-muted-foreground">Talhão:</div><div>{textoOuTraco(selectedRegistro.talhoes?.nome)}</div>
                </div>
              </div>
              <Separator />
              <ChatRecomendacoesRegistro registroId={selectedRegistro.id} />
              <Separator />
              {!papelDecide ? (
                <p className="text-xs text-muted-foreground italic">
                  Seu perfil pode acompanhar a revisão, mas a decisão é exclusiva de administrador ou gestor.
                </p>
              ) : (
                <p role="alert" className="text-sm text-destructive">{MSG_DECISAO_INDISPONIVEL}</p>
              )}
              {!RPC_GERACAO_OS_DISPONIVEL
                && selectedRegistro.proxima_acao_recomendada === "gerar_os" && (
                <p className="text-xs text-muted-foreground">{MSG_GERACAO_OS_INDISPONIVEL}</p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={showHistory} onOpenChange={(open) => { setShowHistory(open); if (!open) setSelectedOS(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico da OS {textoOuTraco(selectedOS?.numero_os)}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="text-sm grid grid-cols-2 gap-2">
              <div className="text-muted-foreground">Cliente:</div><div>{textoOuTraco(selectedOS?.clientes?.nome)}</div>
              <div className="text-muted-foreground">Fazenda:</div><div>{textoOuTraco(selectedOS?.fazendas?.nome)}</div>
              <div className="text-muted-foreground">Status atual:</div>
              <div>{STATUS_OS_ONFARM[selectedOS?.status]?.label || textoOuTraco(selectedOS?.status)}</div>
            </div>
            <Separator />
            {selectedOS?.registro_consultor_id ? (
              <OSFlowTimeline registroId={selectedOS.registro_consultor_id} />
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Esta OS não tem recomendação técnica de origem, portanto não há linha do tempo de fluxo.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: any) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-bold mt-1">{value}</h3>
        </div>
        <Icon className={`h-8 w-8 ${color} opacity-20`} />
      </CardContent>
    </Card>
  );
}

function ChatRecomendacoesRegistro({ registroId }: { registroId: string }) {
  const { data: recs = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["recs_chat_registro", registroId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("id")
        .eq("registro_consultor_id", registroId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Carregando conversa...</p>;
  }

  if (isError) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-destructive">Não foi possível carregar a conversa com o produtor.</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => { void refetch(); }}>
          {isFetching ? "Tentando..." : "Tentar novamente"}
        </Button>
      </div>
    );
  }

  if (recs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        A conversa com o produtor será habilitada após salvar a recomendação.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-bold flex items-center gap-2 text-sm">
        <MessageSquare className="h-4 w-4" /> Conversa com o produtor
      </h3>
      <RecomendacaoChat recomendacaoId={recs[0].id} defaultOpen compact />
    </div>
  );
}
