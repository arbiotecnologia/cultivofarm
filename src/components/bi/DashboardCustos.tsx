import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { brl } from "@/lib/financial/format";

export function DashboardCustos() {
  const { data: stats } = useQuery({
    queryKey: ["bi-costs-analysis"],
    queryFn: async () => {
      // Fetch OS with their products and linked lots (via programacao)
      const { data: oss } = await supabase
        .from("ordens_servico")
        .select(`
          id, 
          numero_os, 
          area_hectares,
          produtos(nome, valor_ha_brl),
          programacao_producao(lotes(custo_producao_estimado))
        `);
      
      const analysis = (oss || []).map((os: any) => {
        const valorVenda = (Number(os.area_hectares || 0) * Number(os.produtos?.valor_ha_brl || 0));
        const custoProducao = (os.programacao_producao || []).reduce((acc: number, p: any) => {
          const lotesCusto = (p.lotes || []).reduce((lacc: number, l: any) => lacc + Number(l.custo_producao_estimado || 0), 0);
          return acc + lotesCusto;
        }, 0);

        const margem = valorVenda - custoProducao;
        const margemPct = valorVenda > 0 ? (margem / valorVenda) * 100 : 0;

        return {
          id: os.id,
          numero: os.numero_os || "—",
          produto: os.produtos?.nome || "—",
          venda: valorVenda,
          custo: custoProducao,
          margem,
          margemPct,
        };
      }).filter(a => a.venda > 0 || a.custo > 0);

      return analysis;
    },
  });

  const avgMargem = stats?.length ? stats.reduce((acc, s) => acc + s.margemPct, 0) / stats.length : 0;

  const COLORS = ["#10b981", "#f59e0b", "#ef4444"];
  const pieData = [
    { name: "Rentáveis (>30%)", value: stats?.filter(s => s.margemPct >= 30).length || 0 },
    { name: "Alerta (10-30%)", value: stats?.filter(s => s.margemPct >= 10 && s.margemPct < 30).length || 0 },
    { name: "Críticos (<10%)", value: stats?.filter(s => s.margemPct < 10).length || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Margem Média Bruta</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{avgMargem.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Distribuição de Lucratividade</CardTitle></CardHeader>
          <CardContent className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={30} outerRadius={50} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-bold">Análise de Custos por OS</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº OS</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Venda (R$)</TableHead>
                <TableHead className="text-right">Custo (R$)</TableHead>
                <TableHead className="text-right">Margem %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats?.slice().reverse().map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono-data font-medium">{s.numero}</TableCell>
                  <TableCell className="text-xs">{s.produto}</TableCell>
                  <TableCell className="text-right text-xs">{brl(s.venda)}</TableCell>
                  <TableCell className="text-right text-xs">{brl(s.custo)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={s.margemPct >= 30 ? "default" : s.margemPct >= 10 ? "secondary" : "destructive"}>
                      {s.margemPct.toFixed(0)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!stats || stats.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum dado financeiro disponível</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
