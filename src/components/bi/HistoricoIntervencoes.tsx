import { formatDateDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function HistoricoIntervencoes() {
  const { data: aplicacoes } = useQuery({
    queryKey: ["bi-hist-app"],
    queryFn: async () => {
      const { data } = await supabase.from("aplicacoes").select("id, data_aplicacao, dose_aplicada, resultado_inicial, responsavel, equipamento, ordem_servico_id");
      return data || [];
    },
  });

  const { data: os } = useQuery({
    queryKey: ["bi-hist-os"],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_servico").select("id, produto_id, area_hectares, produtos(nome)");
      return data || [];
    },
  });

  const { data: registros } = useQuery({
    queryKey: ["bi-hist-reg"],
    queryFn: async () => {
      const { data } = await supabase.from("registros_consultor").select("id, created_at, status");
      return data || [];
    },
  });

  // Monthly evolution: occurrences vs interventions
  const monthlyOcc: Record<string, number> = {};
  const monthlyInt: Record<string, number> = {};
  registros?.forEach((r: any) => {
    const m = (r.created_at as string).slice(0, 7);
    monthlyOcc[m] = (monthlyOcc[m] || 0) + 1;
  });
  aplicacoes?.forEach((a: any) => {
    const m = a.data_aplicacao.slice(0, 7);
    monthlyInt[m] = (monthlyInt[m] || 0) + 1;
  });

  const allMonths = [...new Set([...Object.keys(monthlyOcc), ...Object.keys(monthlyInt)])].sort().slice(-12);
  const evolutionData = allMonths.map((m) => ({
    month: m.slice(5),
    ocorrencias: monthlyOcc[m] || 0,
    intervencoes: monthlyInt[m] || 0,
  }));

  // Recent interventions table
  const recentApps = [...(aplicacoes || [])]
    .sort((a: any, b: any) => b.data_aplicacao.localeCompare(a.data_aplicacao))
    .slice(0, 20)
    .map((a: any) => {
      const osData = os?.find((o: any) => o.id === a.ordem_servico_id) as any;
      return {
        ...a,
        produto: osData?.produtos?.nome || "—",
        area: osData?.area_hectares || 0,
      };
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Evolução: Ocorrências vs Intervenções</CardTitle></CardHeader>
        <CardContent>
          {evolutionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ocorrencias" name="Ocorrências" stroke="hsl(0, 72%, 51%)" strokeWidth={2} />
                <Line type="monotone" dataKey="intervencoes" name="Intervenções" stroke="hsl(160, 84%, 22%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Dados insuficientes</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimas Intervenções</CardTitle></CardHeader>
        <CardContent>
          {recentApps.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Dose</TableHead>
                  <TableHead className="text-right">Área (ha)</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentApps.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{formatDateDisplay(a.data_aplicacao)}</TableCell>
                    <TableCell className="font-medium">{a.produto}</TableCell>
                    <TableCell className="text-right">{a.dose_aplicada || "—"}</TableCell>
                    <TableCell className="text-right">{a.area || "—"}</TableCell>
                    <TableCell>{a.resultado_inicial || "—"}</TableCell>
                    <TableCell>{a.responsavel || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma intervenção registrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
