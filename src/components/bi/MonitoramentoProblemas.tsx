import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bug } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { mapCategoriaToTipo, mapPressaoToSeveridade, TIPO_LABEL } from "@/lib/registroConsultorMappers";

export function MonitoramentoProblemas() {
  const { data: registros } = useQuery({
    queryKey: ["bi-mon-registros"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("id, created_at, data_vistoria, categoria_problema, tipo_demanda, nivel_pressao, talhao_id, safra");
      return data || [];
    },
  });

  // Alerts: pressure growth (last 30 days vs previous 30)
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const prev30 = new Date(now.getTime() - 60 * 24 * 3600 * 1000);

  const recentReg = registros?.filter((r: any) => new Date(r.created_at) >= last30).length || 0;
  const prevReg = registros?.filter((r: any) => {
    const dt = new Date(r.created_at);
    return dt >= prev30 && dt < last30;
  }).length || 0;
  const growthPct = prevReg > 0 ? (((recentReg - prevReg) / prevReg) * 100).toFixed(0) : "—";

  // Recurrence: same talhao + same problem category ≥3
  const recurrenceMap: Record<string, number> = {};
  registros?.forEach((r: any) => {
    const tipo = mapCategoriaToTipo(r.categoria_problema, r.tipo_demanda);
    const key = `${r.talhao_id}_${tipo}`;
    recurrenceMap[key] = (recurrenceMap[key] || 0) + 1;
  });
  const recurrentProblems = Object.entries(recurrenceMap).filter(([, v]) => v >= 3);

  // Severity distribution from nivel_pressao
  const sevMap: Record<string, number> = { baixo: 0, medio: 0, alto: 0 };
  registros?.forEach((r: any) => {
    const sev = mapPressaoToSeveridade(r.nivel_pressao);
    sevMap[sev] = (sevMap[sev] || 0) + 1;
  });
  const sevData = [
    { name: "Baixo", value: sevMap.baixo },
    { name: "Médio", value: sevMap.medio },
    { name: "Alto", value: sevMap.alto },
  ];

  // Monthly trend
  const monthMap: Record<string, number> = {};
  registros?.forEach((r: any) => {
    const m = (r.created_at as string).slice(0, 7);
    monthMap[m] = (monthMap[m] || 0) + 1;
  });
  const trendData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, count]) => ({ month: month.slice(5), ocorrencias: count }));

  // High pressure by category
  const pressaoMap: Record<string, number> = {};
  registros?.forEach((r: any) => {
    if (r.nivel_pressao === "alto" || r.nivel_pressao === "severo") {
      const tipo = mapCategoriaToTipo(r.categoria_problema, r.tipo_demanda);
      pressaoMap[tipo] = (pressaoMap[tipo] || 0) + 1;
    }
  });
  const pressaoData = Object.entries(pressaoMap)
    .map(([tipo, value]) => ({ name: TIPO_LABEL[tipo as keyof typeof TIPO_LABEL] || tipo, value }))
    .sort((a, b) => b.value - a.value);

  const alerts: { msg: string; severity: string }[] = [];
  if (growthPct !== "—" && parseInt(growthPct) >= 30) {
    alerts.push({ msg: `Pressão crescente: +${growthPct}% de ocorrências nos últimos 30 dias`, severity: "alta" });
  }
  if (recurrentProblems.length > 0) {
    alerts.push({ msg: `${recurrentProblems.length} problema(s) recorrente(s) detectado(s) (≥3 ocorrências no mesmo talhão)`, severity: "media" });
  }

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <Card key={i} className="border-destructive/50 bg-destructive/5">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <span className="text-sm text-foreground">{a.msg}</span>
                <Badge variant="destructive" className="ml-auto">{a.severity}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Severidade</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sevData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="Ocorrências" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tendência Mensal</CardTitle></CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="ocorrencias" name="Ocorrências" stroke="hsl(160, 84%, 22%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">Dados insuficientes</p>
            )}
          </CardContent>
        </Card>
      </div>

      {pressaoData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base">Pressão Agronômica Elevada (por categoria)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={pressaoData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Registros" fill="hsl(0, 72%, 51%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
