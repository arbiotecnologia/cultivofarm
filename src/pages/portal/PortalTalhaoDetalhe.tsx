import { formatDateDisplay } from "@/lib/date-utils";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Grid3X3, 
  MapPin, 
  Activity, 
  History, 
  AlertTriangle,
  Sprout,
  CheckCircle2,
  TrendingUp,
  FileText,
  ShieldCheck
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function PortalTalhaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clienteId, loading: clienteLoading } = usePortalCliente();

  const { data: talhao, isLoading: loadingTalhao } = useScopedPortalQuery({
    queryKey: ["portal-talhao", clienteId, id],
    queryFn: async (signal) => {
      const { data, error } = await supabase
        .from("talhoes")
        .select("*, fazendas(nome, cliente_id), culturas(nome)")
        .eq("id", id!).eq("fazendas.cliente_id", clienteId!)
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!clienteId,
  });

  const { data: safras = [] } = useQuery({
    queryKey: ["portal-talhao-safras", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talhao_safras")
        .select("*, culturas(nome)")
        .eq("talhao_id", id!)
        .order("safra", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: atividades = [] } = useQuery({
    queryKey: ["portal-talhao-atividades", id],
    queryFn: async () => {
      // 1) Recomendações/visitas do talhão
      const recsPromise = supabase
        .from("registros_consultor")
        .select("*, fazendas(nome), talhoes(nome)")
        .eq("talhao_id", id!)
        .limit(20)
        .order("created_at", { ascending: false });

      // 2) Aplicações DO TALHÃO: buscar OS deste talhão e filtrar aplicações por essas OS
      const osDoTalhaoPromise = supabase
        .from("ordens_servico")
        .select("id")
        .eq("talhao_id", id!);

      const [recs, osDoTalhao] = await Promise.all([recsPromise, osDoTalhaoPromise]);
      const osIds = (osDoTalhao.data || []).map((o: any) => o.id);

      const apps = osIds.length
        ? await supabase
            .from("aplicacoes")
            .select("*, ordens_servico(id, talhao_id, numero_os)")
            .in("ordem_servico_id", osIds)
            .order("data_aplicacao", { ascending: false })
            .limit(20)
        : { data: [] as any[] };

      const combined = [
        ...(recs.data || []).map(r => ({ ...r, type: 'recomendacao', activity_status: (r as any).status, title: (r as any).problema_principal || 'Visita Técnica' })),
        ...(apps.data || []).map(a => ({ ...a, type: 'aplicacao', activity_status: 'concluida', title: 'Aplicação Realizada' }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return combined;
    },
    enabled: !!id,
  });

  const { data: alertas = [] } = useQuery({
    queryKey: ["portal-talhao-alertas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas_agronomicos")
        .select("*")
        .eq("talhao_id", id!)
        .eq("status", "ativo");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (clienteLoading || loadingTalhao) return <div className="p-8"><Skeleton className="h-12 w-1/3 mb-4"/><Skeleton className="h-64 w-full"/></div>;
  if (!talhao) return <div className="p-8 text-center">Talhão não encontrado.</div>;

  const hasCriticalAlert = alertas.some(a => a.nivel_risco === 'critico');
  const hasWarningAlert = alertas.some(a => a.nivel_risco === 'medio' || a.nivel_risco === 'alto');
  
  const healthStatus = hasCriticalAlert ? 'critico' : hasWarningAlert ? 'atencao' : 'saudavel';
  const healthLabel = healthStatus === 'critico' ? 'Crítico' : healthStatus === 'atencao' ? 'Atenção' : 'Saudável';
  const healthColor = healthStatus === 'critico' ? 'bg-destructive text-destructive-foreground' : healthStatus === 'atencao' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white';

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{talhao.nome}</h1>
            <Badge className={healthColor}>{healthLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <MapPin className="h-3 w-3" /> {(talhao as any).fazendas?.nome} • {(talhao as any).culturas?.nome || "Sem cultura definida"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Grid3X3 className="text-primary"/>} label="Área" value={`${talhao.area_hectares || 0} ha`} />
        <KpiCard icon={<TrendingUp className="text-emerald-500"/>} label="Prod. Média" value={safras.length > 0 ? `${(safras.reduce((acc, s) => acc + (Number(s.produtividade) || 0), 0) / safras.length).toFixed(1)} ${safras[0]?.unidade_produtividade || 'sc/ha'}` : "—"} />
        <KpiCard icon={<Activity className="text-indigo-500"/>} label="Atividades" value={atividades.length} />
        <KpiCard icon={<AlertTriangle className="text-amber-500"/>} label="Alertas" value={alertas.length} />
      </div>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="safras">Safras</TabsTrigger>
          <TabsTrigger value="atividades">Atividades</TabsTrigger>
          <TabsTrigger value="diagnosticos">Fitossanidade</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6 mt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Tendência de Produtividade
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {safras.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...safras].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="safra" fontSize={10} />
                      <YAxis fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="produtividade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground italic text-sm">
                    Sem dados históricos suficientes.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Eventos Recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {atividades.slice(0, 5).map((atv, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-muted pl-4 relative">
                      <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-primary" />
                      <div className="flex-1">
                        <p className="font-medium">
                          {(atv as any).title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(atv.created_at), "dd 'de' MMMM", { locale: ptBR })}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">{(atv as any).activity_status?.replace('_', ' ')}</Badge>
                    </div>
                  ))}
                  {atividades.length === 0 && <p className="text-sm text-muted-foreground italic">Nenhuma atividade registrada.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="safras" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Safras</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {safras.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <Sprout className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold">{s.safra}</p>
                        <p className="text-sm text-muted-foreground">{(s as any).culturas?.nome}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{s.produtividade} <span className="text-xs font-normal text-muted-foreground">{s.unidade_produtividade}</span></p>
                      <p className="text-xs text-muted-foreground">Colheita: {s.data_colheita_real ? formatDateDisplay(s.data_colheita_real) : '—'}</p>
                    </div>
                  </div>
                ))}
                {safras.length === 0 && <p className="text-center py-8 text-muted-foreground italic">Nenhuma safra registrada.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="atividades" className="mt-6">
           <Card>
            <CardHeader>
              <CardTitle>Aplicações e Recomendações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {atividades.map((atv, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => {
                    if (atv.type === 'recomendacao') navigate(`/portal/registros/${atv.id}`);
                  }}>
                    <div className="flex items-center gap-4">
                      <div className={cn("p-2 rounded-full", atv.type === 'recomendacao' ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600")}>
                        {atv.type === 'recomendacao' ? <FileText className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-bold capitalize">{atv.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {(atv as any).title}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="text-xs text-muted-foreground">{formatDateDisplay(atv.created_at)}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">{(atv as any).activity_status?.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                ))}
                {atividades.length === 0 && <p className="text-center py-8 text-muted-foreground italic">Nenhuma atividade registrada.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnosticos" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Situação Fitossanitária
              </CardTitle>
            </CardHeader>
            <CardContent>
               {alertas.length > 0 ? (
                 <div className="space-y-3">
                   {alertas.map((a, i) => (
                     <div key={i} className={cn("p-4 border rounded-lg flex items-start gap-3", a.nivel_risco === 'critico' ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-50/50")}>
                        <AlertTriangle className={cn("h-5 w-5 shrink-0", a.nivel_risco === 'critico' ? "text-destructive" : "text-amber-600")} />
                        <div>
                          <p className="font-semibold text-sm">{a.tipo_alerta || "Alerta Agronômico"}</p>
                          <p className="text-xs text-muted-foreground">{a.descricao}</p>
                        </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-12">
                   <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3 opacity-20" />
                   <p className="text-muted-foreground italic">Nenhuma praga ou doença crítica detectada recentemente.</p>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground italic border-t pt-4">
        ⚖️ Informações agronômicas de caráter consultivo. Este dashboard consolida dados de campo, sensoriamento e prescrições. Para decisões estratégicas, consulte sempre seu agrônomo responsável.
      </p>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-1">
        <div className="p-2 rounded-full bg-muted/50">
          {icon}
        </div>
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
