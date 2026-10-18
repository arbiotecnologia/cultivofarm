import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface SimulationItemInput {
  item_tipo: "produto" | "microrganismo";
  item_id: string;
  nome: string;
  quantidade: number;
  valor_unitario_cheio: number;
  subtotal: number;
  // Snapshots comerciais (opcionais para retrocompat)
  product_id?: string | null;
  microrganismo_id?: string | null;
  unidade_medida?: string | null;
  volume_ml?: number | null;
  volume_id?: string | null;
  volume_rotulo?: string | null;
  produto_codigo_snapshot?: string | null;
  produto_nome_snapshot?: string | null;
  preco_tabela_snapshot?: number | null;
  preco_unitario?: number | null;
  desconto_percentual?: number | null;
  area_ha?: number | null;
}

export type PartnerSimulationStatus =
  | "rascunho"
  | "enviada_gestor"
  | "convertida_pedido"
  | "arquivada";

export interface PartnerSimulation {
  id: string;
  partner_id: string;
  created_by: string;
  titulo: string | null;
  observacoes: string | null;
  cultura: string | null;
  area_total_ha: number | null;
  objetivo_tecnico: string | null;
  status: PartnerSimulationStatus;
  total_cheio: number;
  converted_order_id: string | null;
  converted_by: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  items_count?: number;
  cliente_id?: string | null;
  cliente_nome_snapshot?: string | null;
  propriedade_nome_snapshot?: string | null;
  cliente_cidade_snapshot?: string | null;
  cliente_uf_snapshot?: string | null;
}

export function usePartnerSimulations(partnerId: string | null | undefined) {
  const { user } = useAuth();
  return useScopedPortalQuery({
    queryKey: ["partner-simulations", partnerId, user?.id],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerSimulation[]> => {
      if (!partnerId) return [];
      const { data, error } = await supabase.rpc("b2b_read_simulations" as any, { p_partner_id: partnerId });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any) => ({
        ...r,
        items_count: r.items_count ?? 0,
      }));
    },
  });
}

export function usePartnerSimulationItems(simulationId: string | null) {
  const { user, role } = useAuth();
  return useScopedPortalQuery({
    queryKey: ["partner-simulation-items", simulationId, user?.id, role],
    enabled: !!simulationId,
    queryFn: async () => {
      if (!simulationId) return [];
      if (role === "parceiro_b2b_tecnico") {
        const { data, error } = await supabase.rpc("b2b_read_simulations" as any, { p_simulation_id: simulationId, p_items: true });
        if (error) throw error;
        return (data ?? []) as any[];
      }
      const { data, error } = await supabase
        .from("partner_simulation_items" as any)
        .select(`
          *,
          produtos:product_id (
            nome, codigo, tipo, funcao_completa, modo_acao, modo_aplicacao, dose_ml_ha,
            formulacoes:formulacoes!produto_id (
              proporcao, volume_ml, concentracao, unidade,
              microrganismos:microrganismo_id (nome, concentracao_label)
            )
          ),
          microrganismos:microrganismo_id (
            nome, codigo, tipo, nome_cientifico, concentracao_label, funcao_agronomica, dose_ml_ha
          )
        `)
        .eq("simulation_id", simulationId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePartnerSimulation() {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      partner_id: string;
      observacoes?: string;
      titulo?: string;
      cultura?: string | null;
      area_total_ha?: number | null;
      objetivo_tecnico?: string | null;
      status?: PartnerSimulationStatus;
      cliente_id?: string | null;
      cliente_nome_snapshot?: string | null;
      propriedade_nome_snapshot?: string | null;
      cliente_cidade_snapshot?: string | null;
      cliente_uf_snapshot?: string | null;
      valid_until?: string | null;
      items: SimulationItemInput[];
    }) => {
      const total = payload.items.reduce((s, i) => s + (i.subtotal || 0), 0);
      const titulo =
        payload.titulo?.trim() ||
        `Simulação ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
      const validUntil = payload.valid_until
        ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!user) throw new Error("Sessão necessária para salvar simulação.");
      if (role === "parceiro_b2b_tecnico") {
        const { data, error } = await supabase.rpc("b2b_save_technical_simulation" as any, {
          p_payload: { ...payload, titulo, valid_until: validUntil },
        });
        if (error) throw error;
        return data as string;
      }
      const { data: sim, error } = await supabase
        .from("partner_simulations" as any)
        .insert({
          partner_id: payload.partner_id,
          created_by: user.id,
          titulo,
          observacoes: payload.observacoes ?? null,
          cultura: payload.cultura ?? null,
          area_total_ha: payload.area_total_ha ?? null,
          objetivo_tecnico: payload.objetivo_tecnico ?? null,
          status: payload.status ?? "rascunho",
          total_cheio: total,
          valid_until: validUntil,
          cliente_id: payload.cliente_id ?? null,
          cliente_nome_snapshot: payload.cliente_nome_snapshot ?? null,
          propriedade_nome_snapshot: payload.propriedade_nome_snapshot ?? null,
          cliente_cidade_snapshot: payload.cliente_cidade_snapshot ?? null,
          cliente_uf_snapshot: payload.cliente_uf_snapshot ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const simId = (sim as any).id as string;
      if (payload.items.length > 0) {
        const rows = payload.items.map((it) => ({ ...it, simulation_id: simId }));
        const { error: e2 } = await supabase
          .from("partner_simulation_items" as any)
          .insert(rows);
        if (e2) throw e2;
      }
      return simId;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ["partner-simulations", vars.partner_id] });
      toast.success(vars.status === "enviada_gestor" ? "Simulação enviada ao gestor" : "Simulação salva");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar simulação"),
  });
}

export function useSendPartnerSimulationToManager(partnerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        "send_partner_simulation_to_manager_secure" as any,
        { p_simulation_id: id },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-simulations", partnerId] });
      toast.success("Simulação enviada ao gestor");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar simulação"),
  });
}

export function useDeletePartnerSimulation(partnerId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        "archive_partner_simulation_secure" as any,
        { p_simulation_id: id, p_reason: null },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-simulations", partnerId] });
      toast.success("Simulação arquivada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao arquivar simulação"),
  });
}
