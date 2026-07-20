import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function EficienciaBioinsumos() {
  const { data: produtos } = useQuery({
    queryKey: ["bi-eff-prod"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id, nome, tipo");
      return data || [];
    },
  });

  const { data: ordensServico } = useQuery({
    queryKey: ["bi-eff-os"],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_servico").select("id, produto_id, area_hectares, status");
      return data || [];
    },
  });

  const { data: aplicacoes } = useQuery({
    queryKey: ["bi-eff-app"],
    queryFn: async () => {
      const { data } = await supabase.from("aplicacoes").select("id, ordem_servico_id, resultado_inicial");
      return data || [];
    },
  });

  // Build per-product stats
  const prodStats = produtos?.map((p: any) => {
    const osForProduct = ordensServico?.filter((os: any) => os.produto_id === p.id) || [];
    const osIds = new Set(osForProduct.map((os: any) => os.id));
    const appsForProduct = aplicacoes?.filter((a: any) => osIds.has(a.ordem_servico_id)) || [];

    const areaTratada = osForProduct.reduce((acc: number, os: any) => acc + (os.area_hectares || 0), 0);
    const numApps = appsForProduct.length;

    const successResults = ["controle_satisfatorio", "satisfatorio", "bom", "excelente"];
    const sucessos = appsForProduct.filter((a: any) =>
      a.resultado_inicial && successResults.some((s) => a.resultado_inicial.toLowerCase().includes(s))
    ).length;

    const taxaSucesso = numApps > 0 ? ((sucessos / numApps) * 100) : 0;

    // Recurrence: OS finalizadas that had repeated problems
    const recorrencia = osForProduct.filter((os: any) => os.status === "finalizada").length;

    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      numAplicacoes: numApps,
      areaTratada: areaTratada.toFixed(1),
      taxaSucesso: taxaSucesso.toFixed(0),
      recorrencia,
    };
  }).filter((p: any) => p.numAplicacoes > 0) || [];

  const chartData = prodStats.slice(0, 10).map((p: any) => ({
    name: p.nome.length > 15 ? p.nome.slice(0, 15) + "…" : p.nome,
    aplicacoes: p.numAplicacoes,
    area: parseFloat(p.areaTratada),
  }));

  const getEficienciaBadge = (taxa: string) => {
    const n = parseInt(taxa);
    if (n >= 70) return <Badge className="bg-primary text-primary-foreground">Satisfatório</Badge>;
    if (n >= 40) return <Badge variant="secondary">Parcial</Badge>;
    return <Badge variant="destructive">Insuficiente</Badge>;
  };

  return (
    <div className="space-y-6">
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Aplicações e Área por Produto</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="aplicacoes" name="Aplicações" fill="hsl(160, 84%, 22%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="area" name="Área (ha)" fill="hsl(210, 80%, 52%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Eficiência por Produto</CardTitle></CardHeader>
        <CardContent>
          {prodStats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Aplicações</TableHead>
                  <TableHead className="text-right">Área (ha)</TableHead>
                  <TableHead className="text-right">Taxa Sucesso</TableHead>
                  <TableHead>Classificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prodStats.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.tipo}</TableCell>
                    <TableCell className="text-right">{p.numAplicacoes}</TableCell>
                    <TableCell className="text-right">{p.areaTratada}</TableCell>
                    <TableCell className="text-right">{p.taxaSucesso}%</TableCell>
                    <TableCell>{getEficienciaBadge(p.taxaSucesso)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma aplicação registrada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
