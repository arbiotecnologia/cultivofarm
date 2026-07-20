import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { podeVerAlertas } from "@/lib/alertasPermissions";
import { useAlertasRealtime } from "@/hooks/useAlertasRealtime";
import type {
  AlertaGravidade,
  AlertaOperacional,
  AlertaOrigem,
  AlertaStatus,
} from "@/hooks/useAlertasOperacionais";


const GRAVIDADE_ORDEM: Record<AlertaGravidade, number> = {
  critica: 5,
  alta: 4,
  media: 3,
  baixa: 2,
  informativa: 1,
};

const CAMPOS_RESUMO =
  "id, tipo, origem, titulo, gravidade, status, cliente_id, fazenda_id, consultor_id, os_id, created_at, proxima_acao";

export interface AlertaResumido {
  id: string;
  tipo: string;
  origem: AlertaOrigem;
  titulo: string;
  gravidade: AlertaGravidade;
  status: AlertaStatus;
  cliente_id: string | null;
  fazenda_id: string | null;
  consultor_id: string | null;
  os_id: string | null;
  created_at: string;
  proxima_acao: string | null;
}

interface UseAlertasResumoOptions {
  limitePrioritarios?: number;
  limiteRecentes?: number;
}

export function useAlertasResumo(opts: UseAlertasResumoOptions = {}) {
  const { user, role } = useAuth();
  const limitePrio = opts.limitePrioritarios ?? 5;
  const limiteRec = opts.limiteRecentes ?? 5;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ativos, setAtivos] = useState<AlertaResumido[]>([]);
  const [lidoIds, setLidoIds] = useState<Set<string>>(new Set());
  const [resolvidosHoje, setResolvidosHoje] = useState(0);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    if (!podeVerAlertas(role)) {
      setAtivos([]);
      setLidoIds(new Set());
      setResolvidosHoje(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await (supabase as any)
        .from("alertas_operacionais")
        .select(CAMPOS_RESUMO)
        .in("status", ["aberto", "lido", "reaberto"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) throw e;
      const rows = (data ?? []) as AlertaResumido[];
      rows.sort(
        (a, b) =>
          GRAVIDADE_ORDEM[b.gravidade] - GRAVIDADE_ORDEM[a.gravidade] ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setAtivos(rows);

      if (user?.id && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: leituras } = await (supabase as any)
          .from("alertas_leituras")
          .select("alerta_id")
          .eq("user_id", user.id)
          .in("alerta_id", ids);
        setLidoIds(new Set((leituras ?? []).map((l: any) => l.alerta_id)));
      } else {
        setLidoIds(new Set());
      }

      const hojeIso = new Date().toISOString().slice(0, 10);
      const { count } = await (supabase as any)
        .from("alertas_operacionais")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolvido")
        .gte("resolvido_em", `${hojeIso}T00:00:00`);
      setResolvidosHoje(count ?? 0);

      setUltimaAtualizacao(new Date());
    } catch (err: any) {
      setError(err?.message ?? "Erro ao carregar resumo de alertas");
      setAtivos([]);
    } finally {
      setLoading(false);
    }
  }, [role, user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Realtime: refetch agrupado quando ocorrem mudanças relevantes.
  const realtime = useAlertasRealtime({
    enabled: !!user?.id && podeVerAlertas(role),
    userId: user?.id ?? null,
    role,
    channelName: `alertas-resumo-${user?.id ?? "anon"}`,
    onAlertasChange: carregar,
    onLeiturasChange: carregar,
  });


  const totalAbertos = ativos.length;
  const totalCriticos = ativos.filter((a) => a.gravidade === "critica").length;
  const totalAlta = ativos.filter((a) => a.gravidade === "alta").length;
  const totalMedia = ativos.filter((a) => a.gravidade === "media").length;
  const totalInformativos = ativos.filter(
    (a) => a.gravidade === "informativa" || a.gravidade === "baixa"
  ).length;
  const totalNaoLidos = ativos.filter((a) => !lidoIds.has(a.id)).length;

  const alertasPrioritarios = ativos
    .filter((a) => a.gravidade === "critica" || a.gravidade === "alta")
    .slice(0, limitePrio);

  const alertasRecentes = [...ativos]
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, limiteRec);

  const meusAlertas = user?.id
    ? ativos.filter((a) => a.consultor_id === user.id).slice(0, limitePrio)
    : [];

  return {
    loading,
    error,
    totalAbertos,
    totalNaoLidos,
    totalCriticos,
    totalAlta,
    totalMedia,
    totalInformativos,
    totalResolvidosHoje: resolvidosHoje,
    alertasPrioritarios,
    alertasRecentes,
    meusAlertas,
    lidoIds,
    ultimaAtualizacao,
    refetch: carregar,
    podeVer: podeVerAlertas(role),
    realtimeConnected: realtime.connected,
    realtimeEnabled: realtime.realtimeEnabled,
  };
}

export type UseAlertasResumo = ReturnType<typeof useAlertasResumo>;

// re-export para conveniência
export type { AlertaOperacional };
