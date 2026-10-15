import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Inbox,
  Clock,
  CheckCircle2,
  Factory,
  ShieldCheck,
  Layers,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Search,
  ExternalLink,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TalhaoRecomendacaoCard } from "@/components/portal/TalhaoRecomendacaoCard";

type Etapa = "enviada" | "decisao" | "aprovacao_tecnica" | "os" | "concluida";

const ETAPAS: { key: Etapa; label: string }[] = [
  { key: "enviada", label: "Enviada" },
  { key: "aprovacao_tecnica", label: "Aprovação técnica" },
  { key: "decisao", label: "Sua decisão" },
  { key: "os", label: "Ordem de Serviço" },
  { key: "concluida", label: "Concluída" },
];

function statusToEtapa(status?: string): Etapa {
  switch (status) {
    case "enviado_aprovacao":
      return "aprovacao_tecnica";
    case "aprovado":
      return "decisao";
    case "convertido_os":
      return "os";
    case "finalizado":
    case "reprovado":
      return "concluida";
    default:
      return "enviada";
  }
}

function MiniTimeline({ etapaAtual }: { etapaAtual: Etapa }) {
  const idxAtual = ETAPAS.findIndex((e) => e.key === etapaAtual);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {ETAPAS.map((e, i) => {
        const done = i < idxAtual;
        const current = i === idxAtual;
        return (
          <div key={e.key} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border whitespace-nowrap",
                current && "bg-primary text-primary-foreground border-primary",
                done &&
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
                !current && !done && "bg-muted/40 text-muted-foreground border-border",
              )}
            >
              <span className="font-bold">{i + 1}</span>
              <span>{e.label}</span>
            </div>
            {i < ETAPAS.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProximoPasso({ status }: { status?: string }) {
  if (status === "enviado_aprovacao") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs">
          <div className="font-semibold text-amber-900 dark:text-amber-200">
            Aguardando aprovação técnica
          </div>
          <div className="text-amber-800/80 dark:text-amber-200/80">
            Um responsável técnico está revisando esta recomendação. Você será notificado
            quando estiver pronta para sua decisão.
          </div>
        </div>
      </div>
    );
  }

  if (status === "aprovado") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-primary/10 border border-primary/30">
        <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs flex-1">
          <div className="font-semibold text-foreground">
            Sua decisão é o que falta para gerar a OS
          </div>
          <div className="text-muted-foreground">
            Ao aprovar, a Ordem de Serviço entra automaticamente na fila de produção. Você
            também pode aceitar sem aplicar ou recusar para o consultor ajustar.
          </div>
        </div>
      </div>
    );
  }

  if (status === "convertido_os") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-indigo-500/10 border border-indigo-500/30">
        <Factory className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-xs flex-1">
          <div className="font-semibold text-indigo-900 dark:text-indigo-200">Em produção</div>
          <div className="text-indigo-800/80 dark:text-indigo-200/80">
            Ordem de Serviço gerada. Acompanhe o status no módulo de Ordens.
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-7 text-[11px] shrink-0">
          <Link to="/portal/ordens-servico">
            <ExternalLink className="h-3 w-3 mr-1" /> Ver OS
          </Link>
        </Button>
      </div>
    );
  }

  if (status === "reprovado") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
        <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="text-xs">
          <div className="font-semibold text-foreground">Recusada</div>
          <div className="text-muted-foreground">
            O consultor poderá ajustar e reenviar uma nova prescrição.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
      <div className="text-xs">
        <div className="font-semibold text-emerald-900 dark:text-emerald-200">Concluída</div>
        <div className="text-emerald-800/80 dark:text-emerald-200/80">
          Esta recomendação foi encerrada.
        </div>
      </div>
    </div>
  );
}

function CompactItemCard({
  grupo,
  defaultExpanded = false,
}: {
  grupo: { registro: any; recomendacoes: any[] };
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { registro, recomendacoes } = grupo;
  const status = registro?.status as string | undefined;
  const etapa = statusToEtapa(status);

  const fazenda = registro?.fazendas?.nome || "Fazenda";
  const talhao = registro?.talhoes?.nome || "Talhão";
  const cultura = registro?.culturas?.nome;
  const data = registro?.data_vistoria
    ? formatDateDisplay(registro.data_vistoria)
    : null;

  const primeiroProduto = recomendacoes[0]?.produtos?.nome;
  const problema = registro?.problema_principal;
  const urgencia = registro?.nivel_pressao;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{fazenda}</span>
                {data && (
                  <>
                    <span>•</span>
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>{data}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <h3 className="font-semibold text-base truncate">{talhao}</h3>
                {cultura && (
                  <Badge variant="outline" className="text-[10px]">
                    {cultura}
                  </Badge>
                )}
                {urgencia && (
                  <Badge
                    variant={
                      urgencia === "alta" || urgencia === "critica" ? "destructive" : "secondary"
                    }
                    className="text-[10px] capitalize"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {urgencia}
                  </Badge>
                )}
              </div>
              {(problema || primeiroProduto) && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {problema && <span className="font-medium text-foreground">{problema}</span>}
                  {problema && primeiroProduto && " · "}
                  {primeiroProduto && (
                    <>
                      Recomendado: <span className="font-medium">{primeiroProduto}</span>
                      {recomendacoes.length > 1 && ` (+${recomendacoes.length - 1})`}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <MiniTimeline etapaAtual={etapa} />
          <ProximoPasso status={status} />

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" /> Ocultar detalhes
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" /> Abrir detalhes
              </>
            )}
          </Button>
        </div>

        {expanded && (
          <div className="border-t bg-muted/20 p-3 sm:p-4">
            <TalhaoRecomendacaoCard registro={registro} recomendacoes={recomendacoes} defaultOpen />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ABA_STATUS: Record<string, string[]> = {
  aguardando: ["aprovado"],
  andamento: ["enviado_aprovacao", "convertido_os"],
  concluidas: ["finalizado", "reprovado"],
  todas: ["enviado_aprovacao", "aprovado", "convertido_os", "finalizado", "reprovado"],
};

const ABAS_VALIDAS = new Set(Object.keys(ABA_STATUS));

export default function PortalRecomendacoes() {
  const { clienteId, loading: cl } = usePortalCliente();
  const fence = useStorageAccessScope(`producer-recommendations:${clienteId}`);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get("aba");
  const [aba, setAba] = useState<string>(
    abaParam && ABAS_VALIDAS.has(abaParam) ? abaParam : "aguardando",
  );
  const [fazendaFiltro, setFazendaFiltro] = useState<string>("todas");
  const [busca, setBusca] = useState<string>("");

  const {
    data: recs = [],
    isLoading: loading,
    refetch,
  } = useScopedPortalQuery({
    queryKey: ["portal-recomendacoes-unificado", clienteId],
    enabled: !!clienteId,
    queryFn: async (signal) => {
      const { data, error } = await supabase
        .from("registros_consultor_recomendacoes")
        .select(
          `*, produtos(nome, funcao_completa, modo_aplicacao),
           microrganismos(nome, nome_cientifico, funcao_agronomica),
           registros_consultor!inner(
             id, cliente_id, fazenda_id, talhao_id, solicitacao_id, data_vistoria, status, updated_at,
             problema_principal, problema_secundario, categoria_problema, nivel_pressao,
             percentual_area_afetada, localizacao_na_area, condicoes_climaticas_observadas,
             fase_fenologica, area_hectares, observacoes_tecnicas,
             fazendas(id, nome), talhoes(id, nome), culturas(nome)
           )`,
        )
        .eq("registros_consultor.cliente_id", clienteId ?? "")
        .neq("registros_consultor.status", "rascunho")
        .order("created_at", { ascending: false }).abortSignal(signal);

      if (error) throw error;
      return data || [];
    },
  });

  // Realtime
  useEffect(() => {
    if (!clienteId || !fence.ready) return;
    const current = fence.capture();
    const channel = supabase
      .channel(`portal-recs-realtime-${clienteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registros_consultor",
          filter: `cliente_id=eq.${clienteId}`,
        },
        () => {
          if (!current()) return;
          refetch();
          queryClient.invalidateQueries({ queryKey: ["portal-fila-aguardando", clienteId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clienteId, refetch, queryClient, fence.scope, fence.ready]);

  // Sincroniza ?aba= com URL
  const handleAbaChange = (next: string) => {
    setAba(next);
    const sp = new URLSearchParams(searchParams);
    if (next === "aguardando") sp.delete("aba");
    else sp.set("aba", next);
    setSearchParams(sp, { replace: true });
  };

  // Agrupa por registro
  const grupos = useMemo(() => {
    const map = new Map<string, { registro: any; recomendacoes: any[] }>();
    recs.forEach((r: any) => {
      const reg = r.registros_consultor;
      if (!reg?.id) return;
      if (!map.has(reg.id)) map.set(reg.id, { registro: reg, recomendacoes: [] });
      map.get(reg.id)!.recomendacoes.push(r);
    });
    return Array.from(map.values()).sort((a, b) => {
      const da = a.registro?.data_vistoria || "";
      const db = b.registro?.data_vistoria || "";
      return db.localeCompare(da);
    });
  }, [recs]);

  const fazendas = useMemo(() => {
    const map = new Map<string, string>();
    grupos.forEach((g) => {
      const f = g.registro?.fazendas;
      if (f?.id) map.set(f.id, f.nome);
    });
    return Array.from(map.entries());
  }, [grupos]);

  const gruposFiltrados = useMemo(() => {
    const allowedStatus = ABA_STATUS[aba] || ABA_STATUS.todas;
    const buscaLower = busca.trim().toLowerCase();
    const limiteData = aba === "concluidas" ? Date.now() - 30 * 24 * 60 * 60 * 1000 : null;

    return grupos.filter((g) => {
      const reg = g.registro;
      if (!allowedStatus.includes(reg?.status)) return false;
      if (fazendaFiltro !== "todas" && reg?.fazendas?.id !== fazendaFiltro) return false;
      if (limiteData && reg?.data_vistoria) {
        const t = new Date(reg.data_vistoria).getTime();
        if (!Number.isNaN(t) && t < limiteData) return false;
      }
      if (buscaLower) {
        const hay = [
          reg?.talhoes?.nome,
          reg?.fazendas?.nome,
          reg?.problema_principal,
          reg?.problema_secundario,
          ...g.recomendacoes.map((r: any) => r?.produtos?.nome),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(buscaLower)) return false;
      }
      return true;
    });
  }, [grupos, aba, fazendaFiltro, busca]);

  const kpis = useMemo(() => {
    const aguardando = grupos.filter((g) => g.registro?.status === "aprovado").length;
    const emAndamento = grupos.filter((g) =>
      ["enviado_aprovacao", "convertido_os"].includes(g.registro?.status),
    ).length;

    const limite30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const concluidas = grupos.filter((g) => {
      const isFinal = ["finalizado", "reprovado"].includes(g.registro?.status);
      if (!isFinal) return false;
      const t = g.registro?.data_vistoria ? new Date(g.registro.data_vistoria).getTime() : 0;
      return !Number.isNaN(t) && t >= limite30;
    }).length;

    const tempos: number[] = [];
    grupos.forEach((g) => {
      const reg = g.registro;
      if (!["convertido_os", "finalizado"].includes(reg?.status)) return;
      const ini = reg?.data_vistoria ? new Date(reg.data_vistoria).getTime() : 0;
      const fim = reg?.updated_at ? new Date(reg.updated_at).getTime() : 0;
      if (ini && fim && fim >= ini) tempos.push((fim - ini) / (1000 * 60 * 60 * 24));
    });
    const tempoMedio =
      tempos.length > 0
        ? (tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(1)
        : "—";

    return { aguardando, emAndamento, concluidas, tempoMedio };
  }, [grupos]);

  if (cl || loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Recomendações Técnicas" description="Carregando…" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Recomendações Técnicas"
        description="Prescrições do seu consultor e sua fila de decisão num só lugar. Acompanhe cada etapa, do diagnóstico à Ordem de Serviço."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
        <Kpi
          icon={<Clock className="h-4 w-4 text-primary" />}
          label="Aguardando você"
          value={kpis.aguardando}
        />
        <Kpi
          icon={<Factory className="h-4 w-4 text-indigo-500" />}
          label="Em andamento"
          value={kpis.emAndamento}
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Concluídas (30d)"
          value={kpis.concluidas}
        />
        <Kpi
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          label="Tempo médio (d)"
          value={kpis.tempoMedio as any}
        />
      </div>

      {/* Abas + filtros */}
      <Tabs value={aba} onValueChange={handleAbaChange}>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="aguardando" className="flex items-center gap-1">
              Aguardando você
              {kpis.aguardando > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 text-[10px] px-1.5">
                  {kpis.aguardando}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="andamento">Em andamento</TabsTrigger>
            <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por talhão, problema, produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 h-9 w-full sm:w-64 text-sm"
              />
            </div>
            <Select value={fazendaFiltro} onValueChange={setFazendaFiltro}>
              <SelectTrigger className="h-9 w-full sm:w-48 text-sm">
                <SelectValue placeholder="Fazenda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as fazendas</SelectItem>
                {fazendas.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value={aba} className="mt-4 space-y-3">
          {gruposFiltrados.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {aba === "aguardando"
                    ? "Nenhuma recomendação aguardando sua decisão no momento."
                    : "Nenhum item nesta categoria."}
                </p>
              </CardContent>
            </Card>
          ) : aba === "aguardando" ? (
            // Aba de decisão: cards abertos com botões prontos
            gruposFiltrados.map((g, idx) => (
              <TalhaoRecomendacaoCard
                key={g.registro.id}
                registro={g.registro}
                recomendacoes={g.recomendacoes}
                defaultOpen={idx === 0}
              />
            ))
          ) : (
            // Demais abas: card compacto com mini-timeline e expandir
            gruposFiltrados.map((g) => <CompactItemCard key={g.registro.id} grupo={g} />)
          )}
        </TabsContent>
      </Tabs>

      {/* Disclaimer legal */}
      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
          As recomendações apresentadas são baseadas em prescrição agronômica do consultor
          técnico responsável e devem ser executadas conforme as orientações descritas. Doses,
          modos e momentos de aplicação podem ser ajustados em campo de acordo com as condições
          observadas. Mantenha sempre a receita agronômica vigente arquivada.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
