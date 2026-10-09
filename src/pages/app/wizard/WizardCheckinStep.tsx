import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath } from "@/lib/tenantStoragePath";
import { useGpsCapture } from "@/hooks/useGpsCapture";
import { invalidateWizardProgress } from "@/lib/visita/invalidateWizardProgress";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  MapPin, Loader2, CheckCircle2, Camera, AlertTriangle, X, WifiOff, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/mediaCompression";
import { savePendingCheckin } from "@/lib/offlineDb";
import PresencaCheckoutButton from "@/components/visita/PresencaCheckoutButton";
import { EquipeVisitaCard } from "@/components/visita/EquipeVisitaCard";



interface Props {
  registroId: string;
  clienteId: string | null;
  fazendaId: string | null;
  talhaoId: string | null;
  solicitacaoId?: string | null;
  locked: boolean;
  onDone: () => void;
}

export default function WizardCheckinStep({
  registroId, clienteId, fazendaId, talhaoId, solicitacaoId, locked, onDone,
}: Props) {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const { registrarCheckin } = useFluxoVisitaTecnica();

  const { gps, captureGps, cancelGps } = useGpsCapture();
  const submitLock = useRef(false);
  const [tipoCheckin, setTipoCheckin] = useState<"chegada_fazenda" | "inicio_visita">("chegada_fazenda");
  const [observacoes, setObservacoes] = useState("");
  const [justificativaSemGps, setJustificativaSemGps] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qualityHD, setQualityHD] = useState(
    () => localStorage.getItem("media-quality-pref") === "hd"
  );

  // Permissão de gerenciamento de equipe (server-side)
  const { data: canManageTeam = false } = useQuery({
    queryKey: ["can-manage-visit", registroId, user?.id],
    enabled: !!registroId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_manage_technical_visit" as any, {
        p_user_id: user?.id,
        p_registro_id: registroId,
      });
      if (error) return false;
      return !!data;
    },
  });

  // Check-in existente para esta visita (impede duplicidade)
  const { data: existing, isLoading } = useQuery({
    queryKey: ["wizard-checkin", registroId],
    enabled: !!registroId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas_checkin")
        .select("id, tipo_checkin, data_hora_checkin, latitude, longitude, precisao_gps, observacoes, justificativa_sem_gps, foto_path")
        .eq("registro_consultor_id", registroId)
        .order("data_hora_checkin", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (isLoading || existing || locked) return;
    void captureGps();
    return cancelGps;
  }, [isLoading, existing, locked, captureGps, cancelGps]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Otimizando foto...");
    try {
      const compressed = await compressImage(file, qualityHD ? "hd" : "standard");
      setFoto(compressed);
      setFotoPreview(URL.createObjectURL(compressed));
      toast.success("Foto pronta", { id: toastId });
    } catch {
      setFoto(file);
      setFotoPreview(URL.createObjectURL(file));
      toast.dismiss(toastId);
    }
  };

  const handleSubmit = async () => {
    if (!user || locked || submitLock.current || gps.status === "getting") return;
    if (gps.status !== "ok" && !justificativaSemGps.trim()) {
      toast.error("Sem GPS: justifique para continuar");
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      const clientUuid = crypto.randomUUID();
      const payload: any = {
        solicitacao_id: solicitacaoId || null,
        registro_consultor_id: registroId,
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        talhao_id: talhaoId,
        observacoes: observacoes || null,
        latitude: gps.status === "ok" ? gps.lat : null,
        longitude: gps.status === "ok" ? gps.lng : null,
        precisao_gps: gps.status === "ok" ? gps.accuracy : null,
        justificativa_sem_gps: gps.status !== "ok" ? justificativaSemGps : null,
        client_uuid: clientUuid,
        tipo_checkin: tipoCheckin,
        data_hora_checkin: new Date().toISOString(),
      };

      if (!isOnline) {
        await savePendingCheckin({
          id: `local-${Date.now()}`,
          clientUuid,
          payload,
          fotoBlob: foto || undefined,
          fotoFileName: foto?.name,
          fotoMimeType: foto?.type,
          createdAt: new Date().toISOString(),
        });
        toast.success("Check-in salvo offline. Sincronizará quando houver conexão.");
        onDone();
        return;
      }

      // Upload foto (opcional) — path determinístico
      let fotoPath: string | null = null;
      if (foto) {
        const ext = (foto.name.split(".").pop() || "jpg").toLowerCase();
        const path = await buildTenantStoragePath(`checkins/${user.id}/${clientUuid}.${ext}`);
        const { error: upErr } = await supabase.storage
          .from("consultor-arquivos")
          .upload(path, foto, { contentType: foto.type, upsert: true });
        if (!upErr) {
          fotoPath = path;
          await supabase.from("registros_consultor_arquivos").insert({
            registro_consultor_id: registroId,
            arquivo_path: fotoPath,
            arquivo_url: null,
            tipo_midia: "foto",
            tipo_arquivo: foto.type,
            categoria_arquivo: "checkin",
            uploaded_by: user.id,
            client_uuid: `${clientUuid}_checkin`,
            legenda: `Foto de check-in: ${tipoCheckin === "chegada_fazenda" ? "Chegada na Fazenda" : "Início da Visita"}`,
            latitude: gps.status === "ok" ? gps.lat : null,
            longitude: gps.status === "ok" ? gps.lng : null,
            capturado_em: new Date().toISOString(),
          } as any);
        }
      }

      const res = await registrarCheckin({ ...payload, foto_url: null, foto_path: fotoPath });
      if (!res.success) throw new Error(res.message);

      toast.success("Check-in registrado!");
      await queryClient.invalidateQueries({ queryKey: ["wizard-checkin", registroId] });
      await invalidateWizardProgress(queryClient, registroId, "checkin");
      onDone();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar check-in");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 text-center">
        <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
      </Card>
    );
  }

  // Modo read-only: check-in já existe OU visita locked
  if (existing) {
    return (
      <div className="space-y-3">
        <EquipeVisitaCard registroId={registroId} canManage={canManageTeam} />
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Check-in realizado</span>
          </div>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Tipo: </span>
              {existing.tipo_checkin === "chegada_fazenda" ? "Chegada na fazenda" : "Início da inspeção"}
            </p>
            <p>
              <span className="text-muted-foreground">Data/hora: </span>
              {new Date(existing.data_hora_checkin).toLocaleString("pt-BR")}
            </p>
            {existing.latitude != null && (
              <p className="font-mono text-xs">
                {Number(existing.latitude).toFixed(6)}, {Number(existing.longitude).toFixed(6)}
                {existing.precisao_gps != null && (
                  <span className="text-muted-foreground"> · ±{Number(existing.precisao_gps).toFixed(0)}m</span>
                )}
              </p>
            )}
            {existing.justificativa_sem_gps && (
              <p className="text-xs text-amber-700">Sem GPS: {existing.justificativa_sem_gps}</p>
            )}
            {existing.observacoes && (
              <p className="text-xs text-muted-foreground">{existing.observacoes}</p>
            )}
          </div>
          <div className="pt-1 space-y-2">
            <PresencaCheckoutButton registroId={registroId} className="w-full" />
            <Button size="sm" className="w-full" onClick={onDone}>Continuar para Campo</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (locked) {
    return (
      <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Lock className="h-4 w-4" />
        Visita em modo somente leitura — check-in não pode ser realizado.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <EquipeVisitaCard registroId={registroId} canManage={canManageTeam} />
      <Card className="p-4 space-y-4">
      {/* GPS */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="font-medium">Localização</span>
          </div>
          <Button size="sm" variant="ghost" onClick={captureGps} disabled={submitting}>
            {gps.status === "getting" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
        {gps.status === "getting" && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Melhorando localização… {gps.secondsLeft}s restantes{gps.bestAcc !== null ? ` · melhor precisão ±${gps.bestAcc.toFixed(0)}m` : ""}</p>
        )}
        {gps.status === "ok" && (
          <div className="space-y-1">
            <p className="text-sm font-mono">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</p>
            <p className="text-xs text-muted-foreground">Precisão: ±{gps.accuracy.toFixed(0)}m{gps.accuracy > 30 ? " · Baixa precisão" : " · Localização precisa"}</p>
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
                placeholder="Ex.: GPS desligado, área sem cobertura..."
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
              type="button"
              onClick={() => { setFoto(null); setFotoPreview(null); }}
              className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
              aria-label="Remover foto"
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
        ) : (
          <label className="w-32 h-32 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground cursor-pointer">
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

      {!isOnline && (
        <div className="flex items-center gap-1 text-[11px] text-amber-700">
          <WifiOff className="h-3 w-3" /> Offline — o check-in ficará pendente até haver conexão.
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={submitting || gps.status === "getting" || (gps.status !== "ok" && !justificativaSemGps.trim())}
        className="w-full h-12 text-base font-semibold"
      >
        {submitting ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Registrando...</>
        ) : (
          <><CheckCircle2 className="h-5 w-5 mr-2" /> Fazer Check-in</>
        )}
      </Button>
      </Card>
    </div>
  );
}
