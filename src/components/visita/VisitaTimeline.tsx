import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Camera, Mic, MapPin, FileCheck, Sprout, Clock, GitCommit,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL_REGISTRO, type RegistroStatus } from "@/lib/registroTransitions";
import { cn } from "@/lib/utils";
import { formatDateDisplay } from "@/lib/date-utils";

interface VisitaTimelineProps {
  registroId: string;
  talhaoId?: string | null;
  className?: string;
}

interface TimelineItem {
  ts: string;
  icon: React.ElementType;
  title: string;
  detail?: string;
  variant?: "default" | "primary" | "destructive";
}

export function VisitaTimeline({ registroId, talhaoId, className }: VisitaTimelineProps) {
  const { data: events = [] } = useQuery({
    queryKey: ["visita-timeline", registroId],
    queryFn: async () => {
      const items: TimelineItem[] = [];

      const [{ data: logs }, { data: checkins }, { data: arqs }] = await Promise.all([
        (supabase as any)
          .from("registros_consultor_status_log")
          .select("*")
          .eq("registro_consultor_id", registroId)
          .order("changed_at", { ascending: false }),
        (supabase as any)
          .from("visitas_checkin")
          .select("id, latitude, longitude, data_hora_checkin, tipo_checkin")
          .eq("registro_consultor_id", registroId)
          .order("data_hora_checkin", { ascending: false }),
        (supabase as any)
          .from("registros_consultor_arquivos")
          .select("id, tipo_midia, tipo_arquivo, categoria_arquivo, uploaded_at, legenda")
          .eq("registro_consultor_id", registroId)
          .order("uploaded_at", { ascending: false }),
      ]);

      // Nomes dos autores dos registros de status (sem expor UUIDs na UI).
      const autorIds = Array.from(
        new Set((logs || []).map((l: any) => l.changed_by).filter(Boolean)),
      );
      const autorNomes = new Map<string, string>();
      if (autorIds.length) {
        const { data: perfis } = await (supabase as any)
          .from("profiles")
          .select("user_id, nome")
          .in("user_id", autorIds);
        (perfis || []).forEach((p: any) => {
          if (p?.user_id && p?.nome) autorNomes.set(p.user_id, p.nome);
        });
      }

      (logs || []).forEach((l: any) => {
        const { title, detail } = descreverStatusLog(
          {
            status_anterior: l.status_anterior,
            status_novo: l.status_novo,
            motivo: l.motivo,
            autorNome: l.changed_by ? autorNomes.get(l.changed_by) ?? null : null,
          },
          (s) => (s ? STATUS_LABEL_REGISTRO[s as RegistroStatus] || s : "—"),
        );
        items.push({
          ts: l.changed_at,
          icon: GitCommit,
          title,
          detail,
          variant: "primary",
        });
      });


      (checkins || []).forEach((c: any) => {
        items.push({
          ts: c.data_hora_checkin,
          icon: MapPin,
          title: `Check-in (${String(c.tipo_checkin).replace(/_/g, " ")})`,
          detail: c.latitude && c.longitude ? `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}` : "Sem GPS",
          variant: c.latitude ? "primary" : "destructive",
        });
      });

      (arqs || []).forEach((a: any) => {
        const isFoto = a.tipo_midia === "foto" || a.tipo_arquivo?.startsWith("image");
        const isAudio = a.tipo_midia === "audio" || a.tipo_arquivo?.startsWith("audio");
        items.push({
          ts: a.uploaded_at,
          icon: isFoto ? Camera : isAudio ? Mic : FileCheck,
          title: isFoto ? "Foto adicionada" : isAudio ? "Áudio adicionado" : `Anexo: ${a.categoria_arquivo || "documento"}`,
          detail: a.legenda || undefined,
        });
      });

      return items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    },
    refetchInterval: 300000,
  });

  const { data: talhaoInfo } = useQuery({
    queryKey: ["talhao-info", talhaoId],
    queryFn: async () => {
      if (!talhaoId) return null;
      const { data } = await (supabase as any).from("talhoes").select("tipo_manejo_agua").eq("id", talhaoId).single();
      return data;
    },
    enabled: !!talhaoId,
  });

  const { data: historico } = useQuery({
    queryKey: ["visita-historico-talhao", talhaoId, registroId],
    queryFn: async () => {
      if (!talhaoId) return { visitas: [], aplicacoes: [] };
      const [{ data: visitas }, { data: aplicacoes }] = await Promise.all([
        (supabase as any)
          .from("registros_consultor")
          .select("id, data_vistoria, problema_principal, status")
          .eq("talhao_id", talhaoId)
          .neq("id", registroId)
          .order("data_vistoria", { ascending: false })
          .limit(3),
        (supabase as any)
          .from("aplicacoes")
          .select("id, data_aplicacao, dose_aplicada, ordens_servico:ordem_servico_id(talhao_id)")
          .order("data_aplicacao", { ascending: false })
          .limit(20),
      ]);
      return {
        visitas: visitas || [],
        aplicacoes: (aplicacoes || []).filter((a: any) => a.ordens_servico?.talhao_id === talhaoId).slice(0, 3),
      };
    },
    enabled: !!talhaoId,
  });

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Timeline da visita
          </div>
          {talhaoInfo && (
            <Badge variant={talhaoInfo.tipo_manejo_agua === 'irrigado' ? 'default' : 'secondary'} className={cn("text-[9px] px-1.5 h-4", talhaoInfo.tipo_manejo_agua === 'irrigado' && "bg-blue-600")}>
              {talhaoInfo.tipo_manejo_agua === 'irrigado' ? 'Irrigado' : 'Sequeiro'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-3">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-4">
            Sem eventos registrados ainda.
          </p>
        ) : (
          <ol className="relative border-l border-border pl-4 space-y-3">
            {events.map((e, i) => {
              const Icon = e.icon;
              return (
                <li key={i} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[22px] top-0 flex h-4 w-4 items-center justify-center rounded-full border bg-background",
                      e.variant === "primary" && "border-primary text-primary",
                      e.variant === "destructive" && "border-destructive text-destructive"
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <div className="text-xs">
                    <p className="font-medium leading-tight">{e.title}</p>
                    {e.detail && <p className="text-muted-foreground mt-0.5">{e.detail}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDateDisplay(e.ts)} {new Date(e.ts).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {historico && (historico.visitas.length > 0 || historico.aplicacoes.length > 0) && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Histórico do talhão
            </p>
            {historico.visitas.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Últimas visitas</p>
                {historico.visitas.map((v: any) => (
                  <div key={v.id} className="text-xs flex items-start gap-1.5 rounded bg-muted/40 p-1.5">
                    <Activity className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{v.problema_principal || "Sem problema registrado"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateDisplay(v.data_vistoria)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {historico.aplicacoes.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Últimas aplicações</p>
                {historico.aplicacoes.map((a: any) => (
                  <div key={a.id} className="text-xs flex items-start gap-1.5 rounded bg-muted/40 p-1.5">
                    <Sprout className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p>Dose: {a.dose_aplicada || "—"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateDisplay(a.data_aplicacao)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
