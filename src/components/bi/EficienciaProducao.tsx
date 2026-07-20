import { formatDateDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function EficienciaProducao() {
  const { data: lotes } = useQuery({
    queryKey: ["bi-prod-efficiency"],
    queryFn: async () => {
      const { data } = await supabase
        .from("lotes")
        .select(`
          id, 
          codigo_lote, 
          volume_produzido, 
          created_at,
          produtos(nome),
          programacao_producao(volume_necessario)
        `)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const stats = lotes?.map((l: any) => {
    const real = Number(l.volume_produzido || 0) / 1000;
    const teorico = Number(l.programacao_producao?.volume_necessario || 0) / 1000;
    const eficiencia = teorico > 0 ? (real / teorico) * 100 : 100;

    return {
      id: l.id,
      codigo: l.codigo_lote,
      produto: l.produtos?.nome || "—",
      data: formatDateDisplay(l.created_at),
      real,
      teorico,
      eficiencia: Math.round(eficiencia),
    };
  }) || [];

  const chartData = stats.slice(-15);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Rendimento: Teórico vs Real (Litros)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="codigo" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="teorico" name="Meta (L)" stroke="#94a3b8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="real" name="Produzido (L)" stroke="#10b981" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Desempenho por Lote</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Teórico (L)</TableHead>
                <TableHead className="text-right">Real (L)</TableHead>
                <TableHead className="text-right">Eficiência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.slice().reverse().map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono-data font-medium">{s.codigo}</TableCell>
                  <TableCell>{s.produto}</TableCell>
                  <TableCell className="text-right">{s.teorico.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-600">{s.real.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={s.eficiencia >= 95 ? "default" : s.eficiencia >= 80 ? "secondary" : "destructive"}>
                      {s.eficiencia}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
