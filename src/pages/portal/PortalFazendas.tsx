import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  ArrowRight,
  Grid3X3,
  Sprout,
  AlertTriangle,
  ClipboardList,
  Activity,
  CalendarCheck,
  Ruler,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FazendaEnriquecida {
  id: string;
  nome: string;
  codigo_referencia: string | null;
  municipio: string | null;
  estado: string | null;
  area_total: number | null;
  talhoes: { id: string; area_hectares: number | null; cultura_id: string | null }[];
  alertasAtivos: number;
  alertasCriticos: number;
  osAbertas: number;
  aplicacoes30d: number;
  ultimaVisita: { data: string; consultor: string | null } | null;
  culturas: string[];
}

const STATUS_OS_ABERTOS = ["pendente", "em_andamento", "programada", "aguardando_aprovacao", "rascunho"];

export default function PortalFazendas() {
  const { clienteId, loading: cl } = usePortalCliente();
  const navigate = useNavigate();
  const { data: fazendas = [], isLoading: loading } = useScopedPortalQuery<FazendaEnriquecida[]>({
    queryKey: ["portal-fazendas", clienteId], enabled: !!clienteId,
    queryFn: async signal => {
      const { data: base } = await supabase
        .from("fazendas")
        .select("id, nome, codigo_referencia, municipio, estado, area_total, talhoes(id, area_hectares, cultura_id)")
        .eq("cliente_id", clienteId ?? "").abortSignal(signal)
        .order("nome");

      if (!base) return [];

      const fazendaIds = base.map((f) => f.id);
      if (fazendaIds.length === 0) return [];

      const culturaIds = Array.from(
        new Set(base.flatMap((f) => (f.talhoes || []).map((t: any) => t.cultura_id).filter(Boolean)))
      );

      const trintaDias = new Date();
      trintaDias.setDate(trintaDias.getDate() - 30);
      const trintaDiasIso = trintaDias.toISOString();

      const [alertasRes, osRes, registrosRes, culturasRes, talhaoSafrasRes] = await Promise.all([
        supabase
          .from("alertas_agronomicos")
          .select("fazenda_id, nivel_risco")
          .in("fazenda_id", fazendaIds).abortSignal(signal)
          .eq("status", "ativo"),
        supabase
          .from("ordens_servico")
          .select("id, fazenda_id, status, created_at, talhao_id")
          .in("fazenda_id", fazendaIds).abortSignal(signal),
        supabase
          .from("registros_consultor")
          .select("fazenda_id, data_vistoria, consultor_responsavel, created_at")
          .in("fazenda_id", fazendaIds).abortSignal(signal)
          .order("data_vistoria", { ascending: false }),
        culturaIds.length
          ? supabase.from("culturas").select("id, nome").in("id", culturaIds).abortSignal(signal)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase
          .from("talhao_safras")
          .select("talhao_id, cultura_id, status")
          .in("talhao_id", base.flatMap((f) => (f.talhoes || []).map((t: any) => t.id))).abortSignal(signal),
      ]);


      // Aplicações dos últimos 30 dias via OS → fazenda
      const osIds = (osRes.data || []).map((o: any) => o.id);
      let aplicMap = new Map<string, number>();
      if (osIds.length) {
        const { data: aplics } = await supabase
          .from("aplicacoes")
          .select("ordem_servico_id, data_aplicacao")
          .in("ordem_servico_id", osIds).abortSignal(signal)
          .gte("data_aplicacao", trintaDiasIso.slice(0, 10));
        const osToFazenda = new Map<string, string>(
          (osRes.data || []).map((o: any) => [o.id, o.fazenda_id])
        );
        for (const a of aplics || []) {
          const fid = osToFazenda.get((a as any).ordem_servico_id);
          if (fid) aplicMap.set(fid, (aplicMap.get(fid) || 0) + 1);
        }
      }

      const culturasMap = new Map<string, string>(
        (culturasRes.data || []).map((c: any) => [c.id, c.nome])
      );
      // Cultura predominante por fazenda: prioridade talhao_safras ativas, fallback talhoes.cultura_id
      const safraAtivaByTalhao = new Map<string, string>();
      for (const s of talhaoSafrasRes.data || []) {
        if ((s as any).status === "em_andamento" && (s as any).cultura_id) {
          safraAtivaByTalhao.set((s as any).talhao_id, (s as any).cultura_id);
        }
      }

      const enriched: FazendaEnriquecida[] = base.map((f: any) => {
        const fazendaAlertas = (alertasRes.data || []).filter((a: any) => a.fazenda_id === f.id);
        const fazendaOs = (osRes.data || []).filter((o: any) => o.fazenda_id === f.id);
        const fazendaRegs = (registrosRes.data || []).filter((r: any) => r.fazenda_id === f.id);
        const culturasSet = new Set<string>();
        for (const t of f.talhoes || []) {
          const cid = safraAtivaByTalhao.get(t.id) || t.cultura_id;
          const nome = cid ? culturasMap.get(cid) : null;
          if (nome) culturasSet.add(nome);
        }
        const ultima = fazendaRegs[0];
        return {
          id: f.id,
          nome: f.nome,
          codigo_referencia: f.codigo_referencia,
          municipio: f.municipio,
          estado: f.estado,
          area_total: f.area_total,
          talhoes: f.talhoes || [],
          alertasAtivos: fazendaAlertas.length,
          alertasCriticos: fazendaAlertas.filter((a: any) => a.nivel_risco === "critico").length,
          osAbertas: fazendaOs.filter((o: any) => STATUS_OS_ABERTOS.includes(o.status)).length,
          aplicacoes30d: aplicMap.get(f.id) || 0,
          ultimaVisita: ultima
            ? { data: ultima.data_vistoria || ultima.created_at, consultor: ultima.consultor_responsavel }
            : null,
          culturas: Array.from(culturasSet),
        };
      });

      return enriched;
    }
  });

  if (cl || loading)
    return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Minhas Fazendas</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada de cada propriedade: talhões, atividades, alertas e produção.
        </p>
      </div>

      {fazendas.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma fazenda vinculada.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {fazendas.map((f) => {
            const areaCultivada = (f.talhoes || []).reduce(
              (sum, t) => sum + (Number(t.area_hectares) || 0),
              0
            );
            const isCritico = f.alertasCriticos > 0;
            return (
              <Card
                key={f.id}
                className="group cursor-pointer transition-all hover:shadow-md active:scale-[0.99] overflow-hidden"
                onClick={() => navigate(`/portal/fazendas/${f.id}`)}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">{f.nome}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {f.codigo_referencia && (
                            <span className="font-mono uppercase">{f.codigo_referencia}</span>
                          )}
                          {f.municipio && (
                            <span className="truncate">
                              {f.municipio}
                              {f.estado ? `/${f.estado}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {f.alertasAtivos > 0 && (
                      <Badge
                        variant={isCritico ? "destructive" : "secondary"}
                        className={isCritico ? "" : "bg-amber-500/15 text-amber-700 border-amber-500/30"}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {f.alertasAtivos} alerta{f.alertasAtivos > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {f.culturas.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.culturas.slice(0, 3).map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                        >
                          <Sprout className="h-2.5 w-2.5 mr-1" />
                          {c}
                        </Badge>
                      ))}
                      {f.culturas.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{f.culturas.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2 border-y border-muted/60">
                    <KpiMini
                      icon={<Ruler className="h-3 w-3" />}
                      label="Área"
                      value={f.area_total ? `${f.area_total}ha` : "—"}
                    />
                    <KpiMini
                      icon={<Sprout className="h-3 w-3 text-emerald-600" />}
                      label="Cultivada"
                      value={areaCultivada > 0 ? `${areaCultivada.toFixed(0)}ha` : "—"}
                    />
                    <KpiMini
                      icon={<Grid3X3 className="h-3 w-3 text-primary" />}
                      label="Talhões"
                      value={f.talhoes.length}
                    />
                    <KpiMini
                      icon={<ClipboardList className="h-3 w-3 text-indigo-600" />}
                      label="OS"
                      value={f.osAbertas}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <ActivityLine
                      icon={<CalendarCheck className="h-3 w-3 text-muted-foreground" />}
                      label="Última visita"
                      value={
                        f.ultimaVisita
                          ? format(new Date(f.ultimaVisita.data), "dd MMM", { locale: ptBR })
                          : "—"
                      }
                    />
                    <ActivityLine
                      icon={<Activity className="h-3 w-3 text-muted-foreground" />}
                      label="Aplic. 30d"
                      value={f.aplicacoes30d}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between text-xs font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/portal/fazendas/${f.id}`);
                    }}
                  >
                    Abrir Fazenda
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center text-center gap-0.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        {label}
      </div>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function ActivityLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-muted/30 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
