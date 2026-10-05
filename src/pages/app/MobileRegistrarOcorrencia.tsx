import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath } from "@/lib/tenantStoragePath";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { savePendingRegistro, savePendingFoto } from "@/lib/offlineDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Camera,
  MapPin,
  X,
  Loader2,
  CheckCircle2,
  Navigation,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage, type ImageQuality } from "@/lib/mediaCompression";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

const TIPOS_OCORRENCIA = [
  { value: "insetos_praga", label: "Praga" },
  { value: "doencas_fungicas", label: "Doença" },
  { value: "plantas_daninhas", label: "Planta Daninha" },
  { value: "nematoides", label: "Nematoide" },
  { value: "desequilibrio_biologico_solo", label: "Solo" },
  { value: "baixa_vitalidade", label: "Nutricional" },
] as const;

const NIVEIS_PRESSAO = [
  { value: "baixo", label: "Baixo", color: "bg-emerald-100 text-emerald-700" },
  { value: "medio", label: "Médio", color: "bg-amber-100 text-amber-700" },
  { value: "alto", label: "Alto", color: "bg-orange-100 text-orange-700" },
  { value: "severo", label: "Severo", color: "bg-red-100 text-red-700" },
] as const;

const URGENCIAS = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
] as const;

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export default function MobileRegistrarOcorrencia() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clienteId, setClienteId] = useState("");
  const [fazendaId, setFazendaId] = useState("");
  const [talhaoId, setTalhaoId] = useState("");
  const [categoriaProblema, setCategoriaProblema] = useState("");
  const [nivelPressao, setNivelPressao] = useState("medio");
  const [percentualAfetado, setPercentualAfetado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [urgencia, setUrgencia] = useState("media");
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotosPreviews, setFotosPreviews] = useState<string[]>([]);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [loadingGPS, setLoadingGPS] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [qualityHD, setQualityHD] = useState(() => localStorage.getItem("media-quality-pref") === "hd");

  // Alterações não salvas: dispara guard de troca de portal e beforeunload.
  const isDirty =
    !submitting &&
    (clienteId !== "" ||
      fazendaId !== "" ||
      talhaoId !== "" ||
      categoriaProblema !== "" ||
      percentualAfetado !== "" ||
      observacoes.trim() !== "" ||
      fotos.length > 0);
  useUnsavedChanges(isDirty);

  // Fetch clientes
  const { data: clientes } = useQuery({
    queryKey: ["mobile-clientes"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome");
      return data || [];
    },
  });

  // Fetch fazendas filtered by cliente
  const { data: fazendas } = useQuery({
    queryKey: ["mobile-fazendas", clienteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fazendas")
        .select("id, nome")
        .eq("cliente_id", clienteId)
        .order("nome");
      return data || [];
    },
    enabled: !!clienteId,
  });

  // Fetch talhões filtered by fazenda
  const { data: talhoes } = useQuery({
    queryKey: ["mobile-talhoes", fazendaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("talhoes")
        .select("id, nome, area_hectares")
        .eq("fazenda_id", fazendaId)
        .order("nome");
      return data || [];
    },
    enabled: !!fazendaId,
  });

  // Auto-get GPS on mount
  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast.error("GPS não disponível neste dispositivo");
      return;
    }
    setLoadingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLoadingGPS(false);
      },
      (err) => {
        console.error("GPS error:", err);
        setLoadingGPS(false);
        toast.error("Não foi possível obter localização");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fotos.length + files.length > 10) {
      toast.error("Máximo de 10 fotos");
      return;
    }

    const toastId = toast.loading("Otimizando fotos para campo...");
    
    try {
      const compressedFiles = await Promise.all(
        files.map(file => compressImage(file, qualityHD ? 'hd' : 'standard'))
      );
      
      const newFotos = [...fotos, ...compressedFiles];
      setFotos(newFotos);

      const newPreviews = compressedFiles.map(file => URL.createObjectURL(file));
      setFotosPreviews(prev => [...prev, ...newPreviews]);
      
      toast.success("Fotos otimizadas", { id: toastId });
    } catch (err) {
      toast.error("Erro ao processar fotos", { id: toastId });
      // Fallback for original files
      const newFotos = [...fotos, ...files];
      setFotos(newFotos);
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setFotosPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeFoto = (index: number) => {
    setFotos((prev) => prev.filter((_, i) => i !== index));
    setFotosPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!clienteId || !fazendaId || !talhaoId || !categoriaProblema) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    setSubmitting(true);
    const talhaoData = talhoes?.find((t) => t.id === talhaoId);
    const clientUuid = crypto.randomUUID();

    const safeParseNumber = (val: string) => {
      if (!val) return null;
      const parsed = Number(val.replace(",", "."));
      return isNaN(parsed) ? null : parsed;
    };

    // Contrato CANÔNICO p_* — idêntico online e offline (motor único).
    const rpcArgs = {
      p_client_uuid: clientUuid,
      p_cliente_id: clienteId,
      p_fazenda_id: fazendaId,
      p_talhao_id: talhaoId,
      p_cultura_id: null as string | null,
      p_data_vistoria: new Date().toISOString().split("T")[0],
      p_tipo_visita: "vistoria_inicial",
      p_objetivo_visita: null as string | null,
      p_safra: null as string | null,
      p_fase_fenologica: null as string | null,
      p_solicitacao_id: null as string | null,
      p_origem: "ocorrencia_campo",
      p_categoria_problema: categoriaProblema,
      p_nivel_pressao: nivelPressao,
      p_percentual_area_afetada: safeParseNumber(percentualAfetado),
      p_urgencia: urgencia,
      p_localizacao_na_area: null as string | null,
      p_observacoes_tecnicas: observacoes || null,
      p_problema_principal: null as string | null,
      p_area_hectares: talhaoData?.area_hectares ?? null,
      p_latitude: location?.latitude ?? null,
      p_longitude: location?.longitude ?? null,
      p_registro_origem_id: null as string | null,
    };

    // OFFLINE MODE: fila com o MESMO contrato canônico (sem INSERT legado).
    if (!isOnline) {
      try {
        const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        await savePendingRegistro({
          id: localId,
          clientUuid,
          operationType: "create_technical_visit",
          payload: rpcArgs,
          createdAt: new Date().toISOString(),
          synced: false,
        });

        for (let i = 0; i < fotos.length; i++) {
          await savePendingFoto({
            id: `${localId}_foto_${i}`,
            registroLocalId: localId,
            file: fotos[i],
            fileName: fotos[i].name,
            mimeType: fotos[i].type,
            isPrincipal: i === 0,
          });
        }

        toast.success("Salvo offline! Será sincronizado quando houver conexão.", { icon: "📶" });
        navigate("/app");
      } catch {
        toast.error("Erro ao salvar offline");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ONLINE: motor canônico transacional e idempotente (`client_uuid`).
    try {
      const { data: rpcData, error } = await supabase.rpc(
        "rpc_criar_visita_idempotente" as never,
        rpcArgs as never,
      );

      if (error) throw error;

      const res = (rpcData ?? {}) as any;
      if (!res.ok) {
        throw new Error(
          res.error === "technical_access_required"
            ? "Você não possui acesso técnico a este cliente."
            : "Não foi possível registrar a ocorrência.",
        );
      }

      const registroId = res.registro_id as string;

      // Mídia: falhas NÃO invalidam a visita — ficam pendentes e recuperáveis.
      let midiaFalhas = 0;
      // Mídias que falharam E não puderam ser enfileiradas para retry.
      let midiaNaoEnfileiradas = 0;

      if (registroId && fotos.length > 0) {
        for (let i = 0; i < fotos.length; i++) {
          const file = fotos[i];
          const ext = file.name.split(".").pop() || "jpg";
          // Path determinístico usando client_uuid para evitar arquivos órfãos em retries
          const path = await buildTenantStoragePath(`${registroId}/foto/${clientUuid}_${i}.${ext}`);

          const { error: uploadError } = await supabase.storage
            .from("consultor-arquivos")
            .upload(path, file, { contentType: file.type, upsert: true });

          const midiaClientUuid =
            clientUuid.slice(0, 24) + i.toString(16).padStart(12, "0");

          if (uploadError) {
            midiaFalhas++;
            // Enfileira para retry pela rotina de sincronização de mídia.
            // `remoteRegistroId` marca que a visita JÁ existe: o retry só
            // reenvia a mídia (nunca recria a visita, nunca INSERT legado).
            try {
              await savePendingFoto({
                id: `${clientUuid}_foto_${i}`,
                registroLocalId: registroId,
                remoteRegistroId: registroId,
                clientUuid: midiaClientUuid,
                categoria: "geral",
                file,
                fileName: file.name,
                mimeType: file.type,
                isPrincipal: i === 0,
              });
            } catch {
              // Fila local indisponível: a mídia NÃO foi enfileirada.
              midiaNaoEnfileiradas++;
            }
            continue;
          }


          // Referência idempotente: upsert por client_uuid determinístico.
          const { error: refError } = await supabase
            .from("registros_consultor_arquivos")
            .upsert(
              {
                registro_consultor_id: registroId,
                arquivo_url: null,
                arquivo_path: path,
                nome_arquivo: file.name,
                tipo_arquivo: file.type,
                tipo_midia: "foto",
                categoria_arquivo: "geral",
                foto_principal: i === 0,
                uploaded_by: user.id,
                // UUID determinístico por mídia: mesmo client_uuid, nó = índice.
                // Mantém o tipo `uuid` da coluna e garante idempotência no retry.
                client_uuid: midiaClientUuid,

                capturado_em: new Date().toISOString(),
                latitude: location?.latitude || null,
                longitude: location?.longitude || null,
              } as any,
              { onConflict: "client_uuid" },
            );
          if (refError) {
            midiaFalhas++;
            // Storage OK, referência falhou: enfileira para reconciliação.
            try {
              await savePendingFoto({
                id: `${clientUuid}_foto_${i}`,
                registroLocalId: registroId,
                remoteRegistroId: registroId,
                clientUuid: midiaClientUuid,
                categoria: "geral",
                remotePath: path,
                file,
                fileName: file.name,
                mimeType: file.type,
                isPrincipal: i === 0,
              });
            } catch {
              midiaNaoEnfileiradas++;
            }
          }

        }
      }

      if (midiaNaoEnfileiradas > 0) {
        toast.error(
          `${midiaNaoEnfileiradas} foto(s) NÃO puderam ser enfileiradas para reenvio. Refaça a captura para não perder o registro visual.`,
        );
      }

      if (midiaFalhas > 0) {
        toast.warning(
          `Ocorrência registrada. ${midiaFalhas} de ${fotos.length} foto(s) ficaram pendentes e serão reenviadas.`,
        );
      } else {
        toast.success(res.idempotent ? "Ocorrência já registrada" : "Ocorrência registrada com sucesso!");
      }

      const faltando: string[] = Array.isArray(res.missing_fields) ? res.missing_fields : [];
      if (faltando.includes("cultura_id")) {
        toast.info("Informe a cultura na etapa Identificação antes de finalizar.");
      }

      // Continuidade do atendimento: segue para o wizard da visita.
      navigate(res.next_route ?? `/app/visita/${registroId}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar ocorrência");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="p-4 space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Registrar Ocorrência</h1>
      </div>

      {/* GPS Status */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground">
              {loadingGPS
                ? "Obtendo localização..."
                : location
                ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : "GPS indisponível"}
            </span>
          </div>
          <button
            onClick={getLocation}
            disabled={loadingGPS}
            className="text-primary text-sm font-medium"
          >
            {loadingGPS ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
          </button>
        </div>
        {location && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Precisão: ±{Math.round(location.accuracy)}m
          </p>
        )}
      </Card>

      {/* Cascading selects */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Cliente *</Label>
          <Select value={clienteId} onValueChange={(v) => { setClienteId(v); setFazendaId(""); setTalhaoId(""); }}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
            <SelectContent>
              {clientes?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Fazenda *</Label>
          <Select value={fazendaId} onValueChange={(v) => { setFazendaId(v); setTalhaoId(""); }} disabled={!clienteId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
            <SelectContent>
              {fazendas?.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Talhão *</Label>
          <Select value={talhaoId} onValueChange={setTalhaoId} disabled={!fazendaId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o talhão" /></SelectTrigger>
            <SelectContent>
              {talhoes?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome} {t.area_hectares ? `(${t.area_hectares} ha)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tipo de ocorrência */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Tipo de Ocorrência *</Label>
          <Select value={categoriaProblema} onValueChange={setCategoriaProblema}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              {TIPOS_OCORRENCIA.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Nível de pressão - visual chips */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Nível de Pressão</Label>
          <div className="flex gap-2 flex-wrap">
            {NIVEIS_PRESSAO.map((n) => (
              <button
                key={n.value}
                type="button"
                onClick={() => setNivelPressao(n.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  nivelPressao === n.value
                    ? `${n.color} ring-2 ring-offset-1 ring-current`
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>

        {/* Urgência */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Urgência</Label>
          <div className="flex gap-2 flex-wrap">
            {URGENCIAS.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setUrgencia(u.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  urgencia === u.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Área afetada */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Área Afetada (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={percentualAfetado}
            onChange={(e) => setPercentualAfetado(e.target.value)}
            placeholder="Ex: 30"
            className="h-11"
          />
        </div>

        {/* Observações */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Observações Técnicas</Label>
          <Textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Descreva a situação observada..."
            rows={3}
            className="text-base"
          />
        </div>
      </div>

      {/* Fotos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Fotos ({fotos.length}/10)</Label>
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
          {fotosPreviews.map((preview, i) => (
            <div key={i} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden">
              <img src={preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeFoto(i)}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}

          {fotos.length < 10 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground active:bg-muted"
            >
              <Camera className="h-5 w-5" />
              <span className="text-[10px]">Foto</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFotoCapture}
          className="hidden"
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={submitting || !clienteId || !fazendaId || !talhaoId || !categoriaProblema}
        className="w-full h-12 text-base font-semibold"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Salvando...
          </>
        ) : !isOnline ? (
          <>
            <WifiOff className="h-5 w-5 mr-2" />
            Salvar Offline
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Registrar Ocorrência
          </>
        )}
      </Button>
    </div>
  );
}
