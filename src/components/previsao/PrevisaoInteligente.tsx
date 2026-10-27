import { useState } from "react";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useCriarAlertaClimatico, type CriarAlertaClimaticoArgs } from "@/hooks/useCriarAlertaClimatico";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcularRiscos, getNivelRiscoCor, getNivelRiscoLabel } from "@/lib/risco-agronomico";
import { BrainCircuit, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { mapCategoriaToTipo } from "@/lib/registroConsultorMappers";
import {
  dadosSuficientesParaRisco,
  formatDataHoraSaoPaulo,
  horasDesde,
  motivoDadosInsuficientes,
  resumirClima,
  rotuloFrescor,
} from "@/lib/previsao/clima";

export function PrevisaoInteligente() {
  const [fazendaId, setFazendaId] = useState("");
  const [emAndamento, setEmAndamento] = useState<string | null>(null);

  const fazendasQuery = useScopedPortalQuery<any[]>({
    queryKey: ["previsao-fazendas"],
    queryFn: async (signal) => {
      const { data, error } = await (supabase as any).from("fazendas").select("id, nome").order("nome").abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });

  const talhoesQuery = useScopedPortalQuery<any[]>({
    queryKey: ["talhoes_prev", fazendaId],
    queryFn: async (signal) => {
      const { data, error } = await (supabase as any).from("talhoes").select("id, nome, culturas(nome)").eq("fazenda_id", fazendaId).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const climaQuery = useScopedPortalQuery<any[]>({
    queryKey: ["clima_prev", fazendaId],
    queryFn: async (signal) => {
      const d = new Date(); d.setDate(d.getDate() - 7);
      const { data, error } = await (supabase as any).from("clima_dados").select("*").eq("fazenda_id", fazendaId).gte("data_hora", d.toISOString()).order("data_hora", { ascending: false }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const registrosQuery = useScopedPortalQuery<any[]>({
    queryKey: ["registros_prev", fazendaId],
    queryFn: async (signal) => {
      const { data, error } = await (supabase as any)
        .from("registros_consultor")
        .select("talhao_id, categoria_problema, tipo_demanda")
        .eq("fazenda_id", fazendaId).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!fazendaId,
  });

  const createAlert = useCriarAlertaClimatico();
  const gerarAlerta = (chave: string, args: CriarAlertaClimaticoArgs) => {
    if (emAndamento || createAlert.isPending) return;
    setEmAndamento(chave);
    createAlert.mutate(args, {
      onSuccess: (r) => toast.success(r.criado ? "Alerta criado com sucesso" : "Já existe um alerta ativo equivalente para este talhão"),
      onError: (e) => toast.error(e.message),
      onSettled: () => setEmAndamento(null),
    });
  };

  const buildHistorico = (tId: string) => {
    const tipos = (registrosQuery.data ?? [])
      .filter((x: any) => x.talhao_id === tId)
      .map((x: any) => mapCategoriaToTipo(x.categoria_problema, x.tipo_demanda));
    return {
      ocorrencias_praga: tipos.filter((t) => t === "praga").length,
      ocorrencias_doenca: tipos.filter((t) => t === "doenca").length,
      ocorrencias_nematoide: tipos.filter((t) => t === "nematoide").length,
      ocorrencias_daninha: tipos.filter((t) => t === "daninha" || t === "solo").length,
    };
  };

  const resumo = resumirClima(climaQuery.data ?? []);
  const suficiente = dadosSuficientesParaRisco(resumo);

  const sugestoes = suficiente
    ? (talhoesQuery.data ?? []).flatMap((t: any) => {
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
        return riscos.filter(r => r.nivel === "alto" || r.nivel === "critico").map(r => ({ talhao: t, risco: r }));
      })
    : [];

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
        <Card><CardContent className="py-12 text-center text-muted-foreground">Selecione uma fazenda.</CardContent></Card>
      ) : carregando ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando dados da fazenda...</CardContent></Card>
      ) : erro ? (
        <Card className="border-destructive/40"><CardContent className="py-8 text-center space-y-3">
          <p className="text-sm">Não foi possível carregar os dados para gerar sugestões.</p>
          <Button size="sm" variant="outline" onClick={() => { climaQuery.refetch(); talhoesQuery.refetch(); registrosQuery.refetch(); }}>Tentar novamente</Button>
        </CardContent></Card>
      ) : !suficiente ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{motivoDadosInsuficientes(resumo)}</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sugestões derivadas das leituras já registradas (últimos 7 dias, fuso America/São Paulo) e do histórico de ocorrências dos talhões.
            Última leitura: {formatDataHoraSaoPaulo(resumo.ultimaLeitura)} ({rotuloFrescor(horasDesde(resumo.ultimaLeitura))}).
            Não há projeção meteorológica futura nesta aba: é uma leitura de condições observadas, sujeita a confirmação em campo.
          </p>

          {!sugestoes.length ? (
            <Card><CardContent className="py-12 text-center">
              <BrainCircuit className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum risco alto ou crítico identificado com os dados disponíveis.</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <h3 className="font-semibold">{sugestoes.length} sugestão(ões) de ação</h3>
              </div>
              {sugestoes.map((s) => {
                const chave = `${s.talhao.id}:${s.risco.tipo}`;
                return (
                  <Card key={chave} className="border-l-4" style={{ borderLeftColor: s.risco.nivel === "critico" ? "hsl(0 84% 60%)" : "hsl(25 95% 53%)" }}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{s.talhao.nome}</span>
                            {s.talhao.culturas?.nome && <span className="text-sm text-muted-foreground">({s.talhao.culturas.nome})</span>}
                            <Badge className={getNivelRiscoCor(s.risco.nivel)}>{getNivelRiscoLabel(s.risco.nivel)}</Badge>
                          </div>
                          <p className="text-sm mb-1">{s.risco.descricao}</p>
                          <p className="text-sm font-medium text-primary">💡 {s.risco.sugestao}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={emAndamento !== null || createAlert.isPending}
                          onClick={() => gerarAlerta(chave, {
                            fazendaId, talhaoId: s.talhao.id,
                            tipoAlerta: s.risco.tipo, nivelRisco: s.risco.nivel,
                            descricao: s.risco.descricao,
                          })}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> {emAndamento === chave ? "Gerando..." : "Gerar Alerta"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
