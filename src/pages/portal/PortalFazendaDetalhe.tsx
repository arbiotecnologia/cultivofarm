import { formatDateDisplay } from "@/lib/date-utils";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  MapPin,
  Grid3X3,
  Sprout,
  AlertTriangle,
  ClipboardList,
  Activity,
  CalendarCheck,
  Ruler,
  TrendingUp,
  ArrowRight,
  FileText,
  CheckCircle2,
  CloudRain,
  Thermometer,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const STATUS_OS_ABERTOS = ["pendente", "em_andamento", "programada", "aguardando_aprovacao", "rascunho"];

export default function PortalFazendaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clienteId, loading: clienteLoading } = usePortalCliente();

  const { data: fazenda, isLoading: loadingFazenda } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-detalhe", clienteId, id],
    queryFn: async (signal) => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("*")
        .eq("id", id ?? "").eq("cliente_id", clienteId ?? "")
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!clienteId,
  });

  const { data: talhoes = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-talhoes", clienteId, id],
    queryFn: async (signal) => {
      const { data: talhoesBase } = await supabase
        .from("talhoes")
        .select("*")
        .eq("fazenda_id", id ?? "")
        .eq("ativo", true)
        .order("nome").abortSignal(signal);
      if (!talhoesBase?.length) return [];

      const talhaoIds = talhoesBase.map((t) => t.id);
      const culturaIds = Array.from(new Set(talhoesBase.map((t) => t.cultura_id).filter(Boolean)));

      const [culturasRes, safrasRes] = await Promise.all([
        culturaIds.length
          ? supabase.from("culturas").select("id, nome").in("id", culturaIds).abortSignal(signal)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from("talhao_safras").select("*").in("talhao_id", talhaoIds).abortSignal(signal),
      ]);

      const culturasMap = new Map((culturasRes.data || []).map((c: any) => [c.id, c]));
      const safrasMap = new Map<string, any[]>();
      for (const s of safrasRes.data || []) {
        const arr = safrasMap.get((s as any).talhao_id) || [];
        arr.push(s);
        safrasMap.set((s as any).talhao_id, arr);
      }

      return talhoesBase.map((t) => ({
        ...t,
        culturas: t.cultura_id ? culturasMap.get(t.cultura_id) || null : null,
        talhao_safras: safrasMap.get(t.id) || [],
      }));
    },
    enabled: !!id && !!clienteId && !!fazenda,
  });

  const { data: ordensServico = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-os", clienteId, id],
    queryFn: async (signal) => {
      const { data } = await supabase
        .from("ordens_servico")
        .select("*, talhoes(nome)")
        .eq("fazenda_id", id ?? "")
        .order("created_at", { ascending: false })
        .limit(50).abortSignal(signal);
      return data || [];
    },
    enabled: !!id && !!clienteId && !!fazenda,
  });

  const { data: registros = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-registros", clienteId, id],
    queryFn: async (signal) => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("id, data_vistoria, problema_principal, consultor_responsavel, status, talhao_id, talhoes(nome), created_at")
        .eq("fazenda_id", id ?? "")
        .order("data_vistoria", { ascending: false })
        .limit(50).abortSignal(signal);
      return data || [];
    },
    enabled: !!id && !!clienteId && !!fazenda,
  });

  const { data: recomendacoes = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-recomendacoes", clienteId, id, registros.map((r: any) => r.id).join(",")],
    enabled: !!clienteId && !!fazenda && registros.length > 0,
    queryFn: async (signal) => {
      const registroIds = registros.map((r: any) => r.id);
      const { data } = await supabase
        .from("registros_consultor_recomendacoes")
        .select("*, produtos:produto_biologico_sugerido_id(nome), microrganismos:microrganismo_id(nome)")
        .in("registro_consultor_id", registroIds)
        .order("created_at", { ascending: false }).abortSignal(signal);
      return data || [];
    },
  });

  const { data: aplicacoes = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-aplicacoes", clienteId, id, ordensServico.map((o: any) => o.id).join(",")],
    enabled: !!clienteId && !!fazenda && ordensServico.length > 0,
    queryFn: async (signal) => {
      const osIds = ordensServico.map((o: any) => o.id);
      const { data } = await supabase
        .from("aplicacoes")
        .select("*, ordens_servico(numero_os, talhao_id, talhoes(nome))")
        .in("ordem_servico_id", osIds)
        .order("data_aplicacao", { ascending: false })
        .limit(50).abortSignal(signal);
      return data || [];
    },
  });

  const { data: alertas = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-alertas", clienteId, id],
    queryFn: async (signal) => {
      const { data } = await supabase
        .from("alertas_agronomicos")
        .select("*, talhoes(nome)")
        .eq("fazenda_id", id ?? "")
        .eq("status", "ativo").abortSignal(signal);
      return data || [];
    },
    enabled: !!id && !!clienteId && !!fazenda,
  });

  const { data: clima = [] } = useScopedPortalQuery({
    queryKey: ["portal-fazenda-clima", clienteId, id],
    queryFn: async (signal) => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 14);
      const { data } = await supabase
        .from("clima_dados")
        .select("data_hora, temperatura, chuva_mm, umidade")
        .eq("fazenda_id", id ?? "")
        .gte("data_hora", desde.toISOString())
        .order("data_hora", { ascending: true }).abortSignal(signal);
      return data || [];
    },
    enabled: !!id && !!clienteId && !!fazenda,
  });

  if (clienteLoading || loadingFazenda)
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  if (!fazenda) return <div className="p-8 text-center">Fazenda não encontrada.</div>;

  const areaCultivada = talhoes.reduce((sum: number, t: any) => sum + (Number(t.area_hectares) || 0), 0);
  const osAbertas = ordensServico.filter((o: any) => STATUS_OS_ABERTOS.includes(o.status)).length;
  const alertasCriticos = alertas.filter((a: any) => a.nivel_risco === "critico").length;
  const ultimaVisita = registros[0];
  const proximaAplicacao = ordensServico
    .filter((o: any) => o.data_programada && new Date(o.data_programada) >= new Date())
    .sort(
      (a: any, b: any) => new Date(a.data_programada).getTime() - new Date(b.data_programada).getTime()
    )[0];

  const culturasMap = new Map<string, number>();
  for (const t of talhoes as any[]) {
    const nome = t.culturas?.nome;
    if (nome) culturasMap.set(nome, (culturasMap.get(nome) || 0) + (Number(t.area_hectares) || 0));
  }
  const culturas = Array.from(culturasMap.entries()).sort((a, b) => b[1] - a[1]);

  const climaChart = clima.map((c: any) => ({
    data: format(new Date(c.data_hora), "dd/MM"),
    temp: Number(c.temperatura) || 0,
    chuva: Number(c.chuva_mm) || 0,
  }));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/fazendas")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="min-w-0 max-w-full text-2xl font-bold break-words">{fazenda.nome}</h1>
            {alertasCriticos > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {alertasCriticos} crítico{alertasCriticos > 1 ? "s" : ""}
              </Badge>
            )}
            {fazenda.codigo_referencia && (
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {fazenda.codigo_referencia}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <MapPin className="h-3 w-3" />
            {fazenda.municipio ? `${fazenda.municipio}${fazenda.estado ? `/${fazenda.estado}` : ""}` : "—"}
            {culturas.length > 0 && (
              <>
                <span>•</span>
                <Sprout className="h-3 w-3 text-emerald-600" />
                {culturas.map(([n]) => n).slice(0, 2).join(", ")}
                {culturas.length > 2 && ` +${culturas.length - 2}`}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Grid3X3 className="text-primary" />} label="Talhões" value={talhoes.length} />
        <KpiCard
          icon={<Ruler className="text-muted-foreground" />}
          label="Área cultivada"
          value={`${areaCultivada.toFixed(0)} ha`}
          sub={fazenda.area_total ? `de ${fazenda.area_total} ha` : undefined}
        />
        <KpiCard icon={<ClipboardList className="text-indigo-500" />} label="OS abertas" value={osAbertas} />
        <KpiCard
          icon={<AlertTriangle className={alertas.length > 0 ? "text-amber-500" : "text-muted-foreground"} />}
          label="Alertas"
          value={alertas.length}
        />
        <KpiCard
          icon={<CalendarCheck className="text-emerald-500" />}
          label="Última visita"
          value={
            ultimaVisita?.data_vistoria
              ? format(new Date(ultimaVisita.data_vistoria), "dd/MM", { locale: ptBR })
              : "—"
          }
          sub={ultimaVisita?.consultor_responsavel || undefined}
        />
        <KpiCard
          icon={<Activity className="text-purple-500" />}
          label="Próx. aplicação"
          value={
            proximaAplicacao?.data_programada
              ? format(new Date(proximaAplicacao.data_programada), "dd/MM", { locale: ptBR })
              : "—"
          }
        />
      </div>

      <Tabs defaultValue="talhoes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 h-auto">
          <TabsTrigger value="talhoes">Talhões</TabsTrigger>
          <TabsTrigger value="safras">Safras</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          <TabsTrigger value="recomendacoes">Recomendações</TabsTrigger>
          <TabsTrigger value="fitossanidade">Fito. & Clima</TabsTrigger>
        </TabsList>

        {/* TALHÕES */}
        <TabsContent value="talhoes" className="mt-6">
          {talhoes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground italic border border-dashed rounded-lg">
              Nenhum talhão cadastrado nesta fazenda.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {talhoes.map((t: any) => {
                const ultimaSafra = [...(t.talhao_safras || [])].sort((a: any, b: any) =>
                  String(b.safra).localeCompare(String(a.safra))
                )[0];
                return (
                  <Card
                    key={t.id}
                    className="hover:shadow-md transition-all group overflow-hidden cursor-pointer active:scale-[0.98]"
                    onClick={() => navigate(`/portal/talhoes/${t.id}`)}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Grid3X3 className="h-4 w-4 text-primary" />
                          <h3 className="font-bold">{t.nome}</h3>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[9px] uppercase font-semibold text-muted-foreground">Área</p>
                          <p className="font-semibold">{t.area_hectares ? `${t.area_hectares} ha` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase font-semibold text-muted-foreground">Cultura</p>
                          <p className="font-semibold flex items-center gap-1">
                            <Sprout className="h-3 w-3 text-emerald-500" />
                            {t.culturas?.nome || "—"}
                          </p>
                        </div>
                      </div>
                      {ultimaSafra && (
                        <div className="flex items-center justify-between text-[11px] bg-muted/30 p-2 rounded-md">
                          <span className="text-muted-foreground">Prod. {ultimaSafra.safra}</span>
                          {ultimaSafra.produtividade != null && (
                            <span className="font-bold flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-primary" />
                              {ultimaSafra.produtividade} {ultimaSafra.unidade_produtividade}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* SAFRAS */}
        <TabsContent value="safras" className="mt-6">
          <SafrasAgrupadas talhoes={talhoes as any[]} />
        </TabsContent>

        {/* ATIVIDADES */}
        <TabsContent value="atividades" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linha do tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineAtividades
                registros={registros as any[]}
                ordens={ordensServico as any[]}
                aplicacoes={aplicacoes as any[]}
                onClickRegistro={(rid) => navigate(`/portal/registros/${rid}`)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECOMENDAÇÕES */}
        <TabsContent value="recomendacoes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recomendações técnicas</CardTitle>
            </CardHeader>
            <CardContent>
              {recomendacoes.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground italic">
                  Nenhuma recomendação registrada.
                </p>
              ) : (
                <div className="space-y-3">
                  {recomendacoes.map((r: any) => (
                    <div
                      key={r.id}
                      className="p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/portal/registros/${r.registro_consultor_id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">
                              {r.produtos?.nome || r.microrganismos?.nome || r.objetivo_recomendacao || "Recomendação"}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {r.recomendacao_tecnica || r.estrategia_manejo || "—"}
                            </p>
                          </div>
                        </div>
                        {r.dose_recomendada_valor && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {r.dose_recomendada_valor} {r.dose_recomendada_unidade}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FITOSSANIDADE & CLIMA */}
        <TabsContent value="fitossanidade" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alertas.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto opacity-30 mb-2" />
                  <p className="text-muted-foreground italic text-sm">
                    Sem alertas ativos para esta fazenda.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alertas.map((a: any) => (
                    <div
                      key={a.id}
                      className={cn(
                        "p-3 border rounded-lg flex items-start gap-3",
                        a.nivel_risco === "critico"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-amber-500/40 bg-amber-50/50"
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          "h-4 w-4 shrink-0 mt-0.5",
                          a.nivel_risco === "critico" ? "text-destructive" : "text-amber-600"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{a.tipo_alerta || "Alerta agronômico"}</p>
                        <p className="text-xs text-muted-foreground">{a.descricao}</p>
                        {a.talhoes?.nome && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Talhão: {a.talhoes.nome}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-sky-500" />
                Clima (últimos 14 dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {climaChart.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground italic text-sm">
                  Sem dados climáticos recentes.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={climaChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="data" fontSize={10} />
                    <YAxis yAxisId="left" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" fontSize={10} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="temp"
                      name="Temp (°C)"
                      stroke="hsl(var(--primary))"
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="chuva"
                      name="Chuva (mm)"
                      stroke="hsl(199 89% 48%)"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground italic border-t pt-4">
        ⚖️ Painel consolidado de caráter consultivo. Para decisões agronômicas, consulte sempre o
        prescritor técnico responsável.
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <div className="p-1.5 rounded-full bg-muted/50">{icon}</div>
        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">{label}</p>
        <p className="text-base font-bold leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate max-w-full">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SafrasAgrupadas({ talhoes }: { talhoes: any[] }) {
  const agrup = new Map<string, { area: number; produtividades: number[]; cultura: string | null; unidade: string | null }>();
  for (const t of talhoes) {
    for (const s of t.talhao_safras || []) {
      const key = s.safra;
      const cur = agrup.get(key) || { area: 0, produtividades: [], cultura: null, unidade: null };
      cur.area += Number(t.area_hectares) || 0;
      if (s.produtividade != null) cur.produtividades.push(Number(s.produtividade));
      cur.cultura = cur.cultura || t.culturas?.nome || null;
      cur.unidade = cur.unidade || s.unidade_produtividade || null;
      agrup.set(key, cur);
    }
  }
  const rows = Array.from(agrup.entries()).sort((a, b) => String(b[0]).localeCompare(String(a[0])));

  if (rows.length === 0) {
    return (
      <p className="text-center py-8 text-muted-foreground italic border border-dashed rounded-lg">
        Sem histórico de safras registrado.
      </p>
    );
  }

  const chartData = [...rows]
    .reverse()
    .map(([safra, v]) => ({
      safra,
      produtividade:
        v.produtividades.length > 0
          ? Number((v.produtividades.reduce((a, b) => a + b, 0) / v.produtividades.length).toFixed(1))
          : 0,
    }));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Produtividade média por safra</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="safra" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey="produtividade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Detalhamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.map(([safra, v]) => (
              <div key={safra} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <Sprout className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">{safra}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {v.cultura || "—"} · {v.area.toFixed(0)} ha
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">
                    {v.produtividades.length > 0
                      ? (v.produtividades.reduce((a, b) => a + b, 0) / v.produtividades.length).toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{v.unidade || "sc/ha"}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineAtividades({
  registros,
  ordens,
  aplicacoes,
  onClickRegistro,
}: {
  registros: any[];
  ordens: any[];
  aplicacoes: any[];
  onClickRegistro: (id: string) => void;
}) {
  type Item = {
    id: string;
    tipo: "visita" | "os" | "aplicacao";
    data: string;
    titulo: string;
    subtitulo: string;
    status?: string;
    onClick?: () => void;
  };

  const items: Item[] = [
    ...registros.map((r: any) => ({
      id: `r-${r.id}`,
      tipo: "visita" as const,
      data: r.data_vistoria || r.created_at,
      titulo: r.problema_principal || "Visita técnica",
      subtitulo: `${r.consultor_responsavel || "—"}${r.talhoes?.nome ? ` · ${r.talhoes.nome}` : ""}`,
      status: r.status,
      onClick: () => onClickRegistro(r.id),
    })),
    ...ordens.map((o: any) => ({
      id: `o-${o.id}`,
      tipo: "os" as const,
      data: o.data_programada || o.created_at,
      titulo: `OS ${o.numero_os || ""}`.trim(),
      subtitulo: o.talhoes?.nome || "—",
      status: o.status,
    })),
    ...aplicacoes.map((a: any) => ({
      id: `a-${a.id}`,
      tipo: "aplicacao" as const,
      data: a.data_aplicacao || a.created_at,
      titulo: "Aplicação realizada",
      subtitulo: `${a.ordens_servico?.talhoes?.nome || "—"}${a.responsavel ? ` · ${a.responsavel}` : ""}`,
    })),
  ]
    .filter((i) => i.data)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

  if (items.length === 0) {
    return <p className="text-center py-8 text-muted-foreground italic">Nenhuma atividade registrada.</p>;
  }

  const iconFor = (t: Item["tipo"]) =>
    t === "visita" ? (
      <FileText className="h-4 w-4 text-amber-600" />
    ) : t === "os" ? (
      <ClipboardList className="h-4 w-4 text-indigo-600" />
    ) : (
      <Activity className="h-4 w-4 text-emerald-600" />
    );

  const bgFor = (t: Item["tipo"]) =>
    t === "visita" ? "bg-amber-100" : t === "os" ? "bg-indigo-100" : "bg-emerald-100";

  return (
    <div className="space-y-2">
      {items.slice(0, 30).map((i) => (
        <div
          key={i.id}
          className={cn(
            "flex items-center gap-3 p-3 border rounded-lg transition-colors",
            i.onClick && "cursor-pointer hover:bg-muted/30"
          )}
          onClick={i.onClick}
        >
          <div className={cn("p-2 rounded-full", bgFor(i.tipo))}>{iconFor(i.tipo)}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{i.titulo}</p>
            <p className="text-xs text-muted-foreground truncate">{i.subtitulo}</p>
          </div>
          <div className="text-right flex flex-col items-end gap-1 shrink-0">
            <p className="text-[11px] text-muted-foreground">
              {formatDateDisplay(i.data)}
            </p>
            {i.status && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {String(i.status).replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
