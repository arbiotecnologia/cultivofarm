import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcularRiscos, getNivelRiscoCor, getNivelRiscoLabel, getTipoAlertaLabel, type DadosClima, type HistoricoTalhao } from "@/lib/risco-agronomico";
import { BrainCircuit, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { mapCategoriaToTipo } from "@/lib/registroConsultorMappers";

export function PrevisaoInteligente() {
  const [fazendaId, setFazendaId] = useState("");
  const queryClient = useQueryClient();

  const { data: fazendas } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => { const { data } = await supabase.from("fazendas").select("id, nome").order("nome"); return data ?? []; },
  });

  const { data: talhoes } = useQuery({
    queryKey: ["talhoes_prev", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const { data } = await supabase.from("talhoes").select("id, nome, culturas(nome)").eq("fazenda_id", fazendaId);
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const { data: climaDados } = useQuery({
    queryKey: ["clima_prev", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const d = new Date(); d.setDate(d.getDate() - 7);
      const { data } = await supabase.from("clima_dados").select("*").eq("fazenda_id", fazendaId).gte("data_hora", d.toISOString()).order("data_hora", { ascending: false });
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const { data: registros } = useQuery({
    queryKey: ["registros_prev", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const { data } = await supabase
        .from("registros_consultor")
        .select("talhao_id, categoria_problema, tipo_demanda")
        .eq("fazenda_id", fazendaId);
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const createAlert = useMutation({
    mutationFn: async (params: { fazenda_id: string; talhao_id: string; tipo_alerta: string; nivel_risco: string; descricao: string }) => {
      const { error } = await supabase.from("alertas_agronomicos").insert(params as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alertas_agronomicos"] }); toast.success("Alerta criado com sucesso"); },
    onError: () => toast.error("Erro ao criar alerta"),
  });

  const buildClima = (): DadosClima => {
    if (!climaDados?.length) return { temperatura: null, umidade: null, chuva_mm: null, chuva_acumulada_3d: 0, dias_sem_chuva: 0 };
    const latest = climaDados[0];
    const d3 = new Date(); d3.setDate(d3.getDate() - 3);
    const chuva3d = climaDados.filter((d: any) => new Date(d.data_hora) >= d3).reduce((s: number, d: any) => s + (Number(d.chuva_mm) || 0), 0);
    let diasSem = 0; for (const d of climaDados) { if ((Number((d as any).chuva_mm) || 0) > 1) break; diasSem++; }
    return { temperatura: Number(latest.temperatura) || null, umidade: Number(latest.umidade) || null, chuva_mm: Number(latest.chuva_mm) || null, chuva_acumulada_3d: chuva3d, dias_sem_chuva: diasSem };
  };

  const buildHistorico = (tId: string): HistoricoTalhao => {
    const tipos = (registros ?? [])
      .filter((x: any) => x.talhao_id === tId)
      .map((x: any) => mapCategoriaToTipo(x.categoria_problema, x.tipo_demanda));
    return {
      ocorrencias_praga: tipos.filter((t) => t === "praga").length,
      ocorrencias_doenca: tipos.filter((t) => t === "doenca").length,
      ocorrencias_nematoide: tipos.filter((t) => t === "nematoide").length,
      ocorrencias_daninha: tipos.filter((t) => t === "daninha" || t === "solo").length,
    };
  };

  const clima = buildClima();
  const sugestoes = (talhoes ?? []).flatMap((t: any) => {
    const riscos = calcularRiscos(clima, buildHistorico(t.id));
    return riscos.filter(r => r.nivel === "alto" || r.nivel === "critico").map(r => ({ talhao: t, risco: r }));
  });

  return (
    <div className="space-y-6">
      <div className="w-64">
        <Select value={fazendaId} onValueChange={setFazendaId}>
          <SelectTrigger><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
          <SelectContent>{(fazendas ?? []).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!fazendaId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione uma fazenda.</CardContent></Card>
      ) : !climaDados?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados climáticos para gerar previsões.</CardContent></Card>
      ) : !sugestoes.length ? (
        <Card><CardContent className="py-12 text-center">
          <BrainCircuit className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum risco alto ou crítico identificado. Todas as áreas estão em condições favoráveis.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">{sugestoes.length} sugestão(ões) de ação</h3>
          </div>
          {sugestoes.map((s, i) => (
            <Card key={i} className="border-l-4" style={{ borderLeftColor: s.risco.nivel === "critico" ? "hsl(0 84% 60%)" : "hsl(25 95% 53%)" }}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{s.talhao.nome}</span>
                      {s.talhao.culturas?.nome && <span className="text-sm text-muted-foreground">({s.talhao.culturas.nome})</span>}
                      <Badge className={getNivelRiscoCor(s.risco.nivel)}>{getNivelRiscoLabel(s.risco.nivel)}</Badge>
                    </div>
                    <p className="text-sm mb-1">{s.risco.descricao}</p>
                    <p className="text-sm font-medium text-primary">💡 {s.risco.sugestao}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => createAlert.mutate({
                    fazenda_id: fazendaId, talhao_id: s.talhao.id,
                    tipo_alerta: s.risco.tipo, nivel_risco: s.risco.nivel,
                    descricao: s.risco.descricao,
                  })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Gerar Alerta
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
