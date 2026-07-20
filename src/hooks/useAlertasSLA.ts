import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AlertaSLAConfig {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  origem: string | null;
  tipo_alerta: string | null;
  gravidade: string;
  prazo_primeira_resposta_minutos: number | null;
  prazo_resolucao_minutos: number;
  escalonar_apos_minutos: number | null;
  nova_gravidade_apos_sla: string | null;
  notificar_gestor: boolean;
  notificar_responsavel: boolean;
  aplica_horario_comercial: boolean;
  horario_inicio: string | null;
  horario_fim: string | null;
  dias_semana: number[] | null;
}

export interface AlertaSLAEvento {
  id: string;
  alerta_id: string;
  config_id: string | null;
  evento: string;
  gravidade_anterior: string | null;
  gravidade_nova: string | null;
  prazo_primeira_resposta_em: string | null;
  prazo_resolucao_em: string | null;
  vencido_em: string | null;
  escalonado_em: string | null;
  responsavel_id: string | null;
  gestor_notificado: boolean;
  observacao: string | null;
  created_at: string;
}

export function useAlertasSLA(alertaId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configsSLA, setConfigsSLA] = useState<AlertaSLAConfig[]>([]);
  const [eventosSLA, setEventosSLA] = useState<AlertaSLAEvento[]>([]);

  const fetchConfigs = useCallback(async () => {
    const { data, error } = await supabase
      .from("alertas_sla_config" as any)
      .select("*")
      .order("gravidade", { ascending: true });
    if (error) setError(error.message);
    else setConfigsSLA((data as any) || []);
  }, []);

  const fetchEventos = useCallback(async (id?: string) => {
    const target = id ?? alertaId;
    if (!target) return;
    const { data, error } = await supabase
      .from("alertas_sla_eventos" as any)
      .select("*")
      .eq("alerta_id", target)
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else setEventosSLA((data as any) || []);
  }, [alertaId]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchConfigs(), fetchEventos()]);
    } finally {
      setLoading(false);
    }
  }, [fetchConfigs, fetchEventos]);

  useEffect(() => { refetch(); }, [refetch]);

  const aplicarSLA = useCallback(async () => {
    const { data, error } = await supabase.rpc("rpc_aplicar_sla_alertas" as any);
    if (error) {
      toast.error("Erro ao aplicar SLA");
      return null;
    }
    toast.success("SLA aplicado com sucesso");
    await refetch();
    return data;
  }, [refetch]);

  const registrarPrimeiraResposta = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("rpc_registrar_primeira_resposta_alerta" as any, { p_alerta_id: id });
    if (error) {
      toast.error("Erro ao registrar resposta");
      return null;
    }
    toast.success("Primeira resposta registrada");
    await fetchEventos(id);
    return data;
  }, [fetchEventos]);

  const assumirAlerta = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("rpc_assumir_alerta" as any, { p_alerta_id: id });
    if (error) {
      toast.error("Erro ao assumir alerta");
      return null;
    }
    toast.success("Alerta assumido");
    await fetchEventos(id);
    return data;
  }, [fetchEventos]);

  return {
    loading,
    error,
    configsSLA,
    eventosSLA,
    aplicarSLA,
    registrarPrimeiraResposta,
    assumirAlerta,
    refetch,
  };
}
