import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook central de Realtime para a Central de Alertas.
 *
 * Escuta alterações em:
 *  - public.alertas_operacionais (INSERT/UPDATE/DELETE)
 *  - public.alertas_leituras (INSERT/UPDATE)
 *  - public.alertas_acoes (INSERT)
 *
 * Aplica debounce simples para agrupar múltiplos eventos em um único refetch.
 * Os callbacks devem disparar refetch via consultas normais, sujeitas à RLS.
 * O payload bruto do Realtime NÃO é exposto à UI.
 *
 * Fallback: se o canal não conectar em até 10s, dispara refetch periódico
 * de segurança a cada 90s. Refetch manual segue disponível na UI.
 */

export interface UseAlertasRealtimeOptions {
  enabled?: boolean;
  onAlertasChange?: () => void;
  onLeiturasChange?: () => void;
  onAcoesChange?: (alertaId?: string | null) => void;
  userId?: string | null;
  role?: string | null;
  debounceMs?: number;
  channelName?: string;
}

export interface UseAlertasRealtimeResult {
  connected: boolean;
  realtimeEnabled: boolean;
  lastEventAt: Date | null;
  error: string | null;
  reconnect: () => void;
}

const FALLBACK_INTERVAL_MS = 90_000;
const CONNECT_TIMEOUT_MS = 10_000;

export function useAlertasRealtime(
  opts: UseAlertasRealtimeOptions
): UseAlertasRealtimeResult {
  const {
    enabled = true,
    onAlertasChange,
    onLeiturasChange,
    onAcoesChange,
    debounceMs = 800,
    channelName = "alertas-central",
  } = opts;

  const [connected, setConnected] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const alertasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leiturasTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acoesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAcaoIdRef = useRef<string | null>(null);

  const cbAlertasRef = useRef(onAlertasChange);
  const cbLeiturasRef = useRef(onLeiturasChange);
  const cbAcoesRef = useRef(onAcoesChange);
  useEffect(() => {
    cbAlertasRef.current = onAlertasChange;
  }, [onAlertasChange]);
  useEffect(() => {
    cbLeiturasRef.current = onLeiturasChange;
  }, [onLeiturasChange]);
  useEffect(() => {
    cbAcoesRef.current = onAcoesChange;
  }, [onAcoesChange]);

  const reconnect = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    let cancelled = false;
    setError(null);

    const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(`${channelName}-${tick}-${uniq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas_operacionais" },
        () => {
          if (cancelled) return;
          setLastEventAt(new Date());
          if (alertasTimerRef.current) clearTimeout(alertasTimerRef.current);
          alertasTimerRef.current = setTimeout(() => {
            cbAlertasRef.current?.();
          }, debounceMs);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas_leituras" },
        () => {
          if (cancelled) return;
          setLastEventAt(new Date());
          if (leiturasTimerRef.current) clearTimeout(leiturasTimerRef.current);
          leiturasTimerRef.current = setTimeout(() => {
            cbLeiturasRef.current?.();
          }, debounceMs);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alertas_acoes" },
        (payload: any) => {
          if (cancelled) return;
          setLastEventAt(new Date());
          const alertaId = (payload?.new?.alerta_id as string) ?? null;
          pendingAcaoIdRef.current = alertaId;
          if (acoesTimerRef.current) clearTimeout(acoesTimerRef.current);
          acoesTimerRef.current = setTimeout(() => {
            cbAcoesRef.current?.(pendingAcaoIdRef.current);
            pendingAcaoIdRef.current = null;
          }, debounceMs);
        }
      );

    let connectTimeout: ReturnType<typeof setTimeout> | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const startFallback = () => {
      if (fallbackInterval) return;
      setRealtimeEnabled(false);
      fallbackInterval = setInterval(() => {
        cbAlertasRef.current?.();
        cbLeiturasRef.current?.();
      }, FALLBACK_INTERVAL_MS);
    };

    channel.subscribe((status) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        setConnected(true);
        setRealtimeEnabled(true);
        setError(null);
        if (connectTimeout) {
          clearTimeout(connectTimeout);
          connectTimeout = null;
        }
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnected(false);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("Conexão em tempo real indisponível");
          startFallback();
        }
      }
    });

    connectTimeout = setTimeout(() => {
      if (!cancelled) {
        // Se ainda não conectou, ativa fallback
        startFallback();
      }
    }, CONNECT_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (alertasTimerRef.current) clearTimeout(alertasTimerRef.current);
      if (leiturasTimerRef.current) clearTimeout(leiturasTimerRef.current);
      if (acoesTimerRef.current) clearTimeout(acoesTimerRef.current);
      supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [enabled, tick, debounceMs, channelName]);

  return { connected, realtimeEnabled, lastEventAt, error, reconnect };
}
