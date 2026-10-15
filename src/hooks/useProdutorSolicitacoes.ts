import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { supabase } from "@/integrations/supabase/client";

export interface ProdutorPedidoResumo {
  id: string;
  numero: string;
  status: string;
  total: number;
  created_at: string;
  requested_delivery_date: string | null;
  estimated_delivery_date: string | null;
  partner_id: string;
  partner_nome: string | null;
}

export interface ProdutorSimulacaoResumo {
  id: string;
  status: string;
  titulo: string | null;
  total_cheio: number;
  created_at: string;
  partner_id: string;
  partner_nome: string | null;
  converted_order_id: string | null;
}


export function useProdutorPedidos(clienteId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["produtor-pedidos", clienteId],
    enabled: !!clienteId,
    queryFn: async (signal): Promise<ProdutorPedidoResumo[]> => {
      if (!clienteId) throw new Error("portal_context_unavailable");
      const { data, error } = await (supabase as any).rpc(
        "get_portal_cliente_b2b_orders_secure",
        { p_cliente_id: clienteId },
      ).abortSignal(signal);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        numero: r.numero,
        status: r.status,
        total: Number(r.total ?? 0),
        created_at: r.created_at,
        requested_delivery_date: r.requested_delivery_date,
        estimated_delivery_date: r.estimated_delivery_date,
        partner_id: r.partner_id,
        partner_nome: r.partner_nome ?? null,
      }));
    },
  });
}

export function useProdutorSimulacoes(clienteId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["produtor-simulacoes", clienteId],
    enabled: !!clienteId,
    queryFn: async (signal): Promise<ProdutorSimulacaoResumo[]> => {
      if (!clienteId) throw new Error("portal_context_unavailable");
      const { data, error } = await (supabase as any).rpc(
        "get_portal_cliente_b2b_simulations_secure",
        { p_cliente_id: clienteId },
      ).abortSignal(signal);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        status: r.status,
        titulo: r.titulo,
        total_cheio: Number(r.total_cheio ?? 0),
        created_at: r.created_at,
        partner_id: r.partner_id,
        partner_nome: r.partner_nome ?? null,
        converted_order_id: r.converted_order_id ?? null,
      }));

    },
  });
}

export function useComercialSimulacoesAll() {
  return useScopedPortalQuery({
    queryKey: ["comercial-simulacoes-all"],
    queryFn: async (signal): Promise<
      (ProdutorSimulacaoResumo & {
        cliente_id: string | null;
        cliente_nome: string | null;
        created_by: string | null;
        responsavel_nome: string | null;
      })[]
    > => {
      const { data, error } = await supabase
        .from("partner_simulations" as any)
        .select(
          "id, status, titulo, total_cheio, created_at, partner_id, cliente_id, cliente_nome_snapshot, converted_order_id, created_by, partner_accounts:partner_id(razao_social, nome_fantasia), clientes:cliente_id(razao_social, nome)",
        )
        .order("created_at", { ascending: false })
        .limit(500).abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const userIds = Array.from(
        new Set(rows.map((r) => r.created_by).filter(Boolean)),
      );
      const profs = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, nome_completo, email")
            .in("user_id", userIds).abortSignal(signal)
        : ({ data: [] } as any);
      const profMap = new Map<string, any>(
        ((profs as any).data ?? []).map((p: any) => [p.user_id, p]),
      );
      return rows.map((r: any) => ({
        id: r.id,
        status: r.status,
        titulo: r.titulo,
        total_cheio: Number(r.total_cheio ?? 0),
        created_at: r.created_at,
        partner_id: r.partner_id,
        partner_nome:
          r.partner_accounts?.nome_fantasia ?? r.partner_accounts?.razao_social ?? null,
        converted_order_id: r.converted_order_id ?? null,
        cliente_id: r.cliente_id ?? null,
        cliente_nome:
          r.clientes?.razao_social ?? r.clientes?.nome ?? r.cliente_nome_snapshot ?? null,
        created_by: r.created_by ?? null,
        responsavel_nome:
          profMap.get(r.created_by)?.nome_completo ??
          profMap.get(r.created_by)?.email ??
          null,
      }));


    },
  });
}

export function usePartnerSimulationsWithClient(partnerId: string | null | undefined) {
  return useScopedPortalQuery({
    queryKey: ["partner-simulations-with-client", partnerId],
    enabled: !!partnerId,
    queryFn: async (signal) => {
      const { data, error } = await supabase
        .from("partner_simulations" as any)
        .select(
          "id, status, titulo, total_cheio, created_at, cliente_id, cliente_nome_snapshot, created_by, converted_order_id, clientes:cliente_id(razao_social, nome)",
        )
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false }).abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as any[];

      const userIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean)));
      const orderIds = Array.from(
        new Set(rows.map((r) => r.converted_order_id).filter(Boolean)),
      );

      const [profs, ords] = await Promise.all([
        userIds.length
          ? supabase
              .from("profiles")
              .select("user_id, nome_completo, email")
              .in("user_id", userIds).abortSignal(signal)
          : Promise.resolve({ data: [] as any[] } as any),
        orderIds.length
          ? supabase.from("partner_orders").select("id, numero").in("id", orderIds).abortSignal(signal)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const profMap = new Map<string, any>(
        ((profs as any).data ?? []).map((p: any) => [p.user_id, p]),
      );
      const ordMap = new Map<string, any>(
        ((ords as any).data ?? []).map((o: any) => [o.id, o]),
      );

      return rows.map((r: any) => ({
        id: r.id as string,
        status: r.status as string,
        titulo: r.titulo as string | null,
        total_cheio: Number(r.total_cheio ?? 0),
        created_at: r.created_at as string,
        cliente_id: r.cliente_id as string | null,
        cliente_nome:
          r.clientes?.razao_social ?? r.clientes?.nome ?? r.cliente_nome_snapshot ?? null,
        created_by: r.created_by as string | null,
        responsavel_nome:
          profMap.get(r.created_by)?.nome_completo ??
          profMap.get(r.created_by)?.email ??
          null,
        converted_order_id: r.converted_order_id as string | null,
        converted_order_numero: ordMap.get(r.converted_order_id)?.numero ?? null,
      }));
    },
  });
}
