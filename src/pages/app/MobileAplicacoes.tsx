import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Droplets, MapPin, Camera, X, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { PendingEvidencia } from "@/components/aplicacao/EvidenciasUploader";
import { ACCEPT_EVIDENCIAS, normalizarArquivoCamera, tipoEvidencia, validarArquivoEvidencia, validarMotivoRetificacao } from "@/lib/aplicacoes/evidencias";
import { validarAplicacao } from "@/lib/aplicacoes/validacao";
import { applicationAttempt, salvarAplicacao, type ApplicationAttempt } from "@/lib/aplicacoes/salvar";
import { UNIDADE_EXECUCAO_CANONICA } from "@/lib/aplicacoes/unidades";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";


const MODOS = ["Pulverização foliar", "Aplicação no colo da planta", "Via solo", "Tratamento de semente", "Sulco de plantio", "Jato dirigido"];
const RESULTADOS = [
  { value: "satisfatorio", label: "Satisfatório", color: "bg-emerald-100 text-emerald-700" },
  { value: "parcial", label: "Parcial", color: "bg-amber-100 text-amber-700" },
  { value: "insuficiente", label: "Insuficiente", color: "bg-red-100 text-red-700" },
  { value: "em_avaliacao", label: "Em avaliação", color: "bg-blue-100 text-blue-700" },
];

export default function MobileAplicacoes() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const { clienteId } = usePortalCliente();
  const [searchParams] = useSearchParams();
  const rectifyId = searchParams.get("rectifyId");
  const isProdutor = role === "cliente_produtor";

  const [osId, setOsId] = useState("");
  const [doseUnidade, setDoseUnidade] = useState("");
  const access = useStorageAccessScope(`mobile-application:${rectifyId || "new"}:${clienteId}:${osId}`);
  const attemptRef = useRef<ApplicationAttempt>();
  const lock = useRef(false);
  useEffect(() => { attemptRef.current = undefined; }, [access.scope]);
  const [horaInicio, setHoraInicio] = useState(new Date().toISOString());
  const [horaFim, setHoraFim] = useState("");
  const [doseAplicada, setDoseAplicada] = useState("");
  const [areaAplicada, setAreaAplicada] = useState("");
  const [volumeCalda, setVolumeCalda] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [modoAplicacao, setModoAplicacao] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [umidade, setUmidade] = useState("");
  const [vento, setVento] = useState("");
  const [condicoes, setCondicoes] = useState("");
  const [resultado, setResultado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [motivoRetificacao, setMotivoRetificacao] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [evidencias, setEvidencias] = useState<PendingEvidencia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Busca dados da aplicação para retificação
  const { data: aplicacaoOriginal, isLoading: loadingOriginal } = useQuery({
    queryKey: ["mobile-aplicacao", rectifyId, access.scope],
    enabled: !!rectifyId && access.ready,
    queryFn: async () => {
      const current = access.capture();
      const { data, error } = await supabase.from("aplicacoes").select("*").eq("id", rectifyId).single();
      if (!current()) throw new Error("Acesso alterado");
      if (error) throw error;
      return data;
    },
  });

  const { data: ordens } = useQuery({
    queryKey: ["mobile-os-aplicacao", isProdutor ? clienteId : "all", access.scope],
    enabled: access.ready && (!isProdutor || !!clienteId),
    queryFn: async () => {
      const current = access.capture();
      let q = supabase
        .from("ordens_servico")
        .select("id, cliente_id, area_hectares, status, produtos(id, nome, dose_ml_ha), clientes(nome), fazendas(nome), talhoes(nome)")
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (!rectifyId) {
        q = q.not("status", "eq", "finalizada");
      }
      
      if (isProdutor && clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      if (!current()) throw new Error("Acesso alterado");
      if (error) throw error;
      return data || [];
    },
  });

  const osSel: any = ordens?.find((o: any) => o.id === osId);

  useEffect(() => {
    if (aplicacaoOriginal) {
      setOsId(aplicacaoOriginal.ordem_servico_id);
      setDoseAplicada(String(aplicacaoOriginal.dose_aplicada || ""));
      setAreaAplicada(String(aplicacaoOriginal.area_aplicada_ha || ""));
      setVolumeCalda(String(aplicacaoOriginal.volume_calda_l_ha || ""));
      setEquipamento(aplicacaoOriginal.equipamento || "");
      setModoAplicacao(aplicacaoOriginal.modo_aplicacao || "");
      setTemperatura(String(aplicacaoOriginal.temperatura_c || ""));
      setUmidade(String(aplicacaoOriginal.umidade_pct || ""));
      setVento(String(aplicacaoOriginal.vento_kmh || ""));
      setCondicoes(aplicacaoOriginal.condicoes_climaticas || "");
      setResultado(aplicacaoOriginal.resultado_inicial || "");
      setObservacoes(aplicacaoOriginal.observacoes || "");
      setLatitude(aplicacaoOriginal.latitude);
      setLongitude(aplicacaoOriginal.longitude);
      if (aplicacaoOriginal.hora_inicio) setHoraInicio(aplicacaoOriginal.hora_inicio);
    }
  }, [aplicacaoOriginal]);

  useEffect(() => {
    if (osSel && !rectifyId) {
      if (!areaAplicada && osSel.area_hectares) setAreaAplicada(String(osSel.area_hectares));
    }
  }, [osId, osSel, rectifyId]);

  // GPS automático ao abrir
  useEffect(() => {
    if (!navigator.geolocation || rectifyId) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLatitude(pos.coords.latitude); setLongitude(pos.coords.longitude); },
      () => {}
    );
  }, [rectifyId]);

  const desvio = 0; // No recommendation snapshot: today's catalog is not an execution authority.

  const addFiles = (files: FileList | null, daCamera = false) => {
    if (!files?.length) return;
    const novos: PendingEvidencia[] = [];
    for (const bruto of Array.from(files)) {
      if (evidencias.length + novos.length >= 20) break;
      const f = daCamera ? normalizarArquivoCamera(bruto) : bruto;
      if (!f) { toast.error(`${bruto.name || "foto"}: formato não aceito`); continue; }
      const erro = validarArquivoEvidencia(f);
      if (erro) { toast.error(erro); continue; }
      novos.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        legenda: "",
        tipo: tipoEvidencia(f.type),
      });
    }
    setEvidencias([...evidencias, ...novos]);
  };


  const removeEv = (id: string) => {
    const it = evidencias.find((e) => e.id === id);
    if (it) URL.revokeObjectURL(it.previewUrl);
    setEvidencias(evidencias.filter((e) => e.id !== id));
  };

  const handleSubmit = async () => {
    if (lock.current || !access.ready || !osSel) return;
    const current = access.capture();
    if (doseUnidade !== UNIDADE_EXECUCAO_CANONICA) return toast.error("Selecione a unidade da dose real");
    const horaFimAgora = new Date().toISOString();
    const erro = validarAplicacao({
      osId,
      doseAplicada,
      areaAplicada,
      volumeCalda,
      umidade,
      vento,
      temperatura,
      horaInicio,
      horaFim: horaFimAgora,
      rectifyId,
      motivoRetificacao,
    });
    if (erro) return toast.error(erro);
    if (rectifyId) {
      const erroMotivo = validarMotivoRetificacao(motivoRetificacao);
      if (erroMotivo) return toast.error(erroMotivo);
    }

    setSubmitting(true);
    lock.current = true;
    try {
      const aplicacaoData = {
        ordem_servico_id: osId,
        data_aplicacao: new Date().toISOString().split("T")[0],
        hora_inicio: horaInicio,
        hora_fim: horaFimAgora,
        responsavel_id: user?.id || null,
        modo_aplicacao: modoAplicacao || null,
        produto_usado_id: osSel?.produtos?.id || null,
        dose_aplicada: Number(doseAplicada),
        dose_unidade: doseUnidade,
        area_aplicada_ha: Number(areaAplicada),
        volume_calda_l_ha: volumeCalda ? Number(volumeCalda) : null,
        volume_total_aplicado_ml: Number(doseAplicada) * Number(areaAplicada) || null,
        equipamento: equipamento || null,
        temperatura_c: temperatura ? Number(temperatura) : null,
        umidade_pct: umidade ? Number(umidade) : null,
        vento_kmh: vento ? Number(vento) : null,
        condicoes_climaticas: condicoes || null,
        latitude, longitude,
        resultado_inicial: (resultado as any) || null,
        observacoes: observacoes || null,
        created_by: user?.id || null,
        motivo_retificacao: motivoRetificacao.trim() || null,
      };

      // Preserve server's frozen time fields on retry; a new completion time is not a new application.
      const payload = attemptRef.current ? { ...aplicacaoData, hora_fim: attemptRef.current.payload.hora_fim,
        data_aplicacao: attemptRef.current.payload.data_aplicacao } : aplicacaoData;
      attemptRef.current = applicationAttempt(payload, rectifyId || null, evidencias, [], osSel.cliente_id, attemptRef.current);
      await salvarAplicacao(attemptRef.current, payload, rectifyId || null, evidencias, [], current);
      if (!current()) return;

      toast.success(rectifyId ? "Aplicação retificada!" : "Aplicação registrada!");
      qc.invalidateQueries({ queryKey: ["aplicacoes"] });
      if (!current()) return;
      navigate("/app");
    } catch (err: any) {
      if (current()) toast.error(err.message || "Erro ao registrar");
    } finally {
      lock.current = false;
      if (current()) setSubmitting(false);
    }
  };


  if (loadingOriginal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">{rectifyId ? "Retificar Aplicação" : "Registrar Aplicação"}</h1>
      </div>

      {rectifyId && (
        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 space-y-2">
          <Label className="text-amber-800 font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Motivo da Retificação *</Label>
          <Textarea 
            placeholder="Descreva o motivo da correção..." 
            value={motivoRetificacao} 
            onChange={(e) => setMotivoRetificacao(e.target.value)}
            className="bg-white border-amber-200"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Ordem de Serviço *</Label>
        <Select value={osId} onValueChange={id => { setOsId(id); setDoseUnidade(""); setDoseAplicada(""); setAreaAplicada(""); setVolumeCalda(""); setEvidencias([]); }} disabled={!!rectifyId || submitting}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Selecione a OS" /></SelectTrigger>
          <SelectContent>
            {ordens?.map((os: any) => (
              <SelectItem key={os.id} value={os.id}>
                {os.produtos?.nome} — {os.clientes?.nome} / {os.talhoes?.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {osSel && (
        <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
          <p><strong>Área OS:</strong> {osSel.area_hectares || "—"} ha</p>
          <p className="text-muted-foreground">{osSel.fazendas?.nome} › {osSel.talhoes?.nome}</p>
        </div>
      )}

      <div className="space-y-2"><Label>Unidade da dose real *</Label><Select value={doseUnidade} onValueChange={setDoseUnidade} disabled={submitting}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value={UNIDADE_EXECUCAO_CANONICA}>mL/ha</SelectItem></SelectContent></Select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm">Dose real (mL/ha) *</Label>
          <Input type="number" value={doseAplicada} onChange={(e) => setDoseAplicada(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Área (ha) *</Label>
          <Input type="number" value={areaAplicada} onChange={(e) => setAreaAplicada(e.target.value)} className="h-11" />
        </div>
      </div>

      {desvio > 20 && (
        <div className="flex gap-2 items-start text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          Dose difere {desvio.toFixed(0)}% da recomendada.
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">Modo de Aplicação</Label>
        <Select value={modoAplicacao} onValueChange={setModoAplicacao}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>{MODOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label className="text-sm">Equipamento</Label><Input value={equipamento} onChange={(e) => setEquipamento(e.target.value)} className="h-11" /></div>
        <div className="space-y-2"><Label className="text-sm">Calda (L/ha)</Label><Input type="number" value={volumeCalda} onChange={(e) => setVolumeCalda(e.target.value)} className="h-11" /></div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Clima</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input type="number" placeholder="°C" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} className="h-11" />
          <Input type="number" placeholder="UR %" value={umidade} onChange={(e) => setUmidade(e.target.value)} className="h-11" />
          <Input type="number" placeholder="Vento km/h" value={vento} onChange={(e) => setVento(e.target.value)} className="h-11" />
        </div>
        <Input value={condicoes} onChange={(e) => setCondicoes(e.target.value)} placeholder="Observações climáticas" className="h-11" />
      </div>

      <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          {latitude !== null ? <span className="font-mono">{latitude.toFixed(4)}, {longitude?.toFixed(4)}</span> : <span className="text-muted-foreground">Sem GPS</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => {
          navigator.geolocation?.getCurrentPosition(
            (pos) => { setLatitude(pos.coords.latitude); setLongitude(pos.coords.longitude); toast.success("GPS atualizado"); },
            () => toast.error("GPS indisponível")
          );
        }}>Atualizar</Button>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Resultado</Label>
        <div className="flex gap-2 flex-wrap">
          {RESULTADOS.map((r) => (
            <button key={r.value} type="button" onClick={() => setResultado(r.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${resultado === r.value ? `${r.color} ring-2 ring-offset-1 ring-current` : "bg-muted text-muted-foreground"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Observações</Label>
        <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className="text-base" />
      </div>

      {/* Evidências */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Evidências ({evidencias.length}/20)</Label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4 mr-2" />Câmera
          </Button>
          <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => fileRef.current?.click()}>
            Galeria
          </Button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          aria-label="Capturar foto de evidência"
          onChange={(e) => { addFiles(e.target.files, true); e.target.value = ""; }} />
        <input ref={fileRef} type="file" multiple accept={ACCEPT_EVIDENCIAS} className="hidden"
          aria-label="Selecionar arquivos de evidência"

          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {evidencias.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {evidencias.map((e) => (
              <div key={e.id} className="relative aspect-square rounded overflow-hidden bg-muted">
                {e.tipo === "foto" ? (
                  <img src={e.previewUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs p-1 text-center">{e.file.name.slice(0, 12)}</div>
                )}
                <button type="button" onClick={() => removeEv(e.id)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={submitting || !osId} className="w-full h-12 text-base font-semibold">
        {submitting ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Salvando...</> : <><Droplets className="h-5 w-5 mr-2" />{rectifyId ? "Salvar Retificação" : "Registrar Aplicação"}</>}
      </Button>
    </div>
  );
}