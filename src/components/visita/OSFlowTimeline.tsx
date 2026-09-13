import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateDisplay, formatDateTimeDisplay, formatTimeDisplay } from "@/lib/date-utils";
import { 
  CheckCircle2, Clock, Factory, ClipboardCheck, 
  Package, Truck, Sprout, FileText, AlertCircle,
  Activity, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface OSFlowTimelineProps {
  registroId: string;
  className?: string;
}

const FLOW_STEPS = [
  { id: "visita", label: "Visita", icon: Activity, color: "bg-blue-500" },
  { id: "aprovacao", label: "Aprovação", icon: FileText, color: "bg-orange-500" },
  { id: "producao", label: "Produção", icon: Factory, color: "bg-indigo-500" },
  { id: "cq", label: "Qualidade", icon: ClipboardCheck, color: "bg-cyan-600" },
  { id: "envase", label: "Envase", icon: Package, color: "bg-teal-500" },
  { id: "entrega", label: "Entrega", icon: Truck, color: "bg-emerald-500" },
  { id: "aplicacao", label: "Aplicação", icon: Sprout, color: "bg-green-600" },
];

interface OSStatusInfo {
  osId: string;
  produtoNome: string;
  status: string;
  updatedAt: string;
}

export function OSFlowTimeline({ registroId, className }: OSFlowTimelineProps) {
  const { data: flowData, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["os-flow-timeline", registroId],
    queryFn: async () => {
      // 1. Registro e Recomendações (Visita e Aprovação)
      const { data: registro, error: registroErr } = await (supabase as any)
        .from("registros_consultor")
        .select("id, status, created_at, data_vistoria")
        .eq("id", registroId)
        .maybeSingle();
      if (registroErr) throw registroErr;

      // 2. Log de status do registro (Aprovação)
      const { data: registroLogs, error: logsErr } = await (supabase as any)
        .from("registros_consultor_status_log")
        .select("id, status_novo, changed_at")
        .eq("registro_consultor_id", registroId)
        .order("changed_at", { ascending: true });
      if (logsErr) throw logsErr;

      // 3. OS On-Farm (Produção até Entrega)
      const { data: osData, error: osErr } = await (supabase as any)
        .from("ordens_servico_onfarm")
        .select("id, status, created_at, updated_at, produtos(nome)")
        .eq("registro_consultor_id", registroId);
      if (osErr) throw osErr;

      // 4. Aplicações
      const osIds = osData?.map(os => os.id) || [];
      const { data: aplicacoes, error: aplicErr } = osIds.length > 0
        ? await (supabase as any)
            .from("aplicacoes")
            .select("id, ordem_servico_id, created_at")
            .in("ordem_servico_id", osIds)
        : { data: [], error: null };
      if (aplicErr) throw aplicErr;

      // Processar eventos para a timeline
      const events: any[] = [];
      const multiOSInfo: Record<string, OSStatusInfo[]> = {
        producao: [],
        cq: [],
        envase: [],
        entrega: [],
        aplicacao: [],
      };

      if (registro) {
        events.push({
          id: "visita",
          data: registro.created_at,
          status: "concluido",
          label: "Visita Realizada",
        });

        const aprovadoLog = registroLogs?.find(l => l.status_novo === "aprovado");
        events.push({
          id: "aprovacao",
          data: aprovadoLog?.changed_at || (registro.status === "aprovado" || registro.status === "convertido_os" ? registro.created_at : null),
          status: (registro.status === "aprovado" || registro.status === "convertido_os") ? "concluido" : "pendente",
          label: "Recomendação Aprovada",
        });
      }

      if (osData && osData.length > 0) {
        osData.forEach(os => {
          const produtoNome = (os.produtos as any)?.nome || "Produto Desconhecido";
          const status = os.status;

          const isProducao = ["em_producao", "em_cq", "envase", "pronto_entrega", "entregue", "finalizada"].includes(status);
          if (isProducao) multiOSInfo.producao.push({ osId: os.id, produtoNome, status, updatedAt: os.updated_at });

          const isCQ = ["em_cq", "envase", "pronto_entrega", "entregue", "finalizada"].includes(status);
          if (isCQ) multiOSInfo.cq.push({ osId: os.id, produtoNome, status, updatedAt: os.updated_at });

          const isEnvase = ["envase", "pronto_entrega", "entregue", "finalizada"].includes(status);
          if (isEnvase) multiOSInfo.envase.push({ osId: os.id, produtoNome, status, updatedAt: os.updated_at });

          const isEntrega = ["entregue", "finalizada"].includes(status);
          if (isEntrega) multiOSInfo.entrega.push({ osId: os.id, produtoNome, status, updatedAt: os.updated_at });

          const app = aplicacoes?.find(a => a.ordem_servico_id === os.id);
          if (app) multiOSInfo.aplicacao.push({ osId: os.id, produtoNome, status: "finalizada", updatedAt: app.created_at });
        });

        // Adicionar eventos baseados na agregação
        ["producao", "cq", "envase", "entrega", "aplicacao"].forEach(stepId => {
          const infos = multiOSInfo[stepId];
          const labelMap: Record<string, string> = {
            producao: "Em Produção",
            cq: "Controle de Qualidade",
            envase: "Envase Realizado",
            entrega: "Produto Entregue",
            aplicacao: "Aplicação Finalizada",
          };

          events.push({
            id: stepId,
            status: infos.length > 0 ? "concluido" : "pendente",
            label: labelMap[stepId],
            data: infos.length > 0 ? infos[0].updatedAt : null,
            multiInfo: infos,
            totalOS: osData.length
          });
        });
      }

      return events;
    },
    enabled: !!registroId,
  });

  if (isLoading) return <div className="h-20 animate-pulse bg-muted rounded-xl" />;

  // Falha nunca pode ser representada como etapa pendente.
  if (isError) {
    return (
      <div role="alert" className={cn("space-y-2", className)}>
        <p className="text-sm text-destructive">Não foi possível carregar a linha do tempo desta OS.</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => { void refetch(); }}>
          {isFetching ? "Tentando..." : "Tentar novamente"}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative">
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-muted hidden sm:block sm:left-auto sm:right-auto sm:top-[15px] sm:bottom-auto sm:w-full sm:h-0.5" />
        
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between sm:gap-2 relative">
          {FLOW_STEPS.map((step, idx) => {
            const event = flowData?.find(e => e.id === step.id);
            const isConcluido = event?.status === "concluido";
            const Icon = step.icon;
            const hasMulti = event?.multiInfo && event.multiInfo.length > 0;

            return (
              <div key={step.id} className="flex flex-row items-center gap-4 sm:flex-col sm:gap-2 sm:flex-1 group">
                <div 
                  className={cn(
                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isConcluido 
                      ? `${step.color} border-transparent text-white scale-110 shadow-lg shadow-primary/20` 
                      : "bg-background border-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {isConcluido && event.multiInfo && event.multiInfo.length === event.totalOS && (
                    <div className="absolute -right-1 -top-1 bg-white rounded-full p-0.5 shadow-sm border border-emerald-100">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:items-center text-left sm:text-center min-w-0 flex-1">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider transition-colors",
                    isConcluido ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                  
                  {hasMulti ? (
                    <div className="flex flex-col sm:items-center gap-0.5 mt-0.5">
                      <Badge variant="outline" className="text-[8px] h-3 px-1 bg-background whitespace-nowrap">
                        {event.multiInfo.length}/{event.totalOS} OS
                      </Badge>
                      <div className="hidden group-hover:block absolute top-full mt-2 bg-popover border rounded-md p-2 shadow-xl z-50 min-w-[150px] animate-in fade-in zoom-in-95">
                        <p className="text-[9px] font-bold border-b pb-1 mb-1 uppercase tracking-tighter">Status por Produto</p>
                        {event.multiInfo.map((info: OSStatusInfo) => (
                          <div key={info.osId} className="flex items-center justify-between gap-3 text-[9px] py-0.5">
                            <span className="truncate max-w-[80px] font-medium">{info.produtoNome}</span>
                            <span className="text-muted-foreground font-mono text-[8px]">
                              {formatDateDisplay(info.updatedAt).substring(0, 5)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : event?.data ? (
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {formatDateTimeDisplay(event.data)}
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/50 italic">Pendente</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
