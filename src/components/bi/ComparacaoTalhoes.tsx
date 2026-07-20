import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function calcHealthIndex(ocorrencias: number, sevAlto: number, sevMedio: number): number {
  const penalty = ocorrencias * 5 + sevAlto * 15 + sevMedio * 5;
  return Math.max(0, Math.min(100, 100 - penalty));
}

function healthLabel(idx: number): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  if (idx >= 90) return { label: "Excelente", variant: "default" };
  if (idx >= 70) return { label: "Bom", variant: "secondary" };
  if (idx >= 50) return { label: "Atenção", variant: "outline" };
  return { label: "Crítico", variant: "destructive" };
}

export function ComparacaoTalhoes() {
  const { data: talhoes } = useQuery({
    queryKey: ["bi-comp-talhoes"],
    queryFn: async () => {
      const { data } = await supabase.from("talhoes").select("id, nome, area_hectares, culturas(nome), fazendas(nome)");
      return data || [];
    },
  });

  const { data: registros } = useQuery({
    queryKey: ["bi-comp-reg"],
    queryFn: async () => {
      const { data } = await supabase.from("registros_consultor").select("id, talhao_id, nivel_pressao");
      return data || [];
    },
  });

  const { data: aplicacoes } = useQuery({
    queryKey: ["bi-comp-app"],
    queryFn: async () => {
      const { data } = await supabase.from("aplicacoes").select("id, ordem_servico_id");
      return data || [];
    },
  });

  const { data: os } = useQuery({
    queryKey: ["bi-comp-os"],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_servico").select("id, talhao_id");
      return data || [];
    },
  });

  const stats = talhoes?.map((t: any) => {
    const regsForTalhao = registros?.filter((r: any) => r.talhao_id === t.id) || [];
    const sevAlto = regsForTalhao.filter((r: any) => r.nivel_pressao === "alto" || r.nivel_pressao === "severo").length;
    const sevMedio = regsForTalhao.filter((r: any) => r.nivel_pressao === "medio").length;

    const osForTalhao = os?.filter((o: any) => o.talhao_id === t.id) || [];
    const osIds = new Set(osForTalhao.map((o: any) => o.id));
    const intervencoes = aplicacoes?.filter((a: any) => osIds.has(a.ordem_servico_id)).length || 0;

    const healthIdx = calcHealthIndex(regsForTalhao.length, sevAlto, sevMedio);

    return {
      id: t.id,
      nome: t.nome,
      fazenda: t.fazendas?.nome || "—",
      cultura: t.culturas?.nome || "—",
      ocorrencias: regsForTalhao.length,
      intervencoes,
      healthIdx,
    };
  }).sort((a: any, b: any) => a.healthIdx - b.healthIdx) || [];

  const chartData = stats.slice(0, 15).map((s: any) => ({
    name: s.nome.length > 12 ? s.nome.slice(0, 12) + "…" : s.nome,
    saude: s.healthIdx,
  }));

  return (
    <div className="space-y-6">
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Índice de Saúde dos Talhões</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="saude" name="Saúde" fill="hsl(160, 84%, 22%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Comparação entre Talhões</CardTitle></CardHeader>
        <CardContent>
          {stats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Talhão</TableHead>
                  <TableHead>Fazenda</TableHead>
                  <TableHead>Cultura</TableHead>
                  <TableHead className="text-right">Ocorrências</TableHead>
                  <TableHead className="text-right">Intervenções</TableHead>
                  <TableHead className="text-right">Saúde</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((s: any) => {
                  const h = healthLabel(s.healthIdx);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.nome}</TableCell>
                      <TableCell>{s.fazenda}</TableCell>
                      <TableCell>{s.cultura}</TableCell>
                      <TableCell className="text-right">{s.ocorrencias}</TableCell>
                      <TableCell className="text-right">{s.intervencoes}</TableCell>
                      <TableCell className="text-right font-mono">{s.healthIdx}</TableCell>
                      <TableCell><Badge variant={h.variant}>{h.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhum talhão cadastrado</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
