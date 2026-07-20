import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Zap, Clock, CheckCircle } from "lucide-react";

export function IndicadoresManejo() {
  const { data: talhoes } = useQuery({
    queryKey: ["bi-ind-talhoes"],
    queryFn: async () => {
      const { data } = await supabase.from("talhoes").select("id, area_hectares");
      return data || [];
    },
  });

  const { data: registros } = useQuery({
    queryKey: ["bi-ind-reg"],
    queryFn: async () => {
      const { data } = await supabase.from("registros_consultor").select("id, status, created_at");
      return data || [];
    },
  });

  const { data: aplicacoes } = useQuery({
    queryKey: ["bi-ind-app"],
    queryFn: async () => {
      const { data } = await supabase.from("aplicacoes").select("id, data_aplicacao, ordem_servico_id, resultado_inicial");
      return data || [];
    },
  });

  const { data: ordensServico } = useQuery({
    queryKey: ["bi-ind-os"],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_servico").select("id, created_at, data_programada, status");
      return data || [];
    },
  });

  const areaTotal = talhoes?.reduce((a, t) => a + (t.area_hectares || 0), 0) || 1;
  const totalOcorrencias = registros?.length || 0;
  const totalAplicacoes = aplicacoes?.length || 0;

  const taxaOcorrencia = (totalOcorrencias / areaTotal).toFixed(2);
  const taxaIntervencao = totalOcorrencias > 0 ? ((totalAplicacoes / totalOcorrencias) * 100).toFixed(1) : "0";

  // Average response time (OS created → application date)
  let totalDias = 0;
  let countDias = 0;
  aplicacoes?.forEach((app: any) => {
    const os = ordensServico?.find((o: any) => o.id === app.ordem_servico_id);
    if (os) {
      const diff = (new Date(app.data_aplicacao).getTime() - new Date(os.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (diff >= 0) {
        totalDias += diff;
        countDias++;
      }
    }
  });
  const tempoMedio = countDias > 0 ? (totalDias / countDias).toFixed(1) : "—";

  // Resolution rate: registros aprovados ou convertidos em OS
  const resolvidos = registros?.filter((r: any) => r.status === "aprovado" || r.status === "convertido_os").length || 0;
  const eficiencia = totalAplicacoes > 0 ? ((resolvidos / totalAplicacoes) * 100).toFixed(1) : "0";

  const cards = [
    {
      title: "Taxa de Ocorrência",
      value: `${taxaOcorrencia}/ha`,
      desc: "Ocorrências registradas / área monitorada",
      icon: Activity,
      color: "text-blue-500",
    },
    {
      title: "Taxa de Intervenção",
      value: `${taxaIntervencao}%`,
      desc: "Intervenções realizadas / ocorrências registradas",
      icon: Zap,
      color: "text-amber-500",
    },
    {
      title: "Tempo Médio de Resposta",
      value: `${tempoMedio} dias`,
      desc: "Tempo entre ocorrência e intervenção",
      icon: Clock,
      color: "text-purple-500",
    },
    {
      title: "Eficiência do Manejo",
      value: `${eficiencia}%`,
      desc: "Ocorrências resolvidas / intervenções realizadas",
      icon: CheckCircle,
      color: "text-primary",
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <c.icon className={`h-5 w-5 ${c.color}`} />
              <CardTitle className="text-sm">{c.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
