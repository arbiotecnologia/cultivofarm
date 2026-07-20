import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface NotificacaoConfig {
  id: string;
  canal: "email" | "whatsapp";
  ativo: boolean;
  gravidades: string[];
  origens: string[] | null;
  tipos: string[] | null;
  cooldown_minutos: number;
  max_envios_por_alerta: number;
  enviar_resumo: boolean;
  horario_inicio: string | null;
  horario_fim: string | null;
  dias_semana: number[] | null;
  resumo_diario_ativo: boolean;
  resumo_semanal_ativo: boolean;
  horario_resumo: string | null;
  dia_semana_resumo: number | null;
  incluir_alertas_media: boolean;
  incluir_informativos: boolean;
  updated_at: string;
}

export interface NotificacaoDestinatario {
  id: string;
  user_id: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  canal: "email" | "whatsapp";
  ativo: boolean;
  gravidades: string[] | null;
  origens: string[] | null;
  receber_resumo: boolean;
  created_at: string;
}

export interface NotificacaoItem {
  id: string;
  alerta_id: string;
  destinatario_id: string | null;
  canal: string;
  destino: string;
  assunto: string | null;
  status: string;
  tentativa: number;
  enviado_em: string | null;
  erro: string | null;
  provider: string | null;
  created_at: string;
}

export interface ResumoItem {
  id: string;
  tipo_resumo: string;
  canal: string;
  periodo_inicio: string;
  periodo_fim: string;
  status: string;
  destino: string;
  assunto: string | null;
  total_alertas: number;
  total_criticos: number;
  total_alta: number;
  total_resolvidos: number;
  enviado_em: string | null;
  erro: string | null;
  created_at: string;
}


function isAdminOrGestor(role: string | null | undefined) {
  return role === "administrador" || role === "gestor";
}

export function useAlertasNotificacoes() {
  const { role } = useAuth();
  const podeGerenciar = isAdminOrGestor(role);
  const podeVer = podeGerenciar || role === "administrativo";

  const [configs, setConfigs] = useState<NotificacaoConfig[]>([]);
  const [destinatarios, setDestinatarios] = useState<NotificacaoDestinatario[]>([]);
  const [historico, setHistorico] = useState<NotificacaoItem[]>([]);
  const [historicoResumos, setHistoricoResumos] = useState<ResumoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [processandoResumo, setProcessandoResumo] = useState(false);

  const carregar = useCallback(async () => {
    if (!podeVer) return;
    setLoading(true);
    setError(null);
    try {
      const [c, d, h, r] = await Promise.all([
        supabase.from("alertas_notificacao_config").select("*").order("canal"),
        supabase
          .from("alertas_notificacao_destinatarios")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("alertas_notificacoes")
          .select(
            "id, alerta_id, destinatario_id, canal, destino, assunto, status, tentativa, enviado_em, erro, provider, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("alertas_resumos")
          .select(
            "id, tipo_resumo, canal, periodo_inicio, periodo_fim, status, destino, assunto, total_alertas, total_criticos, total_alta, total_resolvidos, enviado_em, erro, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      if (h.error) throw h.error;
      if (r.error) throw r.error;
      setConfigs((c.data ?? []) as NotificacaoConfig[]);
      setDestinatarios((d.data ?? []) as NotificacaoDestinatario[]);
      setHistorico((h.data ?? []) as NotificacaoItem[]);
      setHistoricoResumos((r.data ?? []) as ResumoItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar notificações");
    } finally {
      setLoading(false);
    }
  }, [podeVer]);


  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvarConfig = useCallback(
    async (id: string, patch: Partial<NotificacaoConfig>) => {
      if (!podeGerenciar) throw new Error("sem_permissao");
      const { error } = await supabase
        .from("alertas_notificacao_config")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
      await carregar();
    },
    [podeGerenciar, carregar],
  );

  const salvarDestinatario = useCallback(
    async (input: Partial<NotificacaoDestinatario> & { id?: string }) => {
      if (!podeGerenciar) throw new Error("sem_permissao");
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase
          .from("alertas_notificacao_destinatarios")
          .update(rest as never)
          .eq("id", id);
        if (error) throw error;
      } else {
        if (!input.nome) throw new Error("nome_obrigatorio");
        if ((input.canal ?? "email") === "email" && !input.email) {
          throw new Error("email_obrigatorio");
        }
        const { error } = await supabase
          .from("alertas_notificacao_destinatarios")
          .insert({
            nome: input.nome,
            email: input.email ?? null,
            telefone: input.telefone ?? null,
            canal: (input.canal ?? "email") as "email" | "whatsapp",
            ativo: input.ativo ?? true,
            gravidades: input.gravidades ?? null,
            origens: input.origens ?? null,
            receber_resumo: input.receber_resumo ?? false,
          } as never);
        if (error) throw error;

      }
      await carregar();
    },
    [podeGerenciar, carregar],
  );

  const alternarDestinatario = useCallback(
    async (id: string, ativo: boolean) => {
      if (!podeGerenciar) throw new Error("sem_permissao");
      const { error } = await supabase
        .from("alertas_notificacao_destinatarios")
        .update({ ativo } as never)
        .eq("id", id);
      if (error) throw error;
      await carregar();
    },
    [podeGerenciar, carregar],
  );

  // Desativar (não excluir) destinatário — mantém histórico e rastreabilidade.
  const desativarDestinatario = useCallback(
    async (id: string) => {
      if (!podeGerenciar) throw new Error("sem_permissao");
      const { error } = await supabase
        .from("alertas_notificacao_destinatarios")
        .update({ ativo: false } as never)
        .eq("id", id);
      if (error) throw error;
      await carregar();
    },
    [podeGerenciar, carregar],
  );

  const processarNotificacoesManual = useCallback(async () => {
    if (!podeGerenciar) throw new Error("sem_permissao");
    setProcessando(true);
    try {
      const { data, error } = await supabase.rpc(
        "rpc_preparar_notificacoes_alertas",
      );
      if (error) throw error;
      await carregar();
      return data as {
        total_alertas_analisados: number;
        total_notificacoes_criadas: number;
        total_ignoradas_cooldown: number;
        total_bloqueadas_limite: number;
      };
    } finally {
      setProcessando(false);
    }
  }, [podeGerenciar, carregar]);

  const processarResumoManual = useCallback(
    async (tipo: "diario" | "semanal" | "manual" = "diario") => {
      if (!podeGerenciar) throw new Error("sem_permissao");
      setProcessandoResumo(true);
      try {
        const { data, error } = await supabase.rpc(
          "rpc_preparar_resumos_alertas",
          { p_tipo_resumo: tipo },
        );
        if (error) throw error;
        await carregar();
        return data as {
          total_destinatarios: number;
          total_resumos_criados: number;
          total_ignorados_duplicidade: number;
          total_alertas_periodo: number;
        };
      } finally {
        setProcessandoResumo(false);
      }
    },
    [podeGerenciar, carregar],
  );

  const resumoConfig = configs.find((c) => c.canal === "email");

  return {
    podeVer,
    podeGerenciar,
    loading,
    error,
    configs,
    destinatarios,
    historico,
    historicoResumos,
    resumoConfig,
    processando,
    processandoResumo,
    refetch: carregar,
    refetchResumos: carregar,
    salvarConfig,
    salvarResumoConfig: salvarConfig,
    salvarDestinatario,
    alternarDestinatario,
    desativarDestinatario,
    removerDestinatario: desativarDestinatario,
    processarNotificacoesManual,
    processarResumoManual,
  };
}
