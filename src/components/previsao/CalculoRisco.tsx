import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calcularRiscos, getNivelRiscoCor, getNivelRiscoLabel, getTipoAlertaLabel, type DadosClima, type HistoricoTalhao } from "@/lib/risco-agronomico";
import { ShieldAlert, Bug, Leaf, TreeDeciduous, Droplets } from "lucide-react";
import { mapCategoriaToTipo } from "@/lib/registroConsultorMappers";

const TIPO_ICONS: Record<string, any> = {
  praga: Bug, doenca: ShieldAlert, daninha: TreeDeciduous, nematoide: Leaf, estresse_hidrico: Droplets,
};

export function CalculoRisco() {
  const [fazendaId, setFazendaId] = useState("");

  const { data: fazendas } = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("fazendas").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  const { data: talhoes } = useQuery({
    queryKey: ["talhoes_fazenda", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const { data } = await (supabase as any).from("talhoes").select("id, nome, cultura_id, culturas(nome)").eq("fazenda_id", fazendaId);
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const { data: climaDados } = useQuery({
    queryKey: ["clima_recente", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data } = await (supabase as any).from("clima_dados").select("*").eq("fazenda_id", fazendaId).gte("data_hora", sevenDaysAgo.toISOString()).order("data_hora", { ascending: false });
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const { data: registros } = useQuery({
    queryKey: ["registros_fazenda", fazendaId],
    queryFn: async () => {
      if (!fazendaId) return [];
      const { data } = await (supabase as any)
        .from("registros_consultor")
        .select("talhao_id, categoria_problema, tipo_demanda")
        .eq("fazenda_id", fazendaId);
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const buildClima = (): DadosClima => {
    if (!climaDados?.length) return { temperatura: null, umidade: null, chuva_mm: null, chuva_acumulada_3d: 0, dias_sem_chuva: 0 };
    const latest = climaDados[0];
    const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const chuva3d = climaDados.filter((d: any) => new Date(d.data_hora) >= threeDaysAgo).reduce((s: number, d: any) => s + (Number(d.chuva_mm) || 0), 0);
    let diasSemChuva = 0;
    for (const d of climaDados) { if ((Number((d as any).chuva_mm) || 0) > 1) break; diasSemChuva++; }
    return {
      temperatura: Number(latest.temperatura) || null,
      umidade: Number(latest.umidade) || null,
      chuva_mm: Number(latest.chuva_mm) || null,
      chuva_acumulada_3d: chuva3d,
      dias_sem_chuva: diasSemChuva,
    };
  };

  const buildHistorico = (talhaoId: string): HistoricoTalhao => {
    const tipos = (registros ?? [])
      .filter((r: any) => r.talhao_id === talhaoId)
      .map((r: any) => mapCategoriaToTipo(r.categoria_problema, r.tipo_demanda));
    return {
      ocorrencias_praga: tipos.filter((t) => t === "praga").length,
      ocorrencias_doenca: tipos.filter((t) => t === "doenca").length,
      ocorrencias_nematoide: tipos.filter((t) => t === "nematoide").length,
      ocorrencias_daninha: tipos.filter((t) => t === "daninha" || t === "solo").length,
    };
  };

  const clima = buildClima();

  return (
    <div className="space-y-6">
      <div className="w-64">
        <Select value={fazendaId} onValueChange={setFazendaId}>
          <SelectTrigger><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
          <SelectContent>{(fazendas ?? []).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!fazendaId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione uma fazenda para calcular riscos.</CardContent></Card>
      ) : !climaDados?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados climáticos. Insira dados no Dashboard Climático primeiro.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {(talhoes ?? []).map((t: any) => {
            const riscos = calcularRiscos(clima, buildHistorico(t.id));
            return (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{t.nome} {t.culturas?.nome && <span className="text-muted-foreground font-normal">— {t.culturas.nome}</span>}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {riscos.map(r => {
                      const Icon = TIPO_ICONS[r.tipo];
                      return (
                        <div key={r.tipo} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span className="text-sm font-medium">{getTipoAlertaLabel(r.tipo)}</span>
                          </div>
                          <Badge className={getNivelRiscoCor(r.nivel)}>{getNivelRiscoLabel(r.nivel)}</Badge>
                          <p className="text-xs text-muted-foreground">{r.sugestao}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
