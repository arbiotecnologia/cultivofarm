import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  MapPin,
  Navigation,
  Clock,
  AlertTriangle,
  WifiOff,
  CloudUpload,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { enqueueCheckin } from "@/lib/offlineCheckinQueue";
import { savePendingCheckin } from "@/lib/offlineDb";
import PresencaCheckoutButton from "@/components/visita/PresencaCheckoutButton";
import { usePendingCheckinsSync } from "@/hooks/usePendingCheckinsSync";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getGoogleMapsUrl, getWazeUrl, captureHighAccuracyPosition, GPS_MAX_DURATION_MS } from "@/lib/geo";

interface CheckinCardProps {
  registroId: string;
  disabled?: boolean;
  obs?: string;
  onObsConsumed?: () => void;
  checkins?: Checkin[];
  talhaoCoords?: { lat: number; lng: number; referencia?: string | null } | null;
  solicitacaoId?: string | null;
}

interface Checkin {
  id: string;
  latitude: number | null;
  longitude: number | null;
  precisao_gps: number | null;
  data_hora_checkin: string;
  tipo_checkin: string;
  foto_url: string | null;
  observacoes: string | null;
  justificativa_sem_gps: string | null;
}

type TipoCheckin = "chegada_fazenda";

function precisionLabel(p: number | null, justification?: string | null) {
  if (justification === "Coordenadas manuais")
    return { label: "Manual (Entrada do consultor)", variant: "secondary" as const };
  if (p == null) return { label: "Sem GPS validado", variant: "destructive" as const };
  if (p < 20) return { label: "Localização confirmada", variant: "default" as const };
  if (p < 100) return { label: "Localização aproximada", variant: "secondary" as const };
  return { label: "Localização imprecisa", variant: "destructive" as const };
}

interface CaptureState {
  tipo: TipoCheckin;
  secondsLeft: number;
  bestAcc: number | null;
}

import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";

export function CheckinCard({ registroId, disabled, obs = "", onObsConsumed, checkins, talhaoCoords, solicitacaoId }: CheckinCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { registrarCheckin } = useFluxoVisitaTecnica();
  const [capturing, setCapturing] = useState<CaptureState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const { pendingCount, isOnline, isSyncing, syncNow } = usePendingCheckinsSync(registroId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const cancelCapture = () => {
    if (abortControllerRef.current) {
      if (confirm("Deseja realmente cancelar a captura da localização? O evento será registrado como 'Sem GPS'.")) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  };

  const handleCheckin = async (tipo: TipoCheckin) => {
    if (capturing || disabled) return;
    if (!user) {
      toast.error("Usuário não autenticado");
      return;
    }
    setLastError(null);
    setCapturing({ tipo, secondsLeft: Math.ceil(GPS_MAX_DURATION_MS / 1000), bestAcc: null });

    const clickedAt = new Date().toISOString();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const coords = await captureHighAccuracyPosition(
        (bestAcc, secondsLeft) => {
          if (!mountedRef.current) return;
          setCapturing((prev) => (prev ? { ...prev, bestAcc, secondsLeft } : prev));
        },
        abortController.signal
      );

      if (!mountedRef.current || abortControllerRef.current !== abortController) return;
      const payload = {
        registro_consultor_id: registroId,
        consultor_id: user.id,
        tipo_checkin: tipo,
        data_hora_checkin: clickedAt,
        solicitacao_id: solicitacaoId || null,
        latitude: coords.lat,
        longitude: coords.lng,
        precisao_gps: coords.acc,
        justificativa_sem_gps: null,
        observacoes: obs.trim() || null,
      };

      if (!navigator.onLine) {
        // Fase 12.8 · Fase 6: fila IndexedDB é a canônica; mantém client_uuid em retries.
        const clientUuid = crypto.randomUUID();
        await savePendingCheckin({
          id: `local-${Date.now()}`,
          clientUuid,
          payload: { ...payload, client_uuid: clientUuid },
          createdAt: new Date().toISOString(),
        });
        // Espelho legado (localStorage) para consumidores ainda não migrados.
        enqueueCheckin(registroId, { ...payload, client_uuid: clientUuid });
        toast.success(
          `Salvo offline (±${Math.round(coords.acc)}m) — sincronizará automaticamente.`
        );
        onObsConsumed?.();
        if (mountedRef.current) setCapturing(null);
        window.dispatchEvent(new StorageEvent("storage", { key: "arbio:pending_checkins" }));
        return;
      }

      const resCheckin = await registrarCheckin(payload);
      
      if (!resCheckin.success) {
        throw new Error(resCheckin.message);
      }
      
      toast.success(`Check-in registrado (±${Math.round(coords.acc)}m)`);
      queryClient.invalidateQueries({ queryKey: ["visita-checkins", registroId] });
      onObsConsumed?.();
    } catch (err: any) {
      if (!mountedRef.current) return;
      if (err?.message === "Captura cancelada pelo usuário.") {
        // Registra o evento mesmo sem GPS após cancelamento manual
        const payload = {
          registro_consultor_id: registroId,
          consultor_id: user.id,
          solicitacao_id: solicitacaoId || null,
          tipo_checkin: capturing?.tipo || "chegada_fazenda",
          data_hora_checkin: new Date().toISOString(),
          latitude: null,
          longitude: null,
          precisao_gps: null,
          justificativa_sem_gps: "Cancelado pelo usuário durante captura",
          observacoes: obs.trim() || null,
        };

        if (!navigator.onLine) {
          const clientUuid = crypto.randomUUID();
          await savePendingCheckin({
            id: `local-${Date.now()}`,
            clientUuid,
            payload: { ...payload, client_uuid: clientUuid },
            createdAt: new Date().toISOString(),
          });
          enqueueCheckin(registroId, { ...payload, client_uuid: clientUuid });
          toast.info("Check-in cancelado salvo offline.");
          window.dispatchEvent(new StorageEvent("storage", { key: "arbio:pending_checkins" }));
        } else {
          // Fase 12.8 · Fase 1: usar RPC segura em vez de INSERT direto.
          const res = await registrarCheckin(payload);
          if (!res.success) throw new Error(res.message);
          queryClient.invalidateQueries({ queryKey: ["visita-checkins", registroId] });
          toast.info("Check-in registrado sem GPS (cancelado).");
        }
        onObsConsumed?.();
      } else {
        setLastError(err?.message || "Falha ao capturar localização.");
        toast.error(err?.message || "Falha ao capturar localização.");
      }
    } finally {
      if (mountedRef.current) {
        setCapturing(null);
        abortControllerRef.current = null;
      }
    }
  };

  const hasCoords = !!(talhaoCoords && Number.isFinite(talhaoCoords.lat) && Number.isFinite(talhaoCoords.lng));
  const copyCoords = () => {
    if (!hasCoords) return;
    navigator.clipboard?.writeText(`${talhaoCoords!.lat}, ${talhaoCoords!.lng}`);
    toast.success("Coordenadas copiadas");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary" />
          Check-in de campo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(!isOnline || pendingCount > 0) && (
          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
              !isOnline
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
            )}
          >
            <span className="flex items-center gap-2">
              {!isOnline ? <WifiOff className="h-3.5 w-3.5" /> : <CloudUpload className="h-3.5 w-3.5" />}
              {!isOnline
                ? `Modo offline${pendingCount > 0 ? ` — ${pendingCount} pendente(s)` : ""}`
                : `${pendingCount} check-in(s) pendente(s) de sincronização`}
            </span>
            {isOnline && pendingCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => syncNow(false)}
                disabled={isSyncing}
              >
                {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sincronizar"}
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {(() => {
            const t: TipoCheckin = "chegada_fazenda";
            const isThisCapturing = capturing?.tipo === t;
            return (
              <Button
                key={t}
                type="button"
                size="lg"
                variant="default"
                className="h-16 text-xs sm:text-sm font-semibold whitespace-normal leading-tight flex-col gap-1 shadow-md active:scale-[0.98] transition-transform"
                onClick={() => handleCheckin(t)}
                disabled={disabled || isThisCapturing}
              >
                {isThisCapturing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-[11px]">
                      Capturando GPS… {capturing!.secondsLeft}s
                      {capturing!.bestAcc != null && ` · ±${Math.round(capturing!.bestAcc)}m`}
                    </span>
                  </>
                ) : (
                  <>
                    <Navigation className="h-5 w-5" />
                    <span>chegada fazenda</span>
                  </>
                )}
              </Button>
            );
          })()}

          {hasCoords ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="lg"
                  variant="secondary"
                  className="h-16 text-xs sm:text-sm font-semibold whitespace-normal leading-tight flex-col gap-1 shadow-md active:scale-[0.98] transition-transform"
                  disabled={disabled}
                >
                  <MapPin className="h-5 w-5" />
                  <span>Como chegar</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Coordenadas do talhão</p>
                  <button
                    type="button"
                    onClick={copyCoords}
                    className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors"
                    title="Copiar coordenadas"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {talhaoCoords!.lat.toFixed(6)}, {talhaoCoords!.lng.toFixed(6)}
                    <Copy className="h-3 w-3 opacity-60" />
                  </button>
                  {talhaoCoords!.referencia && (
                    <p className="text-xs text-muted-foreground italic">📍 {talhaoCoords!.referencia}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <a
                    href={getGoogleMapsUrl(talhaoCoords!.lat, talhaoCoords!.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 hover:opacity-90 transition"
                  >
                    <Navigation className="h-4 w-4" /> Abrir no Google Maps
                  </a>
                  <a
                    href={getWazeUrl(talhaoCoords!.lat, talhaoCoords!.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-input text-sm font-medium py-2 hover:bg-accent transition"
                  >
                    <Navigation className="h-4 w-4" /> Abrir no Waze
                  </a>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="secondary"
              disabled
              className="h-16 text-xs sm:text-sm font-semibold whitespace-normal leading-tight flex-col gap-1 shadow-md"
              title="Cadastre a geolocalização do talhão"
            >
              <MapPin className="h-5 w-5 opacity-60" />
              <span className="text-[11px] opacity-80">Sem geolocalização cadastrada</span>
            </Button>
          )}
        </div>

        {capturing && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-[11px] text-muted-foreground text-center">
              Mantenha o aparelho parado a céu aberto para melhorar a precisão. Não saia desta tela.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={cancelCapture}
              className="h-8 text-[11px] border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              Cancelar Captura
            </Button>
          </div>
        )}

        {checkins && checkins.length > 0 && (
          <div className="border-t pt-3">
            <CheckinList checkins={checkins} />
          </div>
        )}

        {lastError && !capturing && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{lastError}</span>
          </div>
        )}

        {/* Fase 12.8 · Fase 3.7 — Encerrar presença */}
        <PresencaCheckoutButton registroId={registroId} className="mt-2" />
      </CardContent>
    </Card>
  );
}

interface CheckinListProps {
  checkins: Checkin[];
}

export function CheckinList({ checkins }: CheckinListProps) {
  if (!checkins.length) return null;
  return (
    <div className="space-y-2">
      {checkins.map((c) => {
        const has = c.latitude != null && c.longitude != null;
        const acc = precisionLabel(c.precisao_gps, c.justificativa_sem_gps);
        return (
          <div key={c.id} className="rounded-lg border bg-card p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[10px] capitalize">
                {String(c.tipo_checkin).replace(/_/g, " ")}
              </Badge>
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDateTimeDisplay(c.data_hora_checkin)}
              </span>
            </div>
            {has ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-mono">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {Number(c.latitude).toFixed(5)}, {Number(c.longitude).toFixed(5)}
                </div>
                <Badge variant={acc.variant} className="text-[10px]">{acc.label}</Badge>
              </div>
            ) : (
              <div className={cn("rounded p-2 bg-destructive/10 text-destructive")}>
                <p className="font-medium">{c.justificativa_sem_gps === "Coordenadas manuais" ? "Entrada Manual" : "Sem GPS"}</p>
                {c.justificativa_sem_gps && c.justificativa_sem_gps !== "Coordenadas manuais" && <p className="opacity-80 mt-0.5">{c.justificativa_sem_gps}</p>}
              </div>
            )}
            {c.observacoes && <p className="italic text-muted-foreground">{c.observacoes}</p>}
          </div>
        );
      })}
    </div>
  );
}

interface CheckinObservacoesProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function CheckinObservacoes({ value, onChange, disabled }: CheckinObservacoesProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Observações do check-in</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Notas opcionais — serão anexadas ao próximo check-in"
        rows={2}
        disabled={disabled}
      />
    </div>
  );
}
