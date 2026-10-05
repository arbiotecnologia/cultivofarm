import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath } from "@/lib/tenantStoragePath";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  MapPin,
  Loader2,
  CheckCircle2,
  Camera,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage, type ImageQuality } from "@/lib/mediaCompression";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import PresencaCheckoutButton from "@/components/visita/PresencaCheckoutButton";

type GpsState =
  | { status: "idle" }
  | { status: "getting" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "error"; message: string };

export default function MobileCheckin() {
  const { solicitacaoId } = useParams<{ solicitacaoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { registrarCheckin, criarOuObterVisitaPorSolicitacao } = useFluxoVisitaTecnica();

  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const [tipoCheckin, setTipoCheckin] = useState<"chegada_fazenda" | "inicio_visita">(
    "chegada_fazenda"
  );
  const [observacoes, setObservacoes] = useState("");
  const [justificativaSemGps, setJustificativaSemGps] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qualityHD, setQualityHD] = useState(() => localStorage.getItem("media-quality-pref") === "hd");
  const [success, setSuccess] = useState(false);
  const [createdVisitId, setCreatedVisitId] = useState<string | null>(null);

  const isDirty = !success && (!!observacoes.trim() || !!foto || !!justificativaSemGps.trim());
  useUnsavedChanges(isDirty);

  const { data: solicitacao } = useQuery({
    queryKey: ["mobile-checkin-solicitacao", solicitacaoId],
    queryFn: async () => {
      if (!solicitacaoId) return null;
      const { data } = await supabase
        .from("portal_solicitacoes")
        .select(`*, clientes:cliente_id(nome), fazendas:fazenda_id(nome), talhoes:talhao_id(nome)`)
        .eq("id", solicitacaoId)
        .single();
      return data;
    },
    enabled: !!solicitacaoId,
  });

  // Auto-capture GPS on mount
  useEffect(() => {
    captureGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGps({ status: "error", message: "GPS não suportado neste dispositivo" });
      return;
    }
    setGps({ status: "getting" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => setGps({ status: "error", message: err.message }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const toastId = toast.loading("Otimizando foto...");
    try {
      const compressed = await compressImage(file, qualityHD ? 'hd' : 'standard');
      setFoto(compressed);
      setFotoPreview(URL.createObjectURL(compressed));
      toast.success("Foto pronta", { id: toastId });
    } catch (err) {
      setFoto(file);
      setFotoPreview(URL.createObjectURL(file));
      toast.dismiss(toastId);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (gps.status !== "ok" && !justificativaSemGps.trim()) {
      toast.error("Sem GPS: justifique para continuar");
      return;
    }
    setSubmitting(true);
    try {
      const clientUuid = crypto.randomUUID();

      // 1. Verificar/Criar visita rascunho vinculada à solicitação
      let visitId: string | undefined;
      if (solicitacaoId) {
        const resVisit = await criarOuObterVisitaPorSolicitacao(solicitacaoId);
        if (!resVisit.success) {
          toast.error(resVisit.message);
          setSubmitting(false);
          return;
        }
        visitId = resVisit.data?.id;
      }

      if (solicitacaoId && !visitId) {
        toast.error("Não foi possível vincular o check-in a uma visita técnica.");
        setSubmitting(false);
        return;
      }

      const payload: any = {
        solicitacao_id: solicitacaoId || null,
        registro_consultor_id: visitId || null,
        cliente_id: solicitacao?.cliente_id || null,
        fazenda_id: solicitacao?.fazenda_id || null,
        talhao_id: solicitacao?.talhao_id || null,
        observacoes: observacoes || null,
        latitude: gps.status === "ok" ? gps.lat : null,
        longitude: gps.status === "ok" ? gps.lng : null,
        precisao_gps: gps.status === "ok" ? gps.accuracy : null,
        justificativa_sem_gps: gps.status !== "ok" ? justificativaSemGps : null,
        client_uuid: clientUuid,
        tipo_checkin: tipoCheckin,
        data_hora_checkin: new Date().toISOString()
      };

      // Offline path
      if (!navigator.onLine) {
        const { savePendingCheckin } = await import("@/lib/offlineDb");
        await savePendingCheckin({
          id: `local-${Date.now()}`,
          clientUuid,
          payload,
          fotoBlob: foto || undefined,
          fotoFileName: foto?.name,
          fotoMimeType: foto?.type,
          createdAt: new Date().toISOString(),
        });
        toast.success("Check-in salvo offline. Será sincronizado.");
        navigate(visitId ? `/app/visita/${visitId}` : "/app");
        return;
      }

      let fotoPath: string | null = null;
      if (foto) {
        const ext = foto.name.split(".").pop() || "jpg";
        // Path determinístico para foto de check-in: checkins/{userId}/{clientUuid}.{ext}
        const path = await buildTenantStoragePath(`checkins/${user.id}/${clientUuid}.${ext}`);
        const { error: upErr } = await supabase.storage
          .from("consultor-arquivos")
          .upload(path, foto, { 
            contentType: foto.type,
            upsert: true 
          });
        
        if (!upErr) {
          fotoPath = path;
          // Registrar foto de check-in como evidência técnica (Fase 10.2.1.8.3)
          // Usamos client_uuid único para garantir que não haja duplicidade no registro da evidência
          await supabase.from("registros_consultor_arquivos").insert({
            registro_consultor_id: visitId || null,
            arquivo_path: fotoPath,
            arquivo_url: null,
            tipo_midia: "foto",
            tipo_arquivo: foto.type,
            categoria_arquivo: "checkin",
            uploaded_by: user.id,
            client_uuid: `${clientUuid}_checkin`,
            legenda: `Foto de check-in: ${tipoCheckin === 'chegada_fazenda' ? 'Chegada na Fazenda' : 'Início da Visita'}`,
            latitude: gps.status === "ok" ? gps.lat : null,
            longitude: gps.status === "ok" ? gps.lng : null,
            capturado_em: new Date().toISOString()
          } as any);
        }
      }
      
      const resCheckin = await registrarCheckin({
        ...payload,
        foto_url: null, // Legado
        foto_path: fotoPath,
      });

      if (!resCheckin.success) {
        throw new Error(resCheckin.message);
      }

      toast.success("Check-in registrado!");
      
      if (visitId) {
        setCreatedVisitId(visitId);
        setSuccess(true);
        toast.success("Check-in registrado!");
      } else {
        toast.success("Check-in registrado!");
        navigate("/app");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar check-in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Check-in de Campo</h1>
      </div>

      {success ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-in fade-in zoom-in">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">Check-in Realizado!</h2>
            <p className="text-muted-foreground text-sm">
              Localização registrada e visita vinculada com sucesso.
            </p>
          </div>
          <div className="w-full space-y-3">
            <Button 
              className="w-full h-14 text-base font-semibold"
              onClick={() => navigate(`/app/visita/${createdVisitId}`)}
            >
              Abrir Visita Técnica
            </Button>
            <Button 
              variant="outline"
              className="w-full h-14 text-base"
              onClick={() => navigate("/app")}
            >
              Voltar ao Início
            </Button>
            {createdVisitId && (
              <PresencaCheckoutButton registroId={createdVisitId} className="w-full" />
            )}
          </div>
        </div>
      ) : (
        <>
          {solicitacao && (
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <p className="text-sm font-medium">{solicitacao.tipo_demanda}</p>
          <p className="text-xs text-muted-foreground">
            {solicitacao.clientes?.nome} • {solicitacao.fazendas?.nome}
            {solicitacao.talhoes?.nome && ` › ${solicitacao.talhoes.nome}`}
          </p>
        </div>
      )}

      {/* GPS Status */}
      <div className="rounded-lg border-2 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="font-medium">Localização</span>
          </div>
          <Button size="sm" variant="ghost" onClick={captureGps} disabled={gps.status === "getting"}>
            {gps.status === "getting" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
        {gps.status === "getting" && (
          <p className="text-sm text-muted-foreground">Obtendo coordenadas...</p>
        )}
        {gps.status === "ok" && (
          <div className="space-y-1">
            <p className="text-sm font-mono">
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
            </p>
            <p className="text-xs text-muted-foreground">Precisão: ±{gps.accuracy.toFixed(0)}m</p>
            <a
              href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
            >
              Abrir no Google Maps
            </a>
          </div>
        )}
        {gps.status === "error" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              {gps.message}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Justificativa (obrigatória sem GPS)</Label>
              <Textarea
                value={justificativaSemGps}
                onChange={(e) => setJustificativaSemGps(e.target.value)}
                placeholder="Ex: GPS desligado por bateria, área sem cobertura..."
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Tipo de check-in</Label>
        <Select value={tipoCheckin} onValueChange={(v) => setTipoCheckin(v as any)}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="chegada_fazenda">Chegada na fazenda</SelectItem>
            <SelectItem value="inicio_visita">Início da inspeção</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Observações</Label>
        <Textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Anote algo relevante sobre a chegada..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Foto da chegada (opcional)</Label>
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

        {fotoPreview ? (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden">
            <img src={fotoPreview} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => {
                setFoto(null);
                setFotoPreview(null);
              }}
              className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
        ) : (
          <label className="block w-32 h-32 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground cursor-pointer">
            <Camera className="h-6 w-6" />
            <span className="text-xs">Tirar foto</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
          </label>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || (gps.status !== "ok" && !justificativaSemGps.trim())}
        className="w-full h-14 text-base font-semibold"
      >
        {submitting ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Registrando...</>
        ) : (
          <><CheckCircle2 className="h-5 w-5 mr-2" /> Fazer Check-in</>
        )}
      </Button>
      </>
      )}
    </div>
  );
}
