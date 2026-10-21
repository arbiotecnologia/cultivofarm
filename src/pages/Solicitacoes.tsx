import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { isToday, isThisWeek, isThisMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Filter,
  UserCheck,
  Eye,
  AlertTriangle,
  Calendar,
  MapPin,
  User,
  Clock,
  X,
} from "lucide-react";
import { ptBR } from "date-fns/locale";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { toast } from "sonner";
import { TimelineAtendimento, TimelineEvent } from "@/components/solicitacoes/TimelineAtendimento";
import { SolicitacaoDetalheTabs } from "@/components/solicitacoes/SolicitacaoDetalheTabs";
import { SolicitacaoActions } from "@/components/solicitacoes/SolicitacaoActions";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aberta: "Aberta",
  em_triagem: "Em triagem",
  atribuida: "Atribuída",
  em_deslocamento: "Em deslocamento",
  checkin_realizado: "Check-in realizado",
  em_visita: "Em visita",
  aguardando_recomendacao: "Aguard. recomendação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const URGENCIA_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  baixa: "outline",
  media: "secondary",
  alta: "default",
  critica: "destructive",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  aberta: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  em_triagem: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  atribuida: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  em_deslocamento: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  checkin_realizado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  em_visita: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  aguardando_recomendacao: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  concluida: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelada: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export default function Solicitacoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "todos");
  const [urgenciaFilter, setUrgenciaFilter] = useState<string>(searchParams.get("urgencia") || "todas");
  const [origemFilter, setOrigemFilter] = useState<string>(searchParams.get("origem") || "todas");
  const [clienteFilter, setClienteFilter] = useState<string>(searchParams.get("cliente") || "todos");
  const [fazendaFilter, setFazendaFilter] = useState<string>(searchParams.get("fazenda") || "todas");
  const [talhaoFilter, setTalhaoFilter] = useState<string>(searchParams.get("talhao") || "todos");
  const [consultorFilter, setConsultorFilter] = useState<string>(searchParams.get("consultor") || "todos");
  const [periodoFilter, setPeriodoFilter] = useState<string>(searchParams.get("periodo") || "tudo");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; solicitacaoId?: string }>({
    open: false,
  });
  const [selectedConsultor, setSelectedConsultor] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");

  const { data: solicitacoes, isLoading } = useQuery({
    queryKey: ["solicitacoes-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_solicitacoes")
        .select(`
          id, status, urgencia, tipo_demanda, consultor_atribuido, created_at, numero_solicitacao, descricao, cliente_id, fazenda_id, talhao_id, data_prevista_atendimento, origem_solicitacao, updated_at,
          clientes:cliente_id (nome),
          fazendas:fazenda_id (nome),
          talhoes:talhao_id (nome)
        `)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  const { data: consultores } = useQuery({
    queryKey: ["consultores-disponiveis"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["consultor_tecnico", "tecnico_agronomo"]);
      const userIds = (roles || []).map((r) => r.user_id);
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, nome, email")
        .in("user_id", userIds);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-todos-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome");
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: fazendas } = useQuery({
    queryKey: ["fazendas-filter", clienteFilter],
    queryFn: async () => {
      let q = supabase.from("fazendas").select("id, nome, cliente_id").order("nome");
      if (clienteFilter !== "todos") q = q.eq("cliente_id", clienteFilter);
      const { data } = await q;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: talhoes } = useQuery({
    queryKey: ["talhoes-filter", fazendaFilter],
    queryFn: async () => {
      if (fazendaFilter === "todas") return [];
      const { data } = await supabase
        .from("talhoes")
        .select("id, nome, fazenda_id")
        .eq("fazenda_id", fazendaFilter)
        .order("nome");
      return data || [];
    },
    enabled: fazendaFilter !== "todas",
    staleTime: 5 * 60_000,
  });

  // Sync filters → URL (deep-link)
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set("q", debouncedSearch);
    if (statusFilter !== "todos") next.set("status", statusFilter);
    if (urgenciaFilter !== "todas") next.set("urgencia", urgenciaFilter);
    if (origemFilter !== "todas") next.set("origem", origemFilter);
    if (clienteFilter !== "todos") next.set("cliente", clienteFilter);
    if (fazendaFilter !== "todas") next.set("fazenda", fazendaFilter);
    if (talhaoFilter !== "todos") next.set("talhao", talhaoFilter);
    if (consultorFilter !== "todos") next.set("consultor", consultorFilter);
    if (periodoFilter !== "tudo") next.set("periodo", periodoFilter);
    setSearchParams(next, { replace: true });
  }, [search, statusFilter, urgenciaFilter, origemFilter, clienteFilter, fazendaFilter, talhaoFilter, consultorFilter, periodoFilter, setSearchParams]);

  const filtered = useMemo(
    () =>
      (solicitacoes || []).filter((s: any) => {
        if (statusFilter !== "todos" && s.status !== statusFilter) return false;
        if (urgenciaFilter !== "todas" && s.urgencia !== urgenciaFilter) return false;
        if (origemFilter !== "todas" && (s.origem_solicitacao || "portal_produtor") !== origemFilter) return false;
        if (clienteFilter !== "todos" && s.cliente_id !== clienteFilter) return false;
        if (fazendaFilter !== "todas" && s.fazenda_id !== fazendaFilter) return false;
        if (talhaoFilter !== "todos" && s.talhao_id !== talhaoFilter) return false;
        if (consultorFilter !== "todos") {
          if (consultorFilter === "sem" && s.consultor_atribuido) return false;
          if (consultorFilter !== "sem" && s.consultor_atribuido !== consultorFilter) return false;
        }
        if (periodoFilter !== "tudo") {
          const dt = new Date(s.created_at);
          if (periodoFilter === "hoje" && !isToday(dt)) return false;
          if (periodoFilter === "semana" && !isThisWeek(dt, { weekStartsOn: 1 })) return false;
          if (periodoFilter === "mes" && !isThisMonth(dt)) return false;
        }
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          const hay = `${s.numero_solicitacao || ""} ${s.tipo_demanda} ${s.descricao || ""} ${s.clientes?.nome || ""} ${s.fazendas?.nome || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [solicitacoes, statusFilter, urgenciaFilter, origemFilter, clienteFilter, fazendaFilter, talhaoFilter, consultorFilter, periodoFilter, debouncedSearch]
  );

  const hojeStr = new Date().toISOString().slice(0, 10);
  const counts = {
    abertas: (solicitacoes || []).filter((s: any) =>
      ["pendente", "aberta", "em_triagem"].includes(s.status)
    ).length,
    criticas: (solicitacoes || []).filter((s: any) =>
      s.urgencia === "critica" && !["concluida", "cancelada"].includes(s.status)
    ).length,
    agendadasHoje: (solicitacoes || []).filter((s: any) =>
      s.data_prevista_atendimento && String(s.data_prevista_atendimento).slice(0, 10) === hojeStr
    ).length,
    semConsultor: (solicitacoes || []).filter((s: any) =>
      !s.consultor_atribuido && !["concluida", "cancelada"].includes(s.status)
    ).length,
    emVisita: (solicitacoes || []).filter((s: any) =>
      ["em_deslocamento", "checkin_realizado", "em_visita"].includes(s.status)
    ).length,
    concluidas: (solicitacoes || []).filter((s: any) => s.status === "concluida").length,
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignDialog.solicitacaoId || !selectedConsultor || !user) return;
      const { error: e1 } = await supabase.from("solicitacoes_atribuicoes").insert({
        solicitacao_id: assignDialog.solicitacaoId,
        consultor_id: selectedConsultor,
        atribuido_por: user.id,
        observacoes: observacoes || null,
        status: "atribuida",
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("portal_solicitacoes")
        .update({ status: "atribuida", consultor_atribuido: selectedConsultor })
        .eq("id", assignDialog.solicitacaoId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Consultor atribuído com sucesso");
      setAssignDialog({ open: false });
      setSelectedConsultor("");
      setObservacoes("");
      queryClient.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atribuir"),
  });

  const assumirMutation = useMutation({
    mutationFn: async (solicitacaoId: string) => {
      if (!user) return;
      await supabase.from("solicitacoes_atribuicoes").insert({
        solicitacao_id: solicitacaoId,
        consultor_id: user.id,
        atribuido_por: user.id,
        status: "aceita",
      });
      await supabase
        .from("portal_solicitacoes")
        .update({ status: "atribuida", consultor_atribuido: user.id })
        .eq("id", solicitacaoId);
    },
    onSuccess: () => {
      toast.success("Atendimento assumido");
      queryClient.invalidateQueries({ queryKey: ["solicitacoes-admin"] });
    },
  });

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">Solicitações de Atendimento</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Gerencie demandas de campo, atribua consultores e acompanhe o atendimento
          </p>
        </div>
      </div>

      {/* Stats - 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Abertas</p>
            <p className="text-2xl font-bold text-foreground">{counts.abertas}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Críticas</p>
            <p className="text-2xl font-bold text-destructive">{counts.criticas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Agendadas hoje</p>
            <p className="text-2xl font-bold text-foreground">{counts.agendadasHoje}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Sem consultor</p>
            <p className="text-2xl font-bold text-foreground">{counts.semConsultor}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Em visita</p>
            <p className="text-2xl font-bold text-foreground">{counts.emVisita}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-2xl font-bold text-foreground">{counts.concluidas}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3 border-b mb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, fazenda ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <Badge 
                  variant={statusFilter === "todos" && urgenciaFilter === "todas" && clienteFilter === "todos" ? "default" : "outline"}
                  className="cursor-pointer whitespace-nowrap"
                  onClick={() => { setStatusFilter("todos"); setUrgenciaFilter("todas"); setClienteFilter("todos"); setPeriodoFilter("tudo"); setConsultorFilter("todos"); }}
                >
                  Todas
                </Badge>
                {statusFilter !== "todos" && <Badge variant="secondary" className="whitespace-nowrap">{STATUS_LABELS[statusFilter] || statusFilter} <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("todos")} /></Badge>}
                {urgenciaFilter !== "todas" && <Badge variant="secondary" className="whitespace-nowrap capitalize">{urgenciaFilter} <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setUrgenciaFilter("todas")} /></Badge>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={urgenciaFilter} onValueChange={setUrgenciaFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Urgência" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas urgências</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>

              <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Período" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tudo">Todo período</SelectItem>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="semana">Esta semana</SelectItem>
                  <SelectItem value="mes">Este mês</SelectItem>
                </SelectContent>
              </Select>

              <Select value={clienteFilter} onValueChange={(v) => { setClienteFilter(v); setFazendaFilter("todas"); setTalhaoFilter("todos"); }}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Cliente" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos clientes</SelectItem>
                  {(clientes || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fazendaFilter} onValueChange={(v) => { setFazendaFilter(v); setTalhaoFilter("todos"); }} disabled={clienteFilter === "todos"}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Fazenda" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas fazendas</SelectItem>
                  {(fazendas || []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={consultorFilter} onValueChange={setConsultorFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Consultor" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos consultores</SelectItem>
                  <SelectItem value="sem">Sem consultor</SelectItem>
                  {(consultores || []).map((c: any) => (
                    <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0" />
      </Card>

      {/* List */}
      <div className="grid gap-3">
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhuma solicitação encontrada com esses filtros.
            </CardContent>
          </Card>
        )}
        {filtered.map((s: any) => {
          const isCritica = s.urgencia === "critica" && !["concluida", "cancelada"].includes(s.status);
          const isSemConsultor = !s.consultor_atribuido && !["concluida", "cancelada"].includes(s.status);
          const highlight = isCritica
            ? "border-l-4 border-l-destructive bg-destructive/5"
            : isSemConsultor
              ? "border-l-4 border-l-amber-500"
              : "";
          return (
          <Card key={s.id} className={`hover:shadow-md transition-shadow ${highlight}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.numero_solicitacao && (
                      <span className="text-xs font-mono text-muted-foreground">{s.numero_solicitacao}</span>
                    )}
                    <h3 className="font-semibold text-foreground">{s.tipo_demanda}</h3>
                    <Badge variant={URGENCIA_VARIANTS[s.urgencia] || "outline"}>
                      {s.urgencia}
                    </Badge>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || "bg-muted"}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                    {s.origem_solicitacao && s.origem_solicitacao !== "portal_produtor" && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {s.origem_solicitacao.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {s.clientes?.nome || "—"}
                    </span>
                    {s.fazendas?.nome && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {s.fazendas.nome}
                        {s.talhoes?.nome && ` › ${s.talhoes.nome}`}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDateTimeDisplay(s.created_at)}
                    </span>
                  </div>
                  {s.descricao && (
                    <p className="text-sm text-foreground/80 line-clamp-2">{s.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedId(s.id)}>
                    <Eye className="h-4 w-4 mr-1" />
                    Detalhes
                  </Button>
                  {!s.consultor_atribuido && (
                    <Button
                      size="sm"
                      onClick={() => setAssignDialog({ open: true, solicitacaoId: s.id })}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Atribuir
                    </Button>
                  )}
                  <SolicitacaoActions
                    solicitacao={s}
                    onOpenDetail={() => setSelectedId(s.id)}
                    onOpenAtribuir={() => setAssignDialog({ open: true, solicitacaoId: s.id })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      {/* Detail sheet */}
      <DetailSheet
        solicitacaoId={selectedId}
        onClose={() => setSelectedId(null)}
      />

      {/* Assign dialog */}
      <Dialog open={assignDialog.open} onOpenChange={(open) => !open && setAssignDialog({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir consultor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Consultor responsável</Label>
              <Select value={selectedConsultor} onValueChange={setSelectedConsultor}>
                <SelectTrigger><SelectValue placeholder="Selecione um consultor" /></SelectTrigger>
                <SelectContent>
                  {consultores?.map((c: any) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.nome || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Instruções para o consultor..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={!selectedConsultor || assignMutation.isPending}
            >
              Confirmar atribuição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailSheet({ solicitacaoId, onClose }: { solicitacaoId: string | null; onClose: () => void }) {
  const { data: solicitacao } = useQuery({
    queryKey: ["solicitacao-detalhe", solicitacaoId],
    queryFn: async () => {
      if (!solicitacaoId) return null;
      const { data } = await supabase
        .from("portal_solicitacoes")
        .select(`*, clientes:cliente_id(nome), fazendas:fazenda_id(nome), talhoes:talhao_id(nome)`)
        .eq("id", solicitacaoId)
        .single();
      return data;
    },
    enabled: !!solicitacaoId,
  });

  const { data: events } = useQuery({
    queryKey: ["solicitacao-timeline", solicitacaoId],
    queryFn: async (): Promise<TimelineEvent[]> => {
      if (!solicitacaoId) return [];
      const ev: TimelineEvent[] = [];

      if (solicitacao) {
        ev.push({
          id: "criacao",
          data: solicitacao.created_at,
          tipo: "solicitacao_criada",
          titulo: "Solicitação criada",
          descricao: solicitacao.tipo_demanda,
        });
      }

      // Atribuições
      const { data: atribs } = await supabase
        .from("solicitacoes_atribuicoes")
        .select("*")
        .eq("solicitacao_id", solicitacaoId)
        .order("data_atribuicao");
      (atribs || []).forEach((a: any) =>
        ev.push({
          id: `atrib-${a.id}`,
          data: a.data_atribuicao,
          tipo: "atribuicao",
          titulo: `Consultor ${a.status}`,
          descricao: a.observacoes,
        })
      );

      // Check-ins (com GPS e foto)
      const { data: checkins } = await supabase
        .from("visitas_checkin")
        .select("*")
        .eq("solicitacao_id", solicitacaoId)
        .order("data_hora_checkin");
      (checkins || []).forEach((c: any) =>
        ev.push({
          id: `chk-${c.id}`,
          data: c.data_hora_checkin,
          tipo: "checkin",
          titulo: `Check-in: ${String(c.tipo_checkin).replace(/_/g, " ")}`,
          descricao: c.observacoes || c.justificativa_sem_gps || null,
          gps: c.latitude != null && c.longitude != null
            ? { lat: Number(c.latitude), lng: Number(c.longitude) }
            : null,
          // foto_url legada do check-in não é consumida; fotos de check-in ficam em registros_consultor_arquivos.
        })
      );

      // Visitas (registros_consultor) ligadas e seus arquivos/recomendações
      const { data: registros } = await supabase
        .from("registros_consultor")
        .select("id, hora_inicio, hora_fim, status, objetivo_visita, problema_principal, observacoes_tecnicas")
        .eq("solicitacao_id", solicitacaoId);

      for (const reg of registros || []) {
        if (reg.hora_inicio) {
          ev.push({
            id: `vi-${reg.id}`,
            data: reg.hora_inicio,
            tipo: "visita_iniciada",
            titulo: "Visita iniciada",
            descricao: reg.objetivo_visita || null,
            link: { href: `/visita-tecnica/${reg.id}?from=solicitacoes`, label: "Abrir visita" },
          });
        }

        // Arquivos da visita
        const { data: arquivos } = await supabase
          .from("registros_consultor_arquivos")
          .select("id, arquivo_path, tipo_midia, tipo_arquivo, categoria_arquivo, legenda, capturado_em, uploaded_at, duracao_segundos")
          .eq("registro_consultor_id", reg.id)
          .order("uploaded_at");
        (arquivos || []).forEach((a: any) => {
          const when = a.capturado_em || a.uploaded_at;
          const isAudio = a.tipo_midia === "audio" || (a.tipo_arquivo || "").startsWith("audio");
          const isExtra = ["laudo", "documento_cliente", "recomendacao_anexa"].includes(a.categoria_arquivo);
          if (isAudio) {
            ev.push({
              id: `aud-${a.id}`,
              data: when,
              tipo: "audio_gravado",
              titulo: "Áudio anexado",
              descricao: a.legenda || (a.duracao_segundos ? `${a.duracao_segundos}s` : null),
              audioPath: a.arquivo_path || null,
            });
          } else if (isExtra) {
            const catLabel =
              a.categoria_arquivo === "laudo" ? "Laudo"
                : a.categoria_arquivo === "documento_cliente" ? "Documento do cliente"
                : "Recomendação anexa";
            ev.push({
              id: `ext-${a.id}`,
              data: when,
              tipo: "evidencia_anexada",
              titulo: `${catLabel} anexado`,
              descricao: a.legenda || null,
              arquivoPath: a.arquivo_path || null,
              arquivoNome: a.legenda || catLabel,
            });
          } else {
            ev.push({
              id: `foto-${a.id}`,
              data: when,
              tipo: "foto_adicionada",
              titulo: "Foto adicionada",
              descricao: a.legenda || null,
              fotoPath: a.arquivo_path || null,
            });
          }
        });

        // Recomendação técnica
        const { data: recs } = await supabase
          .from("registros_consultor_recomendacoes")
          .select("id, created_at, recomendacao_tecnica, dose_recomendada_valor, dose_recomendada_unidade, modo_aplicacao")
          .eq("registro_consultor_id", reg.id);
        (recs || []).forEach((r: any) =>
          ev.push({
            id: `rec-${r.id}`,
            data: r.created_at,
            tipo: "recomendacao",
            titulo: "Recomendação técnica registrada",
            descricao: r.recomendacao_tecnica
              ? r.recomendacao_tecnica.slice(0, 140) + (r.recomendacao_tecnica.length > 140 ? "..." : "")
              : (r.dose_recomendada_valor
                  ? `Dose: ${r.dose_recomendada_valor} ${r.dose_recomendada_unidade || "mL/ha"}`
                  : null),
            link: { href: `/visita-tecnica/${reg.id}?from=solicitacoes`, label: "Ver recomendação" },
          })
        );

        if (reg.status === "finalizado" && reg.hora_fim) {
          ev.push({
            id: `vf-${reg.id}`,
            data: reg.hora_fim,
            tipo: "visita_finalizada",
            titulo: "Visita finalizada",
            descricao: reg.problema_principal || null,
            link: { href: `/visita-tecnica/${reg.id}?from=solicitacoes`, label: "Abrir prontuário" },
          });
        }
      }

      // Logs de visita extras
      const { data: logs } = await supabase
        .from("visitas_logs")
        .select("id, acao, descricao, data_hora")
        .eq("solicitacao_id", solicitacaoId)
        .order("data_hora");
      (logs || [])
        .filter((l: any) => !["checkin_realizado"].includes(l.acao))
        .forEach((l: any) =>
          ev.push({
            id: `log-${l.id}`,
            data: l.data_hora,
            tipo: "outro",
            titulo: l.acao.replace(/_/g, " "),
            descricao: l.descricao,
          })
        );

      // Ordens de serviço on-farm originadas da visita
      if (registros && registros.length > 0) {
        const regIds = registros.map((r: any) => r.id);
        const { data: oss } = await supabase
          .from("ordens_servico_onfarm")
          .select("id, numero_os, created_at, status, prioridade, dose_ml_ha, area_hectares, modo_aplicacao")
          .in("registro_consultor_id", regIds);
        (oss || []).forEach((os: any) =>
          ev.push({
            id: `os-${os.id}`,
            data: os.created_at,
            tipo: "ordem_servico",
            titulo: `${os.numero_os || `OS-${os.id.slice(0, 8).toUpperCase()}`} criada (${os.status})`,
            descricao: [
              os.dose_ml_ha ? `${os.dose_ml_ha} mL/ha` : null,
              os.area_hectares ? `${os.area_hectares} ha` : null,
              os.modo_aplicacao,
            ].filter(Boolean).join(" · ") || null,
            link: { href: `/ordens-servico`, label: "Abrir OS" },
          })
        );
      }

      return ev.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    },
    enabled: !!solicitacaoId && !!solicitacao,
  });

  return (
    <Sheet open={!!solicitacaoId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da solicitação</SheetTitle>
        </SheetHeader>
        {solicitacao && (
          <div className="mt-5">
            <SolicitacaoDetalheTabs solicitacao={solicitacao} onClose={onClose} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
