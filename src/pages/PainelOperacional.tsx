import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  Clock,
  Inbox,
  PlayCircle,
  CheckCircle2,
  ClipboardList,
  Users,
  MapPin,
  Layers,
} from "lucide-react";

import { isToday, differenceInHours } from "date-fns";
import { PainelFazenda } from "@/components/painel/PainelFazenda";

const KPI_ICON: Record<string, any> = {
  abertas: Inbox,
  criticas: AlertTriangle,
  em_visita: PlayCircle,
  consultores_ativos: Users,
  checkins_dia: MapPin,
  visitas_pendentes: Clock,
  recomendacoes_pendentes: ClipboardList,
  os_pendentes: CheckCircle2,
  monitoramentos_vencidos: AlertTriangle,
  insumos_criticos: Layers,
};


const KPI_LABEL: Record<string, string> = {
  abertas: "Solicitações abertas",
  criticas: "Críticas",
  em_visita: "Em visita",
  consultores_ativos: "Consultores ativos",
  checkins_dia: "Check-ins do dia",
  visitas_pendentes: "Visitas pendentes",
  recomendacoes_pendentes: "Recomend. pendentes",
  os_pendentes: "OS pendentes",
  monitoramentos_vencidos: "Monit. Vencidos",
  insumos_criticos: "Insumos Críticos",
};


export default function PainelOperacional() {
  const navigate = useNavigate();

  const { data: solicitacoes } = useQuery({
    queryKey: ["painel-solicitacoes"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("portal_solicitacoes")
        .select("id, status, urgencia, tipo_demanda, consultor_atribuido, data_prevista_atendimento, updated_at, numero_solicitacao, clientes:cliente_id(nome), fazendas:fazenda_id(nome)")
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    refetchInterval: 300_000,
    staleTime: 15_000,
  });

  const { data: registros } = useQuery({
    queryKey: ["painel-registros"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("registros_consultor")
        .select("id, status, hora_inicio, hora_fim, consultor_responsavel, created_at, objetivo_visita, fazenda_id")
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    refetchInterval: 300_000,
    staleTime: 15_000,
  });

  const { data: checkins } = useQuery({
    queryKey: ["painel-checkins"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("visitas_checkin")
        .select("id, consultor_id, data_hora_checkin, latitude, longitude, solicitacao_id, registro_consultor_id")
        .order("data_hora_checkin", { ascending: false })
        .limit(200);
      return data || [];
    },
    refetchInterval: 300_000,
    staleTime: 15_000,
  });

  const { data: oss } = useQuery({
    queryKey: ["painel-oss"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico_onfarm")
        .select("id, status")
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    refetchInterval: 300_000,
    staleTime: 15_000,
  });

  const { data: recomendacoes } = useQuery({
    queryKey: ["painel-recs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("registro_consultor_id");
      return data || [];
    },
    staleTime: 60_000,
  });
  
  const { data: alertasMonitoramento } = useQuery({
    queryKey: ["painel-monitoramentos"],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await (supabase as any)
        .from("alertas_agronomicos")
        .select("id")
        .eq("status", "monitoramento")
        .lt("data_vencimento", today);
      return data || [];
    },
    staleTime: 60_000,
  });

  const { data: alertasEstoque } = useQuery({
    queryKey: ["painel-estoque-alertas"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("produtos")
        .select("id, nome, estoque_minimo, estoque_produto(volume_total)")
        .eq("e_insumo", true);
      
      const alertas = (data || []).map((p: any) => {
        const total = (p.estoque_produto || []).reduce((acc: number, item: any) => acc + Number(item.volume_total || 0), 0);
        return { ...p, total };
      }).filter(p => p.total < Number(p.estoque_minimo || 0));
      
      return alertas;
    },
    staleTime: 60_000,
  });

  const { data: profiles } = useQuery({
    queryKey: ["painel-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email");
      return data || [];
    },
    staleTime: 5 * 60_000,
  });


  const profileMap = useMemo(() => {
    const m = new Map<string, any>();
    (profiles || []).forEach((p: any) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const kpis = useMemo(() => {
    const abertas = (solicitacoes || []).filter((s: any) =>
      ["pendente", "aberta", "em_triagem", "atribuida", "agendada"].includes(s.status)
    ).length;
    const criticas = (solicitacoes || []).filter(
      (s: any) => s.urgencia === "critica" && !["concluida", "cancelada"].includes(s.status)
    ).length;
    const em_visita = (solicitacoes || []).filter((s: any) => s.status === "em_visita").length;

    const lastCheckinByConsultor = new Map<string, Date>();
    (checkins || []).forEach((c: any) => {
      if (!c.data_hora_checkin || !c.consultor_id) return;
      const d = new Date(c.data_hora_checkin);
      if (isNaN(d.getTime())) return;
      
      const cur = lastCheckinByConsultor.get(c.consultor_id);
      if (!cur || cur < d) lastCheckinByConsultor.set(c.consultor_id, d);
    });
    
    const consultores_ativos = Array.from(lastCheckinByConsultor.values()).filter(
      (d) => {
        try {
          return differenceInHours(new Date(), d) < 12;
        } catch (e) {
          return false;
        }
      }
    ).length;

    const checkins_dia = (checkins || []).filter((c: any) => {
      if (!c.data_hora_checkin) return false;
      const d = new Date(c.data_hora_checkin);
      return !isNaN(d.getTime()) && isToday(d);
    }).length;
    
    const visitas_pendentes = (registros || []).filter((r: any) => r.status === "rascunho").length;

    const finalizadosIds = (registros || [])
      .filter((r: any) => r.status === "finalizado")
      .map((r: any) => r.id);
    const recIds = new Set((recomendacoes || []).map((r: any) => r.registro_consultor_id));
    const recomendacoes_pendentes = finalizadosIds.filter((id) => !recIds.has(id)).length;

    const os_pendentes = (oss || []).filter((o: any) => o.status === "aberta").length;
    const monitoramentos_vencidos = (alertasMonitoramento || []).length;

    return {
      abertas,
      criticas,
      em_visita,
      consultores_ativos,
      checkins_dia,
      visitas_pendentes,
      recomendacoes_pendentes,
      os_pendentes,
      monitoramentos_vencidos,
      insumos_criticos: (alertasEstoque || []).length,
    };
  }, [solicitacoes, registros, checkins, oss, recomendacoes, alertasMonitoramento, alertasEstoque]);


  const alertas = useMemo(() => {
    const items: { id: string; tipo: string; titulo: string; sub: string; link?: string }[] = [];
    (solicitacoes || []).forEach((s: any) => {
      if (s.urgencia === "critica" && !s.consultor_atribuido && !["concluida", "cancelada"].includes(s.status)) {
        items.push({
          id: `nc-${s.id}`,
          tipo: "sem_consultor",
          titulo: "Crítica sem consultor",
          sub: `${s.clientes?.nome || ""} · ${s.tipo_demanda}`,
          link: `/solicitacoes`,
        });
      }
      if (
        s.data_prevista_atendimento &&
        new Date(s.data_prevista_atendimento) < new Date() &&
        !["concluida", "cancelada", "em_visita", "checkin_realizado"].includes(s.status)
      ) {
        items.push({
          id: `at-${s.id}`,
          tipo: "atrasada",
          titulo: "Visita atrasada",
          sub: `${s.clientes?.nome || ""} — ${s.numero_solicitacao || ""}`,
          link: `/solicitacoes`,
        });
      }
      if (
        differenceInHours(new Date(), new Date(s.updated_at)) > 48 &&
        !["concluida", "cancelada"].includes(s.status)
      ) {
        items.push({
          id: `pa-${s.id}`,
          tipo: "parada",
          titulo: "Parada > 48h",
          sub: `${s.clientes?.nome || ""} · ${s.tipo_demanda}`,
          link: `/solicitacoes`,
        });
      }
    });
    (checkins || []).forEach((c: any) => {
      const reg = (registros || []).find((r: any) => r.id === c.registro_consultor_id);
      if (!reg || reg.hora_fim) return;
      if (differenceInHours(new Date(), new Date(c.data_hora_checkin)) > 4) {
        items.push({
          id: `cf-${c.id}`,
          tipo: "checkin_sem_fim",
          titulo: "Check-in há +4h sem finalizar",
          sub: `Visita ${reg.objetivo_visita || reg.id.slice(0, 8)}`,
          link: `/visita-tecnica/${reg.id}`,
        });
      }
    });
    (alertasEstoque || []).forEach((p: any) => {
      items.push({
        id: `est-${p.id}`,
        tipo: "estoque_baixo",
        titulo: "Estoque crítico",
        sub: `${p.nome} — Saldo: ${p.total.toFixed(1)}L (Mín: ${p.estoque_minimo}L)`,
        link: `/estoque`,
      });
    });
    return items.slice(0, 30);
  }, [solicitacoes, checkins, registros, alertasEstoque]);


  const consultorStats = useMemo(() => {
    const map = new Map<string, { user_id: string; visitas_dia: number; ult_checkin: Date | null }>();
    (registros || []).forEach((r: any) => {
      if (!r.consultor_responsavel || !r.hora_inicio) return;
      if (!isToday(new Date(r.hora_inicio))) return;
      const cur = map.get(r.consultor_responsavel) || {
        user_id: r.consultor_responsavel,
        visitas_dia: 0,
        ult_checkin: null,
      };
      cur.visitas_dia++;
      map.set(r.consultor_responsavel, cur);
    });
    (checkins || []).forEach((c: any) => {
      const cur = map.get(c.consultor_id) || {
        user_id: c.consultor_id,
        visitas_dia: 0,
        ult_checkin: null,
      };
      const d = new Date(c.data_hora_checkin);
      if (!cur.ult_checkin || cur.ult_checkin < d) cur.ult_checkin = d;
      map.set(c.consultor_id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.visitas_dia - a.visitas_dia);
  }, [registros, checkins]);

  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
          <Activity className="h-6 w-6" />
          Painel Operacional
        </h1>
        <p className="text-muted-foreground text-sm">
          Indicadores e alertas em tempo real
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(kpis).map(([key, val]) => {
          const Icon = KPI_ICON[key];
          const isCritical = key === "criticas" && val > 0;
            const clickable = key === "monitoramentos_vencidos";
            return (
              <Card 
                key={key} 
                className={cn(
                  isCritical ? "border-destructive" : "",
                  clickable ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""
                )}
                onClick={() => clickable && navigate("/monitoramento-alertas")}
              >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{KPI_LABEL[key]}</p>
                    <p className={`text-2xl font-bold ${isCritical ? "text-destructive" : "text-foreground"}`}>
                      {val}
                    </p>
                  </div>
                  <Icon className="h-7 w-7 text-muted-foreground/40" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Consultores ativos hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {consultorStats.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Sem atividade hoje.</p>
            )}
            <div className="space-y-2">
              {consultorStats.map((c) => {
                const profile = profileMap.get(c.user_id);
                return (
                  <div
                    key={c.user_id}
                    className="flex items-center justify-between border border-border rounded p-2"
                  >
                    <div>
                      <p className="font-medium text-sm">{profile?.nome || profile?.email || c.user_id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.visitas_dia} visita(s) hoje
                        {c.ult_checkin && ` · último check-in ${differenceInHours(new Date(), c.ult_checkin)}h atrás`}
                      </p>
                    </div>
                    <Badge variant="secondary">{c.visitas_dia}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Alertas operacionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertas.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Tudo em dia 🎉</p>
            )}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {alertas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => a.link && navigate(a.link)}
                  className="w-full text-left border-l-2 border-destructive bg-destructive/5 hover:bg-destructive/10 rounded p-2 transition"
                >
                  <p className="text-sm font-medium text-foreground">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">{a.sub}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <PainelFazenda
        solicitacoes={solicitacoes || []}
        registros={registros || []}
      />
    </div>
  );
}
