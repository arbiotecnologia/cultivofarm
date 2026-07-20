import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, AlertTriangle, TrendingDown, ShieldCheck } from "lucide-react";
import { mapCategoriaToTipo } from "@/lib/registroConsultorMappers";

interface Sugestao {
  titulo: string;
  descricao: string;
  tipo: "alerta" | "sugestao" | "melhoria";
  icon: typeof Lightbulb;
}

export function InteligenciaRecomendacao() {
  const { data: registros } = useQuery({
    queryKey: ["bi-int-reg"],
    queryFn: async () => {
      const { data } = await supabase
        .from("registros_consultor")
        .select("id, talhao_id, categoria_problema, tipo_demanda, problema_principal, nivel_pressao, talhoes(nome)");
      return data || [];
    },
  });

  const { data: aplicacoes } = useQuery({
    queryKey: ["bi-int-app"],
    queryFn: async () => {
      const { data } = await supabase.from("aplicacoes").select("id, resultado_inicial, ordem_servico_id");
      return data || [];
    },
  });

  const { data: os } = useQuery({
    queryKey: ["bi-int-os"],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_servico").select("id, produto_id, produtos(nome)");
      return data || [];
    },
  });

  const sugestoes: Sugestao[] = [];

  // Agrupar registros por talhão + tipo unificado
  const byTalhaoTipo: Record<string, { count: number; nome: string; tipo: string; problema: string }> = {};
  registros?.forEach((r: any) => {
    const tipo = mapCategoriaToTipo(r.categoria_problema, r.tipo_demanda);
    const key = `${r.talhao_id}_${tipo}`;
    if (!byTalhaoTipo[key]) {
      byTalhaoTipo[key] = {
        count: 0,
        nome: r.talhoes?.nome || "—",
        tipo,
        problema: r.problema_principal || "",
      };
    }
    byTalhaoTipo[key].count++;
  });

  // Rule 1: Recurrent nematode in same talhão ≥2 times
  Object.values(byTalhaoTipo).forEach(({ count, nome, tipo }) => {
    if (tipo === "nematoide" && count >= 2) {
      sugestoes.push({
        titulo: `Nematóide recorrente no talhão ${nome}`,
        descricao: `${count} ocorrências detectadas. Revisar manejo biológico do solo e considerar rotação de cultura.`,
        tipo: "alerta",
        icon: AlertTriangle,
      });
    }
  });

  // Rule 2: Recurrent pest ≥3 times
  Object.values(byTalhaoTipo).forEach(({ count, nome, tipo, problema }) => {
    if (tipo === "praga" && count >= 3) {
      sugestoes.push({
        titulo: `Praga recorrente${problema ? `: ${problema}` : ""} (talhão ${nome})`,
        descricao: `${count} ocorrências. Sugerir manejo preventivo com protocolo biológico antes da fase crítica.`,
        tipo: "sugestao",
        icon: Lightbulb,
      });
    }
  });

  // Rule 3: Recurrent disease ≥3
  Object.values(byTalhaoTipo).forEach(({ count, nome, tipo }) => {
    if (tipo === "doenca" && count >= 3) {
      sugestoes.push({
        titulo: `Doença recorrente no talhão ${nome}`,
        descricao: `${count} ocorrências de doenças. Sugerir manejo antecipado com fungicida biológico.`,
        tipo: "sugestao",
        icon: ShieldCheck,
      });
    }
  });

  // Rule 4: Products with low efficiency
  const prodAppMap: Record<string, { total: number; bad: number; nome: string }> = {};
  aplicacoes?.forEach((a: any) => {
    const osData = os?.find((o: any) => o.id === a.ordem_servico_id) as any;
    if (osData) {
      const pid = osData.produto_id;
      if (!prodAppMap[pid]) prodAppMap[pid] = { total: 0, bad: 0, nome: osData.produtos?.nome || "—" };
      prodAppMap[pid].total++;
      if (a.resultado_inicial && (a.resultado_inicial.toLowerCase().includes("insuficiente") || a.resultado_inicial.toLowerCase().includes("parcial"))) {
        prodAppMap[pid].bad++;
      }
    }
  });
  Object.entries(prodAppMap).forEach(([, { total, bad, nome }]) => {
    if (total >= 3 && bad / total > 0.5) {
      sugestoes.push({
        titulo: `Produto com baixa eficiência: ${nome}`,
        descricao: `${bad}/${total} aplicações com resultado insatisfatório (${((bad / total) * 100).toFixed(0)}%). Sugerir revisão do protocolo.`,
        tipo: "melhoria",
        icon: TrendingDown,
      });
    }
  });

  // Rule 5: Soil issues ≥2
  Object.values(byTalhaoTipo).forEach(({ count, nome, tipo }) => {
    if (tipo === "solo" && count >= 2) {
      sugestoes.push({
        titulo: `Solo com baixa atividade: talhão ${nome}`,
        descricao: `${count} registros de problemas de solo. Sugerir manejo microbiológico e análise de atividade biológica.`,
        tipo: "sugestao",
        icon: Lightbulb,
      });
    }
  });

  const tipoColors: Record<string, "destructive" | "default" | "secondary"> = {
    alerta: "destructive",
    sugestao: "default",
    melhoria: "secondary",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Sugestões Automáticas de Manejo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Baseado na análise de visitas técnicas, recomendações e resultados de aplicações.
          </p>
        </CardContent>
      </Card>

      {sugestoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldCheck className="h-10 w-10 text-primary mx-auto mb-3" />
            <p className="text-foreground font-medium">Nenhum alerta ou sugestão no momento</p>
            <p className="text-sm text-muted-foreground">O sistema continuará monitorando os dados para gerar insights.</p>
          </CardContent>
        </Card>
      ) : (
        sugestoes.map((s, i) => (
          <Card key={i} className={s.tipo === "alerta" ? "border-destructive/30" : ""}>
            <CardContent className="py-4 px-5 flex items-start gap-4">
              <s.icon className={`h-6 w-6 shrink-0 mt-0.5 ${s.tipo === "alerta" ? "text-destructive" : "text-primary"}`} />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{s.titulo}</span>
                  <Badge variant={tipoColors[s.tipo]}>{s.tipo}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.descricao}</p>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
