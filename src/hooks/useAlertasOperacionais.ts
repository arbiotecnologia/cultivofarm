import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAlertasRealtime } from "@/hooks/useAlertasRealtime";


export type AlertaStatus = "aberto" | "lido" | "resolvido" | "ignorado" | "reaberto";
export type AlertaGravidade = "informativa" | "baixa" | "media" | "alta" | "critica";
export type AlertaOrigem =
  | "visita"
  | "recomendacao"
  | "laboratorio"
  | "cq"
  | "estoque"
  | "entrega"
  | "bi"
  | "sistema";

export interface AlertaOperacional {
  id: string;
  tipo: string;
  origem: AlertaOrigem;
  titulo: string;
  descricao: string;
  gravidade: AlertaGravidade;
  status: AlertaStatus;
  cliente_id: string | null;
  fazenda_id: string | null;
  talhao_id: string | null;
  consultor_id: string | null;
  os_id: string | null;
  os_origem: string | null;
  registro_consultor_id: string | null;
  solicitacao_id: string | null;
  lote_id: string | null;
  entrega_id: string | null;
  referencia_tabela: string | null;
  referencia_id: string | null;
  proxima_acao: string | null;
  metadata: Record<string, unknown>;
  criado_por: string | null;
  resolvido_por: string | null;
  resolvido_em: string | null;
  ignorado_por: string | null;
  ignorado_em: string | null;
  chave_dedupe: string | null;
  created_at: string;
  updated_at: string;
  // SLA / priorização (Fase 12.8/12.9)
  sla_config_id?: string | null;
  sla_primeira_resposta_em?: string | null;
  sla_resolucao_em?: string | null;
  primeira_resposta_em?: string | null;
  sla_vencido?: boolean | null;
  sla_vencido_em?: string | null;
  escalonado?: boolean | null;
  escalonado_em?: string | null;
  escalonado_para?: string | null;
  prioridade_score?: number | null;
  responsavel_id?: string | null;
}

export interface AlertasFiltros {
  periodoInicio?: string;
  periodoFim?: string;
  status?: AlertaStatus | "todos";
  gravidade?: AlertaGravidade | "todas";
  origem?: AlertaOrigem | "todas";
  clienteId?: string;
  fazendaId?: string;
  consultorId?: string;
  tipo?: string;
  somenteCriticos?: boolean;
  geradoAutomaticamente?: boolean;
  apenasMeusAlertas?: boolean;
  apenasNaoLidos?: boolean;
  apenasAltaPrioridade?: boolean;
}

const GRAVIDADE_ORDEM: Record<AlertaGravidade, number> = {
  critica: 5,
  alta: 4,
  media: 3,
  baixa: 2,
  informativa: 1,
};

export const ROLES_PODEM_GERAR: ReadonlyArray<string> = [
  "administrador",
  "gestor",
  "administrativo",
];

export function podeGerarAlertas(role: string | null | undefined): boolean {
  return !!role && ROLES_PODEM_GERAR.includes(role);
}

export function useAlertasOperacionais(initial: AlertasFiltros = {}) {
  const { user, role } = useAuth();
  const [alertas, setAlertas] = useState<AlertaOperacional[]>([]);
  const [lidoIds, setLidoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<AlertasFiltros>({
    status: "aberto",
    ...initial,
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = (supabase as any)
        .from("alertas_operacionais")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filtros.status && filtros.status !== "todos") q = q.eq("status", filtros.status);
      if (filtros.gravidade && filtros.gravidade !== "todas") q = q.eq("gravidade", filtros.gravidade);
      if (filtros.origem && filtros.origem !== "todas") q = q.eq("origem", filtros.origem);
      if (filtros.clienteId) q = q.eq("cliente_id", filtros.clienteId);
      if (filtros.fazendaId) q = q.eq("fazenda_id", filtros.fazendaId);
      if (filtros.consultorId) q = q.eq("consultor_id", filtros.consultorId);
      if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
      if (filtros.periodoInicio) q = q.gte("created_at", filtros.periodoInicio);
      if (filtros.periodoFim) q = q.lte("created_at", filtros.periodoFim);
      if (filtros.somenteCriticos) q = q.in("gravidade", ["alta", "critica"]);
      if (filtros.geradoAutomaticamente) q = q.is("criado_por", null);
      if (filtros.apenasMeusAlertas && user?.id) q = q.eq("consultor_id", user.id);

      const { data, error: e } = await q;
      if (e) throw e;
      const rows = (data ?? []) as AlertaOperacional[];
      rows.sort(
        (a, b) =>
          (b.prioridade_score ?? 0) - (a.prioridade_score ?? 0) ||
          GRAVIDADE_ORDEM[b.gravidade] - GRAVIDADE_ORDEM[a.gravidade] ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setAlertas(rows);

      if (user?.id && rows.length) {
        const ids = rows.map((r) => r.id);
        const { data: leit } = await (supabase as any)
          .from("alertas_leituras")
          .select("alerta_id")
          .eq("user_id", user.id)
          .in("alerta_id", ids);
        setLidoIds(new Set((leit ?? []).map((l: any) => l.alerta_id)));
      } else {
        setLidoIds(new Set());
      }
    } catch (err: any) {
      setError(err?.message ?? "Erro ao carregar alertas");
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  }, [filtros, user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);


  // Marcar como "lido" agora APENAS registra leitura por usuário em alertas_leituras.
  // Não altera o status global do alerta.
  const marcarComoLido = useCallback(
    async (alertaId: string) => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      await (supabase as any)
        .from("alertas_leituras")
        .upsert(
          { alerta_id: alertaId, user_id: user.id, lido_em: new Date().toISOString() },
          { onConflict: "alerta_id,user_id" }
        );
      setLidoIds((prev) => {
        const next = new Set(prev);
        next.add(alertaId);
        return next;
      });
    },
    [user?.id]
  );

  const resolverAlerta = useCallback(
    async (alertaId: string, observacao?: string) => {
      const { data, error: e } = await (supabase as any).rpc("rpc_resolver_alerta_operacional", {
        p_alerta_id: alertaId,
        p_observacao: observacao ?? null,
      });
      if (e) throw e;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error ?? "erro_resolver");
      }
      await carregar();
    },
    [carregar]
  );

  const ignorarAlerta = useCallback(
    async (alertaId: string, observacao?: string) => {
      const { data, error: e } = await (supabase as any).rpc("rpc_ignorar_alerta_operacional", {
        p_alerta_id: alertaId,
        p_observacao: observacao ?? null,
      });
      if (e) throw e;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error ?? "erro_ignorar");
      }
      await carregar();
    },
    [carregar]
  );

  const reabrirAlerta = useCallback(
    async (alertaId: string, observacao?: string) => {
      const { data, error: e } = await (supabase as any).rpc("rpc_reabrir_alerta_operacional", {
        p_alerta_id: alertaId,
        p_observacao: observacao ?? null,
      });
      if (e) throw e;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error ?? "erro_reabrir");
      }
      await carregar();
    },
    [carregar]
  );

  const gerarAlertas = useCallback(async () => {
    if (!podeGerarAlertas(role)) {
      throw new Error("Você não tem permissão para gerar alertas.");
    }
    setGerando(true);
    try {
      const { data, error: e } = await (supabase as any).rpc("rpc_executar_motor_alertas", {
        p_tipo_execucao: "manual",
        p_origem: "central_alertas",
      });
      if (e) throw e;
      await carregar();
      const resultado = ((data as any)?.resultado ?? data ?? {}) as Record<string, any>;
      return {
        total_processados: resultado.total_processados ?? 0,
        total_criados: resultado.total_criados ?? 0,
        total_atualizados: resultado.total_atualizados ?? 0,
        total_resolvidos_automaticamente: resultado.total_resolvidos_automaticamente ?? 0,
        total_ignorados_por_regra: resultado.total_ignorados_por_regra ?? 0,
        executado_em: (data as any)?.executado_em,
      };
    } finally {
      setGerando(false);
    }
  }, [role, carregar]);

  // Registra leitura por usuário sem alterar status global.
  // Silencioso em erros de duplicidade (constraint unique).
  const registrarLeitura = useCallback(
    async (alertaId: string) => {
      if (!user?.id || lidoIds.has(alertaId)) return;
      const { error: e } = await (supabase as any)
        .from("alertas_leituras")
        .upsert(
          { alerta_id: alertaId, user_id: user.id, lido_em: new Date().toISOString() },
          { onConflict: "alerta_id,user_id" }
        );
      if (!e) {
        setLidoIds((prev) => {
          const next = new Set(prev);
          next.add(alertaId);
          return next;
        });
      }
    },
    [user?.id, lidoIds]
  );

  const marcarTodosComoLidos = useCallback(async () => {
    if (!user?.id) return 0;
    const naoLidos = alertas.filter((a) => !lidoIds.has(a.id));
    if (!naoLidos.length) return 0;
    const payload = naoLidos.map((a) => ({
      alerta_id: a.id,
      user_id: user.id,
      lido_em: new Date().toISOString(),
    }));
    const { error: e } = await (supabase as any)
      .from("alertas_leituras")
      .upsert(payload, { onConflict: "alerta_id,user_id" });
    if (!e) {
      setLidoIds((prev) => {
        const next = new Set(prev);
        naoLidos.forEach((a) => next.add(a.id));
        return next;
      });
    }
    return naoLidos.length;
  }, [alertas, lidoIds, user?.id]);

  // Realtime: refetch agrupado quando ocorrem mudanças em alertas/leituras.
  const realtime = useAlertasRealtime({
    enabled: !!user?.id,
    userId: user?.id ?? null,
    role,
    channelName: "alertas-lista",
    onAlertasChange: carregar,
    onLeiturasChange: carregar,
  });


  const alertasFiltrados = useMemo(() => {
    let rows = alertas;
    if (filtros.apenasNaoLidos) rows = rows.filter((a) => !lidoIds.has(a.id));
    if (filtros.apenasAltaPrioridade)
      rows = rows.filter((a) => a.gravidade === "critica" || a.gravidade === "alta");
    return rows;
  }, [alertas, lidoIds, filtros.apenasNaoLidos, filtros.apenasAltaPrioridade]);

  const totais = useMemo(() => {
    const ativos = alertas.filter(
      (a) => a.status === "aberto" || a.status === "reaberto" || a.status === "lido"
    );
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      totalAbertos: ativos.length,
      totalCriticos: ativos.filter((a) => a.gravidade === "critica").length,
      totalAlta: ativos.filter((a) => a.gravidade === "alta").length,
      totalNaoLidos: ativos.filter((a) => !lidoIds.has(a.id)).length,
      totalResolvidos: alertas.filter((a) => a.status === "resolvido").length,
      totalGeradosHoje: alertas.filter((a) => (a.created_at ?? "").slice(0, 10) === hoje).length,
    };
  }, [alertas, lidoIds]);

  return {
    loading,
    gerando,
    error,
    alertas: alertasFiltrados,
    alertasBrutos: alertas,
    lidoIds,
    filtros,
    setFiltros,
    role,
    podeGerar: podeGerarAlertas(role),
    ...totais,
    marcarComoLido,
    registrarLeitura,
    marcarTodosComoLidos,
    resolverAlerta,
    ignorarAlerta,
    reabrirAlerta,
    gerarAlertas,
    atualizarAlertas: carregar,
    realtimeConnected: realtime.connected,
    realtimeEnabled: realtime.realtimeEnabled,
    realtimeLastEventAt: realtime.lastEventAt,
    reconectarRealtime: realtime.reconnect,
  };
}


export function useAlertasContador() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { count: c } = await (supabase as any)
        .from("alertas_operacionais")
        .select("id", { count: "exact", head: true })
        .in("status", ["aberto", "reaberto"]);
      if (mounted) setCount(c ?? 0);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return count;
}
