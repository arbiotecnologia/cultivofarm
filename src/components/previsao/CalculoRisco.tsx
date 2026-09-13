import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calcularRiscos, getNivelRiscoCor, getNivelRiscoLabel, getTipoAlertaLabel } from "@/lib/risco-agronomico";
import { ShieldAlert, Bug, Leaf, TreeDeciduous, Droplets } from "lucide-react";
import { mapCategoriaToTipo } from "@/lib/registroConsultorMappers";
import {
  dadosSuficientesParaRisco,
  formatDataHoraSaoPaulo,
  motivoDadosInsuficientes,
  resumirClima,
  rotuloFrescor,
  horasDesde,
} from "@/lib/previsao/clima";

const TIPO_ICONS: Record<string, any> = {
  praga: Bug, doenca: ShieldAlert, daninha: TreeDeciduous, nematoide: Leaf, estresse_hidrico: Droplets,
};

export function CalculoRisco() {
  const [fazendaId, setFazendaId] = useState("");

  const fazendasQuery = useQuery({
    queryKey: ["fazendas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fazendas").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const talhoesQuery = useQuery({
    queryKey: ["talhoes_fazenda", fazendaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("talhoes").select("id, nome, cultura_id, culturas(nome)").eq("fazenda_id", fazendaId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const climaQuery = useQuery({
    queryKey: ["clima_recente", fazendaId],
    queryFn: async () => {
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await (supabase as any).from("clima_dados").select("*").eq("fazenda_id", fazendaId).gte("data_hora", sevenDaysAgo.toISOString()).order("data_hora", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const registrosQuery = useQuery({
    queryKey: ["registros_fazenda", fazendaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("registros_consultor")
        .select("talhao_id, categoria_problema, tipo_demanda")
        .eq("fazenda_id", fazendaId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const resumo = resumirClima(climaQuery.data ?? []);
  const suficiente = dadosSuficientesParaRisco(resumo);

  const buildHistorico = (talhaoId: string) => {
    const tipos = (registrosQuery.data ?? [])
      .filter((r: any) => r.talhao_id === talhaoId)
      .map((r: any) => mapCategoriaToTipo(r.categoria_problema, r.tipo_demanda));
    return {
      ocorrencias_praga: tipos.filter((t) => t === "praga").length,
      ocorrencias_doenca: tipos.filter((t) => t === "doenca").length,
      ocorrencias_nematoide: tipos.filter((t) => t === "nematoide").length,
      ocorrencias_daninha: tipos.filter((t) => t === "daninha" || t === "solo").length,
    };
  };

  const carregando = climaQuery.isLoading || talhoesQuery.isLoading;
  const erro = climaQuery.isError || talhoesQuery.isError || registrosQuery.isError;

  return (
    <div className="space-y-6">
      <div className="w-64">
        <Select value={fazendaId} onValueChange={setFazendaId}>
          <SelectTrigger aria-label="Selecionar fazenda"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
          <SelectContent>{(fazendasQuery.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!fazendaId ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione uma fazenda para calcular riscos.</CardContent></Card>
      ) : carregando ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando dados da fazenda...</CardContent></Card>
      ) : erro ? (
        <Card className="border-destructive/40"><CardContent className="py-8 text-center space-y-3">
          <p className="text-sm">Não foi possível carregar os dados necessários ao cálculo de risco.</p>
          <Button size="sm" variant="outline" onClick={() => { climaQuery.refetch(); talhoesQuery.refetch(); registrosQuery.refetch(); }}>Tentar novamente</Button>
        </CardContent></Card>
      ) : !suficiente ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground space-y-2">
          <p>{motivoDadosInsuficientes(resumo)}</p>
          <p className="text-xs">Registre ou sincronize dados no Dashboard Climático antes de calcular o risco.</p>
        </CardContent></Card>
      ) : !(talhoesQuery.data ?? []).length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Esta fazenda não possui talhões cadastrados.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Base do cálculo: leitura mais recente de {formatDataHoraSaoPaulo(resumo.ultimaLeitura)} ({rotuloFrescor(horasDesde(resumo.ultimaLeitura))}),
            {" "}{resumo.leituras} leitura(s) nos últimos 7 dias e histórico de ocorrências registradas por talhão.
            Regras internas de classificação — não substituem avaliação agronômica em campo.
          </p>
          {(talhoesQuery.data ?? []).map((t: any) => {
            const riscos = calcularRiscos(
              {
                temperatura: resumo.temperatura,
                umidade: resumo.umidade,
                chuva_mm: resumo.chuva_mm,
                chuva_acumulada_3d: resumo.chuva_acumulada_3d,
                dias_sem_chuva: resumo.dias_sem_chuva,
              },
              buildHistorico(t.id)
            );
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
                          <p className="text-xs">{r.descricao}</p>
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
