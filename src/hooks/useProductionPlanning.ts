import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { b2bToast } from "@/lib/b2bToast";
import { resumirPlanejamento, type ResumoProducao } from "@/lib/dashboard-producao/producao";
import {
  gerarChaveIdempotencia,
  mensagemPublicacao,
  mensagemSucessoPublicacao,
} from "@/lib/planejamento-producao/planejamento";



export type PlanningRow = {
  id: string;
  partner_order_id: string;
  partner_id: string;
  status: string;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  created_at: string;
  updated_at: string;
  partner_nome?: string | null;
  order_numero?: string | null;
  order_total?: number | null;
  order_requested_date?: string | null;
  order_estimated_date?: string | null;
  order_approved_at?: string | null;
};

export function useProductionPlanning(statusFilter?: string) {
  return useQuery({
    queryKey: ["production-planning", statusFilter ?? "all"],
    queryFn: async (): Promise<PlanningRow[]> => {
      let q = (supabase as any)
        .from("production_planning")
        .select(
          `id, partner_order_id, partner_id, status, planned_start_date, planned_finish_date, created_at, updated_at,
           partner_accounts ( nome_fantasia, razao_social ),
           partner_orders ( numero, total, requested_delivery_date, estimated_delivery_date, approved_at )`
        )
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        partner_order_id: r.partner_order_id,
        partner_id: r.partner_id,
        status: r.status,
        planned_start_date: r.planned_start_date,
        planned_finish_date: r.planned_finish_date,
        created_at: r.created_at,
        updated_at: r.updated_at,
        partner_nome: r.partner_accounts?.nome_fantasia ?? r.partner_accounts?.razao_social ?? null,
        order_numero: r.partner_orders?.numero ?? null,
        order_total: r.partner_orders?.total ?? null,
        order_requested_date: r.partner_orders?.requested_delivery_date ?? null,
        order_estimated_date: r.partner_orders?.estimated_delivery_date ?? null,
        order_approved_at: r.partner_orders?.approved_at ?? null,
      }));
    },
  });
}

export function useProductionPlanningDetail(planningId: string | null) {
  return useQuery({
    queryKey: ["production-planning-detail", planningId],
    enabled: !!planningId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_production_planning_detail" as any, {
        p_planning_id: planningId,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

export function useUpdatePlanningDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; planned_start_date: string | null; planned_finish_date: string | null; production_notes?: string | null }) => {
      const { error } = await (supabase as any)
        .from("production_planning")
        .update({
          planned_start_date: vars.planned_start_date,
          planned_finish_date: vars.planned_finish_date,
          ...(vars.production_notes !== undefined ? { production_notes: vars.production_notes } : {}),
        } as any)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success("Planejamento atualizado");
      qc.invalidateQueries({ queryKey: ["production-planning"] });
      qc.invalidateQueries({ queryKey: ["production-planning-detail", vars.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });
}

type PublicacaoResultado = { ok: boolean; planning_id: string; os_created: number; replay?: boolean };

export function useGenerateProductionOrders() {
  const qc = useQueryClient();
  const access = useStorageAccessScope("production-publication");
  const pending = useRef<object | null>(null);
  const receipts = useRef(new WeakMap<PublicacaoResultado, () => boolean>());
  return useMutation({
    retry: false,
    mutationFn: async (vars: {
      partner_order_id: string;
      planning_id: string;
      numero?: string;
      idempotency_key?: string;
    }) => {
      const current = access.capture();
      if (!current()) throw new Error("Contexto indisponível para publicar.");
      if (pending.current) throw new Error("Publicação já em andamento; aguarde a resposta existente.");
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuid.test(vars.planning_id) || !uuid.test(vars.partner_order_id)) throw new Error("Identificação do planejamento inválida.");
      const ticket = {}; pending.current = ticket;
      const chave = vars.idempotency_key ?? gerarChaveIdempotencia(vars.planning_id);

      const executar = async (): Promise<PublicacaoResultado> => {
        // Caminho canônico: RPC atômica e idempotente (H10).
        const { data, error } = await (supabase as any).rpc("rpc_planejamento_publicar_v1" as any, {
          p_planning_id: vars.planning_id,
          p_idempotency_key: chave,
        });
        if (!current()) throw new Error("Contexto alterado; resultado não adotado. Não repita a publicação sem revisão.");
        if (error) throw new Error(mensagemPublicacao(error));
        // A RPC atual está instalada; ausência/erro nunca abre o legado service-only.
        if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true ||
          data.planning_id !== vars.planning_id || !Number.isSafeInteger(data.os_created) || data.os_created < 0 ||
          (data.replay !== undefined && typeof data.replay !== "boolean")) {
          throw new Error("Resposta de publicação não confirmada; revise sem repetir automaticamente.");
        }
        const result = data as PublicacaoResultado;
        receipts.current.set(result, current);
        return result;
      };

      try { return await b2bToast.promise(executar(), {
        action: "generate-op",
        orderNumero: vars.numero ?? vars.planning_id,
        loading: "Publicando demanda no laboratório…",
        success: (r) => mensagemSucessoPublicacao(r),
        errorFallback: "Falha ao publicar demanda no laboratório",
      }); } finally { if (pending.current === ticket) pending.current = null; }
    },
    onSuccess: (result) => {
      if (receipts.current.get(result)?.() !== true) return;
      qc.invalidateQueries({ queryKey: ["production-planning"] });
      qc.invalidateQueries({ queryKey: ["production-planning-detail"] });
      qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
    },
  });
}

export function useRequestReplanning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { os_id: string; motivo: string; numero?: string }) => {
      const promise = Promise.resolve(
        (supabase as any).rpc("lab_request_replanning" as any, { p_os_id: vars.os_id, p_motivo: vars.motivo }),
      ).then(({ data, error }) => {
        if (error) throw error;
        return data as { ok: boolean; planning_id: string };
      });

      return b2bToast.promise(promise, {
        action: "generic",
        orderNumero: vars.numero ?? vars.os_id,
        loading: "Solicitando replanejamento…",
        success: "Pedido devolvido ao planejamento",
        errorFallback: "Falha ao solicitar replanejamento",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-planning"] });
      qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
    },
  });
}


export function useProductionDashboard() {
  return useQuery({
    queryKey: ["production-dashboard"],
    queryFn: async (): Promise<ResumoProducao> => {
      const { data, error } = await (supabase as any)
        .from("production_planning")
        .select("status, partner_order_id, partner_orders ( total )");
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((r) => ({
        partner_order_id: r?.partner_order_id ?? null,
        status: r?.status ?? null,
        total: r?.partner_orders?.total ?? null,
      }));
      return resumirPlanejamento(rows);
    },
    staleTime: 30_000,
  });
}


export function useB2BCapacityKpis() {
  return useQuery({
    queryKey: ["b2b-capacity-kpis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rpc_b2b_capacity_kpis" as any);
      if (error) throw error;
      return data as Record<string, number>;
    },
    staleTime: 30_000,
  });
}

export function useB2BIntegrityCheck(enabled = false) {
  return useQuery({
    queryKey: ["b2b-integrity-check"],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("rpc_b2b_integrity_check" as any);
      if (error) throw error;
      return data as Record<string, number>;
    },
    staleTime: 60_000,
  });
}
