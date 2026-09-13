import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, AlertTriangle, Sprout, FlaskConical, Cloud, Camera, X, ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { dataLocal, validarAplicacao } from "@/lib/aplicacoes/validacao";
import { EvidenciasUploader, uploadEvidencias, limparObjetosEvidencias, PendingEvidencia } from "./EvidenciasUploader";
import { validarMotivoRetificacao } from "@/lib/aplicacoes/evidencias";

import { dependentesNovaOS, totalAplicacao, unidadeAplicacao } from "@/lib/aplicacoes/unidades";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";

const MODOS = ["Pulverização foliar", "Aplicação no colo da planta", "Via solo", "Tratamento de semente", "Sulco de plantio", "Jato dirigido"];
const RESULTADOS = [
  { value: "satisfatorio", label: "Satisfatório" },
  { value: "parcial", label: "Parcial" },
  { value: "insuficiente", label: "Insuficiente" },
  { value: "em_avaliacao", label: "Em avaliação" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultOsId?: string;
  rectifyId?: string; // ID da aplicação a ser retificada
  onSuccess?: () => void;
}


export function AplicacaoFormDialog({ open, onOpenChange, defaultOsId, rectifyId, onSuccess }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { finalizarOS } = useEsteiraLaboratorio();


  const [osId, setOsId] = useState(defaultOsId || "");
  const [dataAplicacao, setDataAplicacao] = useState(dataLocal().slice(0, 10));
  const [horaInicio, setHoraInicio] = useState<string>(dataLocal());
  const [horaFim, setHoraFim] = useState<string>("");
  const [responsavelId, setResponsavelId] = useState(user?.id || "");
  const [modoAplicacao, setModoAplicacao] = useState("");
  const [loteId, setLoteId] = useState("");
  const [doseAplicada, setDoseAplicada] = useState("");
  const [volumeCalda, setVolumeCalda] = useState("");
  const [areaAplicada, setAreaAplicada] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [equipamentoModelo, setEquipamentoModelo] = useState("");
  const [bicoTipo, setBicoTipo] = useState("");
  const [pressaoBar, setPressaoBar] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [umidade, setUmidade] = useState("");
  const [vento, setVento] = useState("");
  const [condicoes, setCondicoes] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [resultado, setResultado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [motivoRetificacao, setMotivoRetificacao] = useState("");
  const [evidencias, setEvidencias] = useState<PendingEvidencia[]>([]);
  const [evidenciasParaManter, setEvidenciasParaManter] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  // Busca dados da aplicação para retificação
  const { data: aplicacaoOriginal, isLoading: loadingOriginal } = useQuery({
    queryKey: ["aplicacao", rectifyId],
    enabled: !!rectifyId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("aplicacoes").select("*").eq("id", rectifyId).single();
      if (error) throw error;
      return data;
    },
  });

  // Busca evidências da aplicação original para reutilizar
  const { data: evidenciasOriginais = [] } = useQuery({
    queryKey: ["aplicacao-evidencias", rectifyId],
    enabled: !!rectifyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aplicacao_evidencias_vinculos")
        .select(`
          evidencia:evidencia_id (
            id, tipo, url, storage_path, legenda, mime, tamanho_bytes, versao_origem_id
          )
        `)
        .eq("aplicacao_id", rectifyId);
        
      if (error) throw error;
      return data?.map((d: any) => d.evidencia).filter(Boolean) || [];
    },
  });

  useEffect(() => {
    if (evidenciasOriginais.length && rectifyId) {
      setEvidenciasParaManter(evidenciasOriginais.map(e => e.id));
    }
  }, [evidenciasOriginais, rectifyId]);

  useEffect(() => {
    if (aplicacaoOriginal) {
      setOsId(aplicacaoOriginal.ordem_servico_id);
      setDataAplicacao(aplicacaoOriginal.data_aplicacao);
      setHoraInicio(aplicacaoOriginal.hora_inicio ? dataLocal(new Date(aplicacaoOriginal.hora_inicio)) : "");
      setHoraFim(aplicacaoOriginal.hora_fim ? dataLocal(new Date(aplicacaoOriginal.hora_fim)) : "");
      setResponsavelId(aplicacaoOriginal.responsavel_id || "");
      setModoAplicacao(aplicacaoOriginal.modo_aplicacao || "");
      setLoteId(aplicacaoOriginal.lote_usado_id || "");
      setDoseAplicada(String(aplicacaoOriginal.dose_aplicada || ""));
      setVolumeCalda(String(aplicacaoOriginal.volume_calda_l_ha || ""));
      setAreaAplicada(String(aplicacaoOriginal.area_aplicada_ha || ""));
      setEquipamento((aplicacaoOriginal as any).equipamento || "");
      setEquipamentoModelo((aplicacaoOriginal as any).equipamento_modelo || "");
      setBicoTipo((aplicacaoOriginal as any).bico_tipo || "");
      setPressaoBar(String((aplicacaoOriginal as any).pressao_bar || ""));
      setTemperatura(String((aplicacaoOriginal as any).temperatura_c || ""));
      setUmidade(String((aplicacaoOriginal as any).umidade_pct || ""));
      setVento(String((aplicacaoOriginal as any).vento_kmh || ""));
      setCondicoes((aplicacaoOriginal as any).condicoes_climaticas || "");
      setLatitude((aplicacaoOriginal as any).latitude);
      setLongitude((aplicacaoOriginal as any).longitude);
      setResultado((aplicacaoOriginal as any).resultado_inicial || "");
      setObservacoes(aplicacaoOriginal.observacoes || "");
    }
  }, [aplicacaoOriginal]);

  useEffect(() => { if (defaultOsId) setOsId(defaultOsId); }, [defaultOsId]);

  const { data: ordens = [] } = useQuery({
    queryKey: ["os-para-aplicar"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico")
        .select("id, cliente_id, area_hectares, volume_total_ml, status, clientes(nome), fazendas(nome), talhoes(nome), produtos(id, nome, dose_ml_ha)")
        .in("status", ["entregue", "pronto_entrega", "envase"] as any)
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const osSel = ordens.find((o: any) => o.id === osId);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes-produto", (osSel as any)?.produtos?.id],
    enabled: !!(osSel as any)?.produtos?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lotes").select("id, codigo_lote, volume_produzido, status")
        .eq("produto_id", (osSel as any).produtos.id).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-aplicador"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome").eq("ativo", true).order("nome").limit(200);
      return data || [];
    },
  });

  // ordens_servico não possui unidade nem vínculo de prescrição; dose_ml_ha
  // do catálogo não prova a unidade da recomendação desta OS.
  const unidade = unidadeAplicacao(null);
  const erroUnidade = osId
    ? "A OS não informa uma unidade inequívoca da recomendação. Registro bloqueado até que esse vínculo esteja disponível."
    : "Selecione a OS";
  const total = totalAplicacao(doseAplicada, areaAplicada, unidade?.dose);
  const volumeTotal = total?.valor ?? 0;
  const desvioAlto = false; // Sem recomendação vinculada, não comparar ao catálogo atual.
  const desvioPct = 0;

  const trocarOS = (id: string) => {
    if (id === osId) return;
    const limpos = dependentesNovaOS();
    setOsId(id);
    setDoseAplicada(limpos.dose);
    setAreaAplicada(limpos.area);
    setLoteId(limpos.lote);
    setVolumeCalda(limpos.calda);
    setModoAplicacao("");
    setEvidencias([]);
    setEvidenciasParaManter([]);
  };

  const capturarGPS = () => {
    if (!navigator.geolocation) return toast.error("GPS não disponível");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLatitude(pos.coords.latitude); setLongitude(pos.coords.longitude); toast.success("Localização capturada"); },
      () => toast.error("Não foi possível obter localização")
    );
  };

  const submit = async () => {
    if (submittingRef.current) return;
    if (!unidade) return toast.error(erroUnidade);
    if (loteId && !lotes.some(l => l.id === loteId)) return toast.error("Selecione um lote do produto da OS");
    const erro = validarAplicacao({
      dataAplicacao,
      osId,
      doseAplicada,
      areaAplicada,
      volumeCalda,
      pressaoBar,
      umidade,
      vento,
      temperatura,
      horaInicio,
      horaFim,
      rectifyId,
      motivoRetificacao,
    });
    if (erro) return toast.error(erro);

    submittingRef.current = true;
    setSaving(true);
    try {
      const aplicacaoData = {
        ordem_servico_id: osId,
        data_aplicacao: dataAplicacao,
        hora_inicio: horaInicio ? new Date(horaInicio).toISOString() : null,
        hora_fim: horaFim ? new Date(horaFim).toISOString() : null,
        responsavel_id: responsavelId || null,
        responsavel: profiles.find((p: any) => p.user_id === responsavelId)?.nome || null,
        modo_aplicacao: modoAplicacao || null,
        produto_usado_id: (osSel as any)?.produtos?.id || null,
        lote_usado_id: loteId || null,
        dose_aplicada: Number(doseAplicada),
        volume_calda_l_ha: volumeCalda ? Number(volumeCalda) : null,
        volume_total_aplicado_ml: unidade.total === "mL" ? volumeTotal : null,
        area_aplicada_ha: Number(areaAplicada),
        equipamento: equipamento || null,
        equipamento_modelo: equipamentoModelo || null,
        bico_tipo: bicoTipo || null,
        pressao_bar: pressaoBar ? Number(pressaoBar) : null,
        temperatura_c: temperatura ? Number(temperatura) : null,
        umidade_pct: umidade ? Number(umidade) : null,
        vento_kmh: vento ? Number(vento) : null,
        condicoes_climaticas: condicoes || null,
        latitude, longitude,
        resultado_inicial: (resultado as any) || null,
        observacoes: observacoes || null,
        created_by: user?.id || null,
        // Campos de retificação
        parent_id: rectifyId || null,
        versao: rectifyId && aplicacaoOriginal ? (aplicacaoOriginal.versao || 1) + 1 : 1,
        motivo_retificacao: motivoRetificacao || null,
        is_latest: true
      };

      // Se for retificação, desativa a anterior
      if (rectifyId) {
        await supabase.from("aplicacoes").update({ is_latest: false }).eq("id", rectifyId);
      }

      const { data: ins, error } = await supabase.from("aplicacoes").insert(aplicacaoData as any).select("id").single();
      if (error) throw error;

      if (evidencias.length && osSel) {
        await uploadEvidencias(evidencias, ins.id, (osSel as any).cliente_id, user?.id);
      }

      // Reutiliza evidências da versão anterior (apenas cria vínculos)
      if (rectifyId && evidenciasParaManter.length) {
        const vinculos = evidenciasParaManter.map(evId => ({
          aplicacao_id: ins.id,
          evidencia_id: evId
        }));
        await supabase.from("aplicacao_evidencias_vinculos").insert(vinculos);
      }

      // Só finaliza OS se for novo registro ou se quiser garantir que continue finalizada
      const { data: osProg } = await supabase.from("programacao_producao").select("id").eq("ordem_servico_id", osId).limit(1).maybeSingle();
      
      if (osProg) {
        await finalizarOS(osProg.id, osId, "manual");
      } else {
        await supabase.from("ordens_servico").update({ status: "finalizada" as any }).eq("id", osId);
      }



      // notificação ao produtor
      if (osSel) {
        await (supabase as any).rpc("rpc_notificar_gestor", {
          p_cliente_id: (osSel as any).cliente_id,
          p_tipo: rectifyId ? "alerta" : "aplicacao",
          p_titulo: rectifyId ? "Aplicação retificada" : "Aplicação realizada",
          p_mensagem: rectifyId
            ? `O registro de aplicação de ${(osSel as any).produtos?.nome || "produto"} foi corrigido.`
            : `Aplicação de ${(osSel as any).produtos?.nome || "produto"} registrada em ${(osSel as any).fazendas?.nome || ""} / ${(osSel as any).talhoes?.nome || ""}`,
          p_link: null,
          p_source_type: "aplicacao",
          p_source_id: ins.id,
          p_idempotency_key: `aplic-dialog-${ins.id}-${rectifyId ? "rect" : "new"}`,
        });
      }


      toast.success(rectifyId ? "Aplicação retificada com sucesso" : "Aplicação registrada com sucesso");
      qc.invalidateQueries({ queryKey: ["aplicacoes"] });
      qc.invalidateQueries({ queryKey: ["os-para-aplicar"] });
      qc.invalidateQueries({ queryKey: ["aplicacao", rectifyId] });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rectifyId ? `Retificar Aplicação (v${(aplicacaoOriginal?.versao || 1) + 1})` : "Registrar Aplicação em Campo"}</DialogTitle>
        </DialogHeader>

        {loadingOriginal && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        <div className={`space-y-5 pt-2 ${loadingOriginal ? "opacity-30 pointer-events-none" : ""}`}>
          {rectifyId && (
            <section className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Justificativa da Retificação
              </h3>
              <div className="space-y-1.5">
                <Label className="text-amber-900 dark:text-amber-200">Motivo da correção *</Label>
                <Textarea 
                  placeholder="Explique o que está sendo corrigido e por quê..." 
                  value={motivoRetificacao} 
                  onChange={(e) => setMotivoRetificacao(e.target.value)}
                  className="bg-white dark:bg-slate-900 border-amber-200 focus-visible:ring-amber-500"
                />
              </div>
            </section>
          )}
          {/* 1. OS */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Sprout className="h-4 w-4 text-primary" />Ordem de Serviço</h3>
            <div className="space-y-1.5">
              <Label>OS *</Label>
              <Select value={osId} onValueChange={trocarOS} disabled={saving || !!rectifyId}>
                <SelectTrigger><SelectValue placeholder="Selecione a OS" /></SelectTrigger>
                <SelectContent>
                  {ordens.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.clientes?.nome} · {o.fazendas?.nome} / {o.talhoes?.nome} · {o.produtos?.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {osSel && (
              <Card className="bg-muted/40">
                <CardContent className="p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><span className="text-muted-foreground">Produto:</span><br /><strong>{(osSel as any).produtos?.nome}</strong></div>
                  <div><span className="text-muted-foreground">Dose recomendada:</span><br /><strong>Unidade não informada pela OS</strong></div>
                  <div><span className="text-muted-foreground">Área OS:</span><br /><strong>{(osSel as any).area_hectares || "—"} ha</strong></div>
                  <div><span className="text-muted-foreground">Volume previsto:</span><br /><strong>{(osSel as any).volume_total_ml ? (osSel as any).volume_total_ml.toLocaleString("pt-BR") : "—"} mL</strong></div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Data *</Label><Input type="date" value={dataAplicacao} onChange={(e) => setDataAplicacao(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Hora início</Label><Input type="datetime-local" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Hora fim</Label><Input type="datetime-local" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* 2. Execução */}
          <section className="space-y-3 pt-2 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" />Execução técnica</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Modo de aplicação</Label>
                <Select value={modoAplicacao} onValueChange={setModoAplicacao}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{MODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Lote usado</Label>
                <Select value={loteId} onValueChange={setLoteId} disabled={!osSel || saving}>
                  <SelectTrigger><SelectValue placeholder="Selecione o lote" /></SelectTrigger>
                  <SelectContent>{lotes.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.codigo_lote}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Dose real{unidade ? ` (${unidade.dose})` : " (unidade não informada)"} *</Label><Input type="number" value={doseAplicada} onChange={(e) => setDoseAplicada(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Área aplicada (ha) *</Label><Input type="number" value={areaAplicada} onChange={(e) => setAreaAplicada(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Calda (L/ha)</Label><Input type="number" value={volumeCalda} onChange={(e) => setVolumeCalda(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Total aplicado</Label><Input value={total ? `${total.valor.toLocaleString("pt-BR")} ${total.unidade}` : "—"} readOnly className="bg-muted" /></div>
            </div>
            {desvioAlto && (
              <div className="flex gap-2 items-start text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                Dose aplicada difere da recomendada em {desvioPct.toFixed(0)}%. Confirme se está correto.
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Equipamento</Label><Input value={equipamento} onChange={(e) => setEquipamento(e.target.value)} placeholder="Pulverizador" /></div>
              <div className="space-y-1.5"><Label>Modelo</Label><Input value={equipamentoModelo} onChange={(e) => setEquipamentoModelo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tipo de bico</Label><Input value={bicoTipo} onChange={(e) => setBicoTipo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Pressão (bar)</Label><Input type="number" value={pressaoBar} onChange={(e) => setPressaoBar(e.target.value)} /></div>
            </div>
          </section>

          {/* 3. Condições */}
          <section className="space-y-3 pt-2 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" />Condições de campo</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Temp. (°C)</Label><Input type="number" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Umidade (%)</Label><Input type="number" value={umidade} onChange={(e) => setUmidade(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Vento (km/h)</Label><Input type="number" value={vento} onChange={(e) => setVento(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Observações climáticas</Label><Input value={condicoes} onChange={(e) => setCondicoes(e.target.value)} placeholder="Ex: céu nublado, orvalho leve" /></div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={capturarGPS}>
                <MapPin className="h-4 w-4 mr-2" />Capturar GPS
              </Button>
              {latitude !== null && <Badge variant="secondary" className="font-mono text-xs">{latitude.toFixed(5)}, {longitude?.toFixed(5)}</Badge>}
            </div>
            <div className="space-y-1.5">
              <Label>Resultado inicial</Label>
              <div className="flex flex-wrap gap-2">
                {RESULTADOS.map((r) => (
                  <button key={r.value} type="button" onClick={() => setResultado(r.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${resultado === r.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} /></div>
          </section>

          {/* 4. Evidências */}
          <section className="space-y-4 pt-2 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Evidências {rectifyId ? "e Histórico" : ""}
            </h3>
            
            {rectifyId && evidenciasOriginais.length > 0 && (
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-dashed">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Evidências da versão anterior
                  </Label>
                  <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Serão mantidas no histórico
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {evidenciasOriginais.map((ev) => {
                    const mantendo = evidenciasParaManter.includes(ev.id);
                    return (
                      <div key={ev.id} className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${mantendo ? 'border-primary/50 shadow-sm' : 'border-transparent opacity-30 grayscale'}`}>
                        {ev.tipo === 'foto' ? (
                          <img src={ev.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <button 
                          type="button"
                          onClick={() => {
                            setEvidenciasParaManter(prev => 
                              mantendo ? prev.filter(id => id !== ev.id) : [...prev, ev.id]
                            )
                          }}
                          title={mantendo ? "Remover da nova versão" : "Reutilizar nesta versão"}
                          className={`absolute -top-0.5 -right-0.5 rounded-full p-0.5 shadow-md z-10 ${mantendo ? 'bg-destructive text-white' : 'bg-slate-400 text-white'}`}
                        >
                          {mantendo ? <X className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                        </button>
                        {mantendo && (
                          <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-[8px] text-white text-center py-0.5">
                            Reutilizada
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {evidenciasParaManter.length === 0 && (
                  <p className="text-[10px] text-amber-600 italic">Nenhuma evidência anterior será mantida nesta retificação.</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              {rectifyId && <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Adicionar novas evidências</Label>}
              <EvidenciasUploader clienteId={(osSel as any)?.cliente_id || ""} pending={evidencias} onChange={setEvidencias} />
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground italic border-t pt-3">
            Este registro de aplicação faz parte da rastreabilidade da prescrição agronômica. Confirme se segue a recomendação técnica vigente.
          </p>

          {osId && !unidade && <p role="alert" className="text-sm text-destructive">{erroUnidade}</p>}
          <Button className="w-full h-11" onClick={submit} disabled={saving || !osId || !unidade}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Registrar e finalizar OS"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
