import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath } from "@/lib/tenantStoragePath";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { unmask } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Send, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { AudioRecorder } from "@/components/visita/AudioRecorder";
import { compressImage, type ImageQuality } from "@/lib/mediaCompression";
import { Switch } from "@/components/ui/switch";
import { insertSolicitacaoIdempotente } from "@/lib/portal/solicitacaoSubmit";

const TIPOS_DEMANDA = [
  "Vistoria técnica",
  "Aplicação de bioinsumo",
  "Análise de solo",
  "Recomendação de manejo",
  "Problema fitossanitário",
  "Outro",
];

const URGENCIAS = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
];

export default function MobileSolicitar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clienteId } = usePortalCliente();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fazendaId, setFazendaId] = useState("");
  const [talhaoId, setTalhaoId] = useState("");
  const [tipoDemanda, setTipoDemanda] = useState("");
  const [urgencia, setUrgencia] = useState("media");
  const [descricao, setDescricao] = useState("");
  const [solicitanteNome, setSolicitanteNome] = useState("");
  const [solicitanteContato, setSolicitanteContato] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotosPreviews, setFotosPreviews] = useState<string[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const clientUuidRef = useRef<string | null>(null);
  const [qualityHD, setQualityHD] = useState(() => localStorage.getItem("media-quality-pref") === "hd");

  const { data: fazendas } = useQuery({
    queryKey: ["mobile-sol-fazendas", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data } = await supabase.from("fazendas").select("id, nome").eq("cliente_id", clienteId).order("nome");
      return data || [];
    },
    enabled: !!clienteId,
  });

  const { data: talhoes } = useQuery({
    queryKey: ["mobile-sol-talhoes", fazendaId],
    queryFn: async () => {
      const { data } = await supabase.from("talhoes").select("id, nome").eq("fazenda_id", fazendaId).order("nome");
      return data || [];
    },
    enabled: !!fazendaId,
  });

  const handleFotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fotos.length + files.length > 5) { toast.error("Máximo 5 fotos"); return; }
    
    const toastId = toast.loading("Otimizando fotos...");
    try {
      const compressedFiles = await Promise.all(
        files.map(file => compressImage(file, qualityHD ? 'hd' : 'standard'))
      );
      
      setFotos((prev) => [...prev, ...compressedFiles]);
      const newPreviews = compressedFiles.map(file => URL.createObjectURL(file));
      setFotosPreviews(prev => [...prev, ...newPreviews]);
      toast.success("Fotos prontas", { id: toastId });
    } catch (err) {
      toast.dismiss(toastId);
      setFotos((prev) => [...prev, ...files]);
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setFotosPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFoto = (i: number) => {
    setFotos((prev) => prev.filter((_, idx) => idx !== i));
    setFotosPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const uploadBlob = async (blob: Blob, ext: string, clientUuid?: string): Promise<string | null> => {
    // Path determinístico usando client_uuid para evitar arquivos órfãos em retries
    if (!user?.id) return null;
    const path = await buildTenantStoragePath(`solicitacoes/${user.id}/${clientUuid || Date.now()}.${ext}`);
    const { error } = await supabase.storage.from("consultor-arquivos").upload(path, blob, { 
      contentType: blob.type,
      upsert: true
    });
    if (error) return null;
    return path;
  };

  const handleSubmit = async () => {
    if (!clienteId || !tipoDemanda || !user?.id) { toast.error("Preencha os campos obrigatórios"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    // UUID estável entre retries da mesma tentativa; renovado só após sucesso.
    if (!clientUuidRef.current) clientUuidRef.current = crypto.randomUUID();
    const clientUuid = clientUuidRef.current;
    try {
      // Upload fotos
      const fotoPaths: string[] = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        const ext = f.name.split(".").pop() || "jpg";
        const path = await uploadBlob(f, ext, `${clientUuid}_foto_${i}`);
        if (path) fotoPaths.push(path);
      }

      // Upload audio
      let audioPath: string | null = null;
      if (audioBlob) {
        audioPath = await uploadBlob(audioBlob, "webm", `${clientUuid}_audio`);
      }

      const result = await insertSolicitacaoIdempotente(
        async (row) => await supabase.from("portal_solicitacoes").insert(row as never),
        {
          cliente_id: clienteId,
          user_id: user.id,
          client_uuid: clientUuid,
          fazenda_id: fazendaId || null,
          talhao_id: talhaoId || null,
          tipo_demanda: tipoDemanda,
          urgencia,
          descricao: descricao || null,
          solicitante_nome: solicitanteNome || null,
          solicitante_contato: unmask(solicitanteContato) || null,
          fotos_iniciais: null, // Legado
          fotos_paths: fotoPaths.length ? fotoPaths : null,
          audio_inicial_url: null, // Legado
          audio_inicial_path: audioPath,
        },
      );
      clientUuidRef.current = null;
      toast.success(result === "created" ? "Solicitação enviada com sucesso!" : "Esta solicitação já havia sido enviada.");
      navigate("/app");
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Erro ao enviar");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Solicitar Atendimento</h1>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tipo de Demanda *</Label>
          <Select value={tipoDemanda} onValueChange={setTipoDemanda}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {TIPOS_DEMANDA.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Nome do Solicitante</Label>
            <Input value={solicitanteNome} onChange={(e) => setSolicitanteNome(e.target.value)} placeholder="Quem está solicitando" className="h-11" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Contato do Solicitante</Label>
            <MaskedInput mask="telefone" value={solicitanteContato} onChange={(e) => setSolicitanteContato(e.target.value)} placeholder="(00) 00000-0000" className="h-11" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Fazenda</Label>
          <Select value={fazendaId} onValueChange={(v) => { setFazendaId(v); setTalhaoId(""); }}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
            <SelectContent>
              {fazendas?.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fazendaId && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Talhão</Label>
            <Select value={talhaoId} onValueChange={setTalhaoId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {talhoes?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Urgência</Label>
          <div className="flex gap-2 flex-wrap">
            {URGENCIAS.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setUrgencia(u.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  urgencia === u.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Descrição</Label>
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva o problema ou necessidade..." rows={4} className="text-base" />
        </div>

        {/* Fotos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Fotos ({fotos.length}/5)</Label>
            <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-full border">
              <span className="text-[10px] font-bold uppercase tracking-tighter">HD</span>
              <Switch 
                checked={qualityHD} 
                onCheckedChange={(val) => {
                  setQualityHD(val);
                  localStorage.setItem("media-quality-pref", val ? "hd" : "standard");
                }} 
                className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {fotosPreviews.map((p, i) => (
              <div key={i} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden">
                <img src={p} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeFoto(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
            {fotos.length < 5 && (
              <button onClick={() => fileInputRef.current?.click()} className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground">
                <Camera className="h-5 w-5" /><span className="text-[10px]">Foto</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handleFotoCapture} className="hidden" />
        </div>

        {/* Áudio inicial */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Áudio (opcional)</Label>
          <AudioRecorder
            onRecorded={(blob) => setAudioBlob(blob)}
            onCleared={() => setAudioBlob(null)}
          />
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={submitting || !tipoDemanda} className="w-full h-12 text-base font-semibold">
        {submitting ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Enviando...</> : <><Send className="h-5 w-5 mr-2" />Enviar Solicitação</>}
      </Button>
    </div>
  );
}
