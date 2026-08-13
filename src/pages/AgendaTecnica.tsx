import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock,
  List,
  MapPin,
  PlayCircle,
  AlertTriangle,
  User,
} from "lucide-react";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateTimeDisplay, formatTimeDisplay } from "@/lib/date-utils";
import { AgendaCalendarGrid } from "@/components/agenda/AgendaCalendarGrid";
import { MapaVisitaPopover } from "@/components/agenda/MapaVisitaPopover";
import { SyncStatusBadge } from "@/components/agenda/SyncStatusBadge";

const URGENCIA_BORDER: Record<string, string> = {
  baixa: "border-l-blue-400",
  media: "border-l-amber-400",
  alta: "border-l-orange-500",
  critica: "border-l-destructive",
};

export default function AgendaTecnica() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"lista" | "diario" | "semanal" | "mapa">("lista");
  const [periodo, setPeriodo] = useState<"hoje" | "semana" | "mes">("semana");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [urgenciaFilter, setUrgenciaFilter] = useState("todas");
  const [consultorFilter, setConsultorFilter] = useState<string>("");

  const isManager = role === "administrador" || role === "gestor";

  const moveMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: Date }) => {
      // Registrar log de reagendamento
      await (supabase as any).from("visitas_logs").insert({
        solicitacao_id: id,
        acao: "reagendamento",
        descricao: `Reagendado via agenda para ${formatDateTimeDisplay(newDate)}`,
        usuario_id: user?.id,
      });

      const { error } = await (supabase as any)
        .from("portal_solicitacoes")
        .update({ 
          data_prevista_atendimento: newDate.toISOString(),
          // Se for reagendado, resetamos a confirmação do produtor para pendente
          confirmacao_produtor: "pendente" 
        } as any)
        .eq("id", id);
      if (error) throw error;

      // Sincronizar com calendário externo (outbound)
      try {
        await supabase.functions.invoke("sync-calendar-event", {
          body: { solicitacaoId: id, action: "update" }
        });
      } catch (e) {
        console.error("Erro no sync de calendário:", e);
      }
    },
    onSuccess: () => {
      toast.success("Visita reagendada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["agenda-tecnica"] });
    },
    onError: (err: any) => {
      let message = err.message || "Erro ao reagendar visita";
      if (message.includes("CONFLITO_AGENDA")) {
        message = "Este horário já está ocupado por outra visita.";
      }
      toast.error(message);
    }
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("sync-calendar-event", {
        body: { solicitacaoId: id, action: "update" }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Sincronização iniciada");
      queryClient.invalidateQueries({ queryKey: ["agenda-tecnica"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao sincronizar: " + err.message);
    }
  });

  const handleMoveItem = (id: string, newDate: Date) => {
    moveMutation.mutate({ id, newDate });
  };

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
    enabled: isManager,
  });

  const targetConsultor = isManager ? consultorFilter || null : user?.id || null;

  const { data: solicitacoes, isLoading } = useQuery({
    queryKey: ["agenda-tecnica", targetConsultor, periodo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("portal_solicitacoes")
        .select(`
          *, 
          clientes:cliente_id(nome), 
          fazendas:fazenda_id(nome,latitude,longitude), 
          talhoes:talhao_id(nome),
          agenda_sync_log(status, error_message, created_at)
        `)
        .not("data_prevista_atendimento", "is", null)
        .not("status", "in", '("concluida","cancelada")');
      if (targetConsultor) q = q.eq("consultor_atribuido", targetConsultor);
      const { data, error } = await q.order("data_prevista_atendimento");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    return (solicitacoes || []).filter((s: any) => {
      const dt = new Date(s.data_prevista_atendimento);
      if (periodo === "hoje" && !isToday(dt)) return false;
      if (periodo === "semana" && !isThisWeek(dt, { weekStartsOn: 1 })) return false;
      if (periodo === "mes" && !isThisMonth(dt)) return false;
      if (statusFilter !== "todos" && s.status !== statusFilter) return false;
      if (urgenciaFilter !== "todas" && s.urgencia !== urgenciaFilter) return false;
      return true;
    });
  }, [solicitacoes, periodo, statusFilter, urgenciaFilter]);

  const grupos = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach((s: any) => {
      const key = format(new Date(s.data_prevista_atendimento), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const handleIniciarVisita = (id: string) => {
    navigate(`/visita-tecnica/nova?solicitacao_id=${id}&from=solicitacoes`);
  };

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="h-6 w-6" />
            Agenda Técnica
          </h1>
          <p className="text-muted-foreground text-sm">
            Suas visitas agendadas e em andamento
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["lista", "diario", "semanal", "mapa"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "outline"}
              onClick={() => setView(v)}
              className="capitalize text-xs sm:text-sm"
            >
              {v === "mapa" ? <MapPin className="h-4 w-4 mr-1" /> : <List className="h-4 w-4 mr-1" />}
              {v}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="w-full sm:w-32">
            <Select value={periodo} onValueChange={(v: any) => setPeriodo(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="atribuida">Atribuída</SelectItem>
                <SelectItem value="agendada">Agendada</SelectItem>
                <SelectItem value="em_deslocamento">Em deslocamento</SelectItem>
                <SelectItem value="checkin_realizado">Check-in</SelectItem>
                <SelectItem value="em_visita">Em visita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-36">
            <Select value={urgenciaFilter} onValueChange={setUrgenciaFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas urgências</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isManager && (
            <div className="w-full sm:w-56">
              <Select value={consultorFilter || "todos"} onValueChange={(v) => setConsultorFilter(v === "todos" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Consultor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos consultores</SelectItem>
                  {(consultores || []).map((c: any) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.nome || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && grupos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma visita agendada nesse período.
          </CardContent>
        </Card>
      )}

      {view === "mapa" ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground">Legenda:</span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> agendada
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> deslocamento
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> em visita
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> concluída
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> crítica
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Clique numa visita para ver detalhes e abrir no Google Maps.
            </p>
            <div className="space-y-2">
              {filtered.map((s: any) => (
                <MapaVisitaPopover 
                  key={s.id} 
                  s={s} 
                  onIniciar={handleIniciarVisita} 
                  onSyncRetry={(id) => syncMutation.mutate(id)}
                  isSyncing={syncMutation.isPending && syncMutation.variables === s.id}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : view === "diario" || view === "semanal" ? (
        <AgendaCalendarGrid
          items={filtered}
          mode={view}
          onItemClick={handleIniciarVisita}
          onItemMove={handleMoveItem}
        />
      ) : (
        <div className="space-y-4">
          {grupos.map(([dia, items]) => (
            <div key={dia} className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground capitalize">
                {format(new Date(dia + "T00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </h2>
              {items.map((s: any) => (
                <Card
                  key={s.id}
                  className={`border-l-4 ${URGENCIA_BORDER[s.urgencia] || "border-l-muted"}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">
                            {formatTimeDisplay(s.data_prevista_atendimento)}
                          </span>
                          <span className="font-medium text-sm">{s.clientes?.nome}</span>
                          {s.urgencia === "critica" && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> CRÍTICA
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.fazendas?.nome} {s.talhoes?.nome && `› ${s.talhoes.nome}`}
                        </p>
                        <div className="flex items-center gap-1">
                          <p className="text-xs">{s.tipo_demanda}</p>
                          {s.tipo_demanda === "retorno_tecnico" && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] h-4">RETORNO</Badge>
                          )}
                          <SyncStatusBadge 
                            logs={s.agenda_sync_log} 
                            onRetry={() => syncMutation.mutate(s.id)}
                            isSyncing={syncMutation.isPending && syncMutation.variables === s.id}
                          />
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleIniciarVisita(s.id)}>
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Iniciar visita
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
