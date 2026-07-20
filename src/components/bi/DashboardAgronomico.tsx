import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Grid3X3, Microscope, FileText, Sprout, Ruler, Droplets, Wind } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { mapCategoriaToTipo, TIPO_LABEL } from "@/lib/registroConsultorMappers";

const COLORS = [
  "hsl(160, 84%, 22%)", "hsl(210, 80%, 52%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(262, 60%, 52%)", "hsl(180, 60%, 40%)",
];

const MANEJO_COLORS = {
  irrigado: "hsl(210, 80%, 52%)", // Azul para irrigado
  sequeiro: "hsl(160, 84%, 22%)", // Verde para sequeiro
};

export function DashboardAgronomico() {
  const { data: fazendas } = useQuery({
    queryKey: ["bi-fazendas"],
    queryFn: async () => {
      const { data } = await supabase.from("fazendas").select("id");
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: talhoes } = useQuery({
    queryKey: ["bi-talhoes"],
    queryFn: async () => {
      const { data } = await supabase.from("talhoes").select("id, area_hectares, tipo_manejo_agua");
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: recomendacoes } = useQuery({
    queryKey: ["bi-recomendacoes"],
    queryFn: async () => {
      const { data } = await supabase.from("registros_consultor_recomendacoes").select("id").limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: aplicacoes } = useQuery({
    queryKey: ["bi-aplicacoes"],
    queryFn: async () => {
      const { data } = await supabase.from("aplicacoes").select("id, dose_aplicada").limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: registrosConsultor } = useQuery({
    queryKey: ["bi-registros-consultor"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("id, categoria_problema, tipo_demanda, cultura_id, nivel_pressao, created_at, culturas(nome)")
        .order("created_at", { ascending: false })
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const areaTotal = talhoes?.reduce((acc, t) => acc + (t.area_hectares || 0), 0) || 0;
  
  // Manejo Hídrico Analysis
  const areaIrrigada = talhoes?.filter(t => t.tipo_manejo_agua === 'irrigado').reduce((acc, t) => acc + (t.area_hectares || 0), 0) || 0;
  const areaSequeiro = talhoes?.filter(t => t.tipo_manejo_agua === 'sequeiro').reduce((acc, t) => acc + (t.area_hectares || 0), 0) || 0;
  const percentualIrrigado = areaTotal > 0 ? (areaIrrigada / areaTotal) * 100 : 0;

  const kpis = [
    { label: "Fazendas Monitoradas", value: fazendas?.length || 0, icon: MapPin },
    { label: "Talhões Monitorados", value: talhoes?.length || 0, icon: Grid3X3 },
    { label: "Ocorrências Registradas", value: registrosConsultor?.length || 0, icon: Microscope },
    { label: "Recomendações Emitidas", value: recomendacoes?.length || 0, icon: FileText },
    { label: "Área Total (ha)", value: areaTotal.toFixed(1), icon: Ruler },
    { label: "Área Irrigada (ha)", value: areaIrrigada.toFixed(1), icon: Droplets, sub: `${percentualIrrigado.toFixed(1)}% do total` },
  ];

  // Problems by type
  const problemCountMap: Record<string, number> = {};
  registrosConsultor?.forEach((r: any) => {
    const tipo = mapCategoriaToTipo(r.categoria_problema, r.tipo_demanda);
    problemCountMap[tipo] = (problemCountMap[tipo] || 0) + 1;
  });

  const problemData = Object.entries(problemCountMap)
    .map(([tipo, count]) => ({ name: TIPO_LABEL[tipo as keyof typeof TIPO_LABEL] || tipo, value: count }))
    .sort((a, b) => b.value - a.value);

  const manejoData = [
    { name: "Sequeiro", value: Number(areaSequeiro.toFixed(1)), fill: MANEJO_COLORS.sequeiro },
    { name: "Irrigado", value: Number(areaIrrigada.toFixed(1)), fill: MANEJO_COLORS.irrigado },
  ].filter(d => d.value > 0);

  // Occurrences by culture
  const cultureMap: Record<string, number> = {};
  registrosConsultor?.forEach((r: any) => {
    const nome = r.culturas?.nome || "Sem cultura";
    cultureMap[nome] = (cultureMap[nome] || 0) + 1;
  });
  const cultureData = Object.entries(cultureMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              {"sub" in kpi && <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Droplets className="h-4 w-4" /> Manejo Hídrico (Área)</CardTitle></CardHeader>
          <CardContent>
            {manejoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 250 : 300}>
                <PieChart>
                  <Pie 
                    data={manejoData} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60}
                    outerRadius={80} 
                    paddingAngle={5}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {manejoData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} ha`, "Área"]} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-12">Nenhum talhão cadastrado</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Problemas Mais Registrados</CardTitle></CardHeader>
          <CardContent>
            {problemData.length > 0 ? (
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 250 : 300}>
                <BarChart data={problemData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(160, 84%, 22%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-12">Nenhuma ocorrência registrada</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Ocorrências por Cultura</CardTitle></CardHeader>
          <CardContent>
            {cultureData.length > 0 ? (
              <ResponsiveContainer width="100%" height={window.innerWidth < 640 ? 250 : 300}>
                <PieChart>
                  <Pie data={cultureData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {cultureData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-12">Nenhum dado disponível</p>
            )}
          </CardContent>
        </Card>

        {/* Placeholder for future specific irrigation analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eficiência Hídrica (Em Breve)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Droplets className="h-12 w-12 text-blue-100 mb-4" />
            <p className="text-sm text-muted-foreground max-w-[250px]">
              Novos gráficos de produtividade comparada entre Irrigado e Sequeiro serão ativados conforme o histórico de colheitas for registrado.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}