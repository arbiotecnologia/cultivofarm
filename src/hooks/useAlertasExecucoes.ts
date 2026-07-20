import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ROLES_VER_EXECUCOES = ["administrador", "gestor", "administrativo"] as const;

export function podeVerExecucoes(role: string | null | undefined): boolean {
  return !!role && (ROLES_VER_EXECUCOES as readonly string[]).includes(role);
}

export interface AlertaExecucao {
  id: string;
  tipo_execucao: "manual" | "automatico" | "cron" | "edge_function" | "sistema";
  origem: string;
  status: "iniciada" | "concluida" | "falhou" | "cancelada";
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  total_processados: number;
  total_criados: number;
  total_atualizados: number;
  total_resolvidos_automaticamente: number;
  total_ignorados_por_regra: number;
  erro: string | null;
  metadata: Record<string, unknown>;
  executado_por: string | null;
  created_at: string;
}

export function useAlertasExecucoes(limit = 20) {
  const { role } = useAuth();
  const pode = podeVerExecucoes(role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historico, setHistorico] = useState<AlertaExecucao[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const carregar = useCallback(async () => {
    if (!pode) {
      setHistorico([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await (supabase as any)
        .from("alertas_execucoes")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(limit);
      if (e) throw e;
      setHistorico((data ?? []) as AlertaExecucao[]);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao carregar execucoes");
      setHistorico([]);
    } finally {
      setLoading(false);
    }
  }, [pode, limit]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Realtime simples e isolado para esta tabela.
  useEffect(() => {
    if (!pode) return;
    const uniq = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`alertas-execucoes-${uniq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alertas_execucoes" },
        () => {
          carregar();
        }
      );
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [pode, carregar]);

  const ultimaExecucao = historico[0] ?? null;
  const totalFalhasRecentes = useMemo(() => {
    const limite = Date.now() - 24 * 60 * 60 * 1000;
    return historico.filter(
      (h) => h.status === "falhou" && new Date(h.iniciado_em).getTime() >= limite
    ).length;
  }, [historico]);

  return {
    loading,
    error,
    ultimaExecucao,
    historicoExecucoes: historico,
    totalFalhasRecentes,
    refetch: carregar,
    podeVer: pode,
  };
}
