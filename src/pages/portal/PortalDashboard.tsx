import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Grid3X3, AlertTriangle, ClipboardList, Truck, Sprout, Stethoscope, FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { cn } from "@/lib/utils";

export default function PortalDashboard() {
  const { clienteId, clienteNome, loading: clienteLoading } = usePortalCliente();

  const { data: stats, isLoading: statsLoading } = useScopedPortalQuery({
    queryKey: ["portal-dashboard-stats", clienteId],
    enabled: !!clienteId,
    queryFn: async (signal) => {
      if (!clienteId) return null;

      // Executa contagens básicas em paralelo
      const [fazRes, osRes, entRes, entRealRes, fazendasData] = await Promise.all([
        supabase.from("fazendas").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).abortSignal(signal),
        supabase.from("ordens_servico").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).not("status", "in", '("finalizada","entregue")').abortSignal(signal),
        supabase.from("entregas").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).neq("status", "entregue").abortSignal(signal),
        supabase.from("entregas").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).eq("status", "entregue").abortSignal(signal),
        supabase.from("fazendas").select("id").eq("cliente_id", clienteId).abortSignal(signal),
      ]);

      const fazendaIds = fazendasData.data?.map(f => f.id) || [];
      
      // Contagens dependentes
      let talhoesCount = 0;
      let registrosCount = 0;
      let aplicacoesCount = 0;
      let prodCount = 0;

      if (fazendaIds.length > 0) {
        const [talhoesRes, registrosRes, osIdsRes] = await Promise.all([
          supabase.from("talhoes").select("id", { count: "exact", head: true }).in("fazenda_id", fazendaIds).abortSignal(signal),
          supabase.from("registros_consultor").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).neq("status", "rascunho").abortSignal(signal),
          supabase.from("ordens_servico").select("id").eq("cliente_id", clienteId).abortSignal(signal),
        ]);

        talhoesCount = talhoesRes.count || 0;
        registrosCount = registrosRes.count || 0;

        const osIdList = osIdsRes.data?.map(o => o.id) || [];
        if (osIdList.length > 0) {
          const [aplicacoesRes, prodRes] = await Promise.all([
            supabase.from("aplicacoes").select("id", { count: "exact", head: true }).in("ordem_servico_id", osIdList).abortSignal(signal),
            supabase.from("programacao_producao").select("id", { count: "exact", head: true }).in("ordem_servico_id", osIdList).neq("status", "aprovado").abortSignal(signal),
          ]);
          aplicacoesCount = aplicacoesRes.count || 0;
          prodCount = prodRes.count || 0;
        }
      }

      return {
        fazendas: fazRes.count || 0,
        talhoes: talhoesCount,
        ocorrencias: registrosCount,
        osAndamento: osRes.count || 0,
        entregasPendentes: entRes.count || 0,
        entregasRealizadas: entRealRes.count || 0,
        aplicacoes: aplicacoesCount,
        producao: prodCount,
      };
    },
    staleTime: 5 * 60_000, // 5 minutos de cache
  });

  const loading = clienteLoading || statsLoading;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Carregando...</div>;
  }

  if (!clienteId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <p className="text-muted-foreground text-center">Seu perfil ainda não está vinculado a um cadastro de cliente. Entre em contato com a equipe Cultivo Farm.</p>
      </div>
    );
  }

  const kpis = [
    { label: "Fazendas", value: stats?.fazendas || 0, icon: MapPin, color: "text-emerald-600" },
    { label: "Talhões", value: stats?.talhoes || 0, icon: Grid3X3, color: "text-blue-600" },
    { label: "Registros Técnicos", value: stats?.ocorrencias || 0, icon: Stethoscope, color: "text-amber-600" },
    { label: "OS em Andamento", value: stats?.osAndamento || 0, icon: ClipboardList, color: "text-violet-600" },
    { label: "Entregas Pendentes", value: stats?.entregasPendentes || 0, icon: Truck, color: "text-orange-600" },
    { label: "Produtos Entregues", value: stats?.entregasRealizadas || 0, icon: Truck, color: "text-emerald-600" },
    { label: "Aplicações", value: stats?.aplicacoes || 0, icon: Sprout, color: "text-green-600" },
    { label: "Em Produção", value: stats?.producao || 0, icon: FlaskConical, color: "text-cyan-600" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Bem-vindo, ${clienteNome}`}
        description="Acompanhe sua operação on-farm"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="overflow-hidden">
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-muted", kpi.color)}>
                <kpi.icon className="h-5 w-5 sm:h-8 sm:w-8" />
              </div>
              <div className="flex flex-col min-w-0">
                <p className="text-lg sm:text-2xl font-bold font-mono-data leading-none mb-1">{kpi.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate uppercase tracking-wider font-semibold">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 p-4">
          <CardTitle className="text-sm sm:text-base">Status Geral da Safra</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Badge 
            variant={(stats?.ocorrencias || 0) > 5 ? "destructive" : (stats?.ocorrencias || 0) > 2 ? "secondary" : "default"}
            className="h-7 px-3"
          >
            {(stats?.ocorrencias || 0) > 5 ? "Sob Monitoramento Intensivo" : (stats?.ocorrencias || 0) > 2 ? "Atenção" : "Estável"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
