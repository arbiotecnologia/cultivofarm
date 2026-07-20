import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { ArrowLeft, MapPin, Clock, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { format, isToday, isThisWeek, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

const URGENCIA_COLORS: Record<string, string> = {
  baixa: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  media: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  alta: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  critica: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aberta: "Aberta",
  atribuida: "Atribuída a você",
  em_deslocamento: "Em deslocamento",
  checkin_realizado: "Check-in feito",
  em_visita: "Em visita",
  aguardando_recomendacao: "Aguard. recomendação",
  concluida: "Concluída",
  monitoramento_programado: "Monitoramento",
};

type Bucket = "atrasadas" | "hoje" | "semana" | "proximas" | "sem_data";

const BUCKET_LABELS: Record<Bucket, string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  semana: "Esta semana",
  proximas: "Próximas",
  sem_data: "Sem data prevista",
};

function getBucket(s: any): Bucket {
  const dt = s.data_prevista_atendimento ? new Date(s.data_prevista_atendimento) : null;
  if (!dt) return "sem_data";
  const naoFinal = !["concluida", "cancelada"].includes(s.status);
  if (naoFinal && isPast(dt) && !isToday(dt)) return "atrasadas";
  if (isToday(dt)) return "hoje";
  if (isThisWeek(dt, { weekStartsOn: 1 })) return "semana";
  return "proximas";
}

export default function MobileSolicitacoes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { iniciarVisita } = useFluxoVisitaTecnica();
  const [isStarting, setIsStarting] = useState<string | null>(null);

  const { data: solicitacoes, isLoading } = useQuery({
    queryKey: ["mobile-minhas-solicitacoes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("portal_solicitacoes")
        .select(`*, clientes:cliente_id(nome), fazendas:fazenda_id(nome), talhoes:talhao_id(nome)`)
        .or(`consultor_atribuido.eq.${user.id},status.in.(pendente,aberta,em_triagem)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const grouped = (solicitacoes || []).reduce<Record<Bucket, any[]>>(
    (acc, s) => {
      const b = getBucket(s);
      acc[b].push(s);
      return acc;
    },
    { atrasadas: [], hoje: [], semana: [], proximas: [], sem_data: [] }
  );
  const order: Bucket[] = ["atrasadas", "hoje", "semana", "proximas", "sem_data"];

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Minhas Solicitações</h1>
      </div>

      {isLoading && (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      )}

      {!isLoading && (solicitacoes || []).length === 0 && (
        <div className="text-center py-12 space-y-2">
          <CheckCircle2 className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">Nenhuma solicitação para você no momento.</p>
        </div>
      )}

      <div className="space-y-5">
        {order.map((bucket) => {
          const list = grouped[bucket];
          if (list.length === 0) return null;
          const isAtrasadas = bucket === "atrasadas";
          return (
            <div key={bucket} className="space-y-2">
              <div className="flex items-center gap-2 sticky top-0 bg-background py-1 z-10">
                {isAtrasadas && <AlertTriangle className="h-4 w-4 text-destructive" />}
                <h2 className={`text-sm font-semibold uppercase tracking-wide ${isAtrasadas ? "text-destructive" : "text-muted-foreground"}`}>
                  {BUCKET_LABELS[bucket]}
                </h2>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
              <div className="space-y-3">
                {list.map((s: any) => {
                  const isCritica = s.urgencia === "critica";
                  return (
                    <div
                      key={s.id}
                      className={`bg-card border rounded-lg p-4 active:scale-[0.99] transition-transform ${
                        isCritica ? "border-destructive border-2" : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          {s.numero_solicitacao && (
                            <p className="text-[10px] font-mono text-muted-foreground mb-0.5">
                              {s.numero_solicitacao}
                            </p>
                          )}
                          <h3 className="font-semibold text-foreground">
                            {s.tipo_demanda === "monitoramento_programado" ? "Monitoramento de Área" : s.tipo_demanda}
                          </h3>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${URGENCIA_COLORS[s.urgencia] || "bg-muted"}`}>
                          {s.urgencia}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          {s.clientes?.nome} • {s.fazendas?.nome || "Sem fazenda"}
                          {s.talhoes?.nome && ` › ${s.talhoes.nome}`}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {s.data_prevista_atendimento
                            ? `Previsto ${format(new Date(s.data_prevista_atendimento), "dd/MM HH:mm", { locale: ptBR })}`
                            : format(new Date(s.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      </div>

                      {s.descricao && (
                        <p className="text-sm text-foreground/80 mt-2 line-clamp-2">{s.descricao}</p>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/app/checkin/${s.id}`)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-primary text-primary"
                          >
                            Check-in
                          </button>
                          <button
                            disabled={isStarting === s.id}
                            onClick={async () => {
                              setIsStarting(s.id);
                              await iniciarVisita(s.id);
                              setIsStarting(null);
                            }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground flex items-center gap-1"
                          >
                            {isStarting === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            {s.status === "em_visita" ? "Retomar" : "Abrir Visita"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
