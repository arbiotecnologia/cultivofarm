/**
 * Fase 12.8 · Fase 3.7 — Ação "Finalizar presença" (checkout server-side).
 *
 * Componente compartilhado por mobile e desktop:
 *  - detecta se o técnico logado tem check-in ativo na visita;
 *  - captura GPS ou justificativa;
 *  - dispara `rpc_realizar_checkout_visita` via useFluxoVisitaTecnica;
 *  - offline: enfileira via savePendingCheckin com tipo_checkin='checkout'
 *    (o replay em useOfflineSync/offlineCheckinQueue já roteia para a RPC certa).
 *  - após o checkout, mostra "Presença encerrada às HH:mm".
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { savePendingCheckin } from "@/lib/offlineDb";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Loader2, LogOut, MapPin, WifiOff } from "lucide-react";
import { toast } from "sonner";

type GpsState =
  | { status: "idle" }
  | { status: "getting" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "error"; message: string };

interface Props {
  registroId: string;
  className?: string;
}

export default function PresencaCheckoutButton({ registroId, className }: Props) {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const { registrarCheckout } = useFluxoVisitaTecnica();

  const [open, setOpen] = useState(false);
  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const [justificativa, setJustificativa] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Último evento de presença do técnico corrente nesta visita
  const { data: last, isLoading } = useQuery({
    queryKey: ["presenca-ultimo-evento", registroId, user?.id],
    enabled: !!registroId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitas_checkin")
        .select("id, tipo_checkin, data_hora_checkin")
        .eq("registro_consultor_id", registroId)
        .eq("consultor_id", user!.id)
        .order("data_hora_checkin", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open || gps.status !== "idle") return;
    captureGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  if (isLoading || !last) return null;

  // Já encerrou — só exibe o carimbo
  if ((last as any).tipo_checkin === "checkout") {
    const hh = new Date((last as any).data_hora_checkin).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className={`flex items-center gap-2 text-sm text-emerald-700 ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4" />
        <span>Presença encerrada às {hh}</span>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!user) return;
    if (gps.status !== "ok" && !justificativa.trim()) {
      toast.error("Sem GPS: justifique para encerrar a presença");
      return;
    }
    setSubmitting(true);
    try {
      const clientUuid = crypto.randomUUID();
      const payload: any = {
        registro_consultor_id: registroId,
        client_uuid: clientUuid,
        tipo_checkin: "checkout",
        latitude: gps.status === "ok" ? gps.lat : null,
        longitude: gps.status === "ok" ? gps.lng : null,
        precisao_gps: gps.status === "ok" ? gps.accuracy : null,
        justificativa_sem_gps: gps.status !== "ok" ? justificativa : null,
        observacoes: observacoes || null,
        data_hora_checkin: new Date().toISOString(),
      };

      if (!isOnline) {
        await savePendingCheckin({
          id: `local-${Date.now()}`,
          clientUuid,
          payload,
          createdAt: new Date().toISOString(),
        });
        toast.success("Checkout salvo offline. Sincronizará quando houver conexão.");
        setOpen(false);
        return;
      }

      const res = await registrarCheckout(payload);
      if (!res.success) throw new Error(res.message);
      toast.success("Presença encerrada");
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["presenca-ultimo-evento", registroId, user.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["visita-checkins", registroId] });
      await queryClient.invalidateQueries({ queryKey: ["wizard-checkin", registroId] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao encerrar presença");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Finalizar presença
      </Button>
    );
  }

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="h-4 w-4 text-primary" />
          Finalizar presença
        </div>
        <Button size="sm" variant="ghost" onClick={captureGps} disabled={gps.status === "getting"}>
          {gps.status === "getting" ? <Loader2 className="h-4 w-4 animate-spin" /> : "GPS"}
        </Button>
      </div>

      {gps.status === "ok" && (
        <p className="text-xs font-mono">
          {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}{" "}
          <span className="text-muted-foreground">· ±{gps.accuracy.toFixed(0)}m</span>
        </p>
      )}
      {gps.status === "error" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertTriangle className="h-4 w-4" />
            {gps.message}
          </div>
          <Label className="text-xs">Justificativa (obrigatória sem GPS)</Label>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={2}
            placeholder="Ex.: sem sinal na área..."
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Observações (opcional)</Label>
        <Textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={2}
          placeholder="Anote algo sobre o encerramento..."
        />
      </div>

      {!isOnline && (
        <div className="flex items-center gap-1 text-[11px] text-amber-700">
          <WifiOff className="h-3 w-3" /> Offline — checkout ficará pendente.
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={submitting || (gps.status !== "ok" && !justificativa.trim())}
          className="flex-1"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Encerrando...</>
          ) : (
            <><LogOut className="h-4 w-4 mr-2" /> Encerrar presença</>
          )}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
