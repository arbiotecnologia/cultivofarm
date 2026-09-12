import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ---------- KPIs ----------
export function useCommercialKpis(params: {
  from?: string; to?: string; partner_id?: string; consultor?: string; region?: string;
} = {}) {
  return useQuery({
    queryKey: ["commercial-kpis", params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_commercial_kpis" as any, {
        p_from: params.from ?? null,
        p_to: params.to ?? null,
        p_partner_id: params.partner_id ?? null,
        p_consultor: params.consultor ?? null,
        p_region: params.region ?? null,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

// ---------- Histórico ----------
export function usePartnerCommercialHistory(partnerId: string | null | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ["partner-history", partnerId, from, to],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_partner_commercial_history" as any, {
        p_partner_id: partnerId!,
        p_from: from ?? null,
        p_to: to ?? null,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

// ---------- Dashboard parceiro ----------
export function usePartnerDashboardPremium(partnerId?: string | null) {
  return useQuery({
    queryKey: ["partner-dashboard", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_partner_dashboard" as any, {
        p_partner_id: partnerId ?? null,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

// ---------- Alertas comerciais ----------
export function useCommercialAlerts() {
  return useQuery({
    queryKey: ["commercial-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_commercial_alerts" as any);
      if (error) throw error;
      return data as any;
    },
  });
}

// ---------- Campanhas ----------
export type CampaignPublico = "b2b" | "comercial" | "ambos";

export interface CommercialCampaign {
  id: string;
  nome: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  ativa: boolean;
  tipo_publico: CampaignPublico;
  created_at: string;
}

// ---------- Vínculos da campanha ----------
export function useCampaignPartners(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: ["campaign-partners", campaignId],
    enabled: !!campaignId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("commercial_campaign_partners" as any)
        .select("partner_id")
        .eq("campaign_id", campaignId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.partner_id);
    },
  });
}

export function useSetCampaignPartners() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaign_id: string; partner_ids: string[] }) => {
      const del = await supabase.from("commercial_campaign_partners" as any).delete().eq("campaign_id", p.campaign_id);
      if (del.error) throw del.error;
      if (p.partner_ids.length) {
        const rows = p.partner_ids.map((pid) => ({ campaign_id: p.campaign_id, partner_id: pid }));
        const ins = await supabase.from("commercial_campaign_partners" as any).insert(rows as any);
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["campaign-partners", v.campaign_id] });
      toast.success("Parceiros vinculados");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao vincular parceiros"),
  });
}

export function useCampaignClientes(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: ["campaign-clientes", campaignId],
    enabled: !!campaignId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("commercial_campaign_clientes" as any)
        .select("cliente_id")
        .eq("campaign_id", campaignId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.cliente_id);
    },
  });
}

export function useSetCampaignClientes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campaign_id: string; cliente_ids: string[] }) => {
      const del = await supabase.from("commercial_campaign_clientes" as any).delete().eq("campaign_id", p.campaign_id);
      if (del.error) throw del.error;
      if (p.cliente_ids.length) {
        const rows = p.cliente_ids.map((cid) => ({ campaign_id: p.campaign_id, cliente_id: cid }));
        const ins = await supabase.from("commercial_campaign_clientes" as any).insert(rows as any);
        if (ins.error) throw ins.error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["campaign-clientes", v.campaign_id] });
      toast.success("Clientes vinculados");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao vincular clientes"),
  });
}

export function useCommercialCampaigns() {
  return useQuery({
    queryKey: ["commercial-campaigns"],
    queryFn: async (): Promise<CommercialCampaign[]> => {
      const { data, error } = await supabase
        .from("commercial_campaigns" as any)
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useSaveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CommercialCampaign> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase.from("commercial_campaigns" as any).update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("commercial_campaigns" as any).insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercial-campaigns"] });
      toast.success("Campanha salva");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commercial_campaigns" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercial-campaigns"] });
      toast.success("Campanha removida");
    },
  });
}

// ---------- Templates / Favoritos ----------
export interface OrderTemplate {
  id: string;
  partner_id: string;
  nome: string;
  descricao: string | null;
  itens: any[];
  favorito: boolean;
  created_at: string;
}

export function usePartnerOrderTemplates(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: ["partner-order-templates", partnerId],
    enabled: !!partnerId,
    queryFn: async (): Promise<OrderTemplate[]> => {
      const { data, error } = await supabase
        .from("partner_order_templates" as any)
        .select("*")
        .eq("partner_id", partnerId!)
        .order("favorito", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useSaveOrderTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id?: string; partner_id: string; nome: string; descricao?: string; itens: any[]; favorito?: boolean }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase.from("partner_order_templates" as any).update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_order_templates" as any).insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["partner-order-templates", v.partner_id] });
      toast.success("Modelo salvo");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar modelo"),
  });
}

export function useDeleteOrderTemplate(partnerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_order_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-order-templates", partnerId] });
      toast.success("Modelo removido");
    },
  });
}

// ---------- Mensagens ----------
export interface OrderMessage {
  id: string;
  order_id: string;
  autor_id: string | null;
  autor_tipo: "parceiro" | "comercial" | "admin";
  mensagem: string;
  created_at: string;
}

export function useOrderMessages(orderId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["order-messages", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderMessage[]> => {
      const { data, error } = await supabase
        .from("partner_order_messages" as any)
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-messages-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_order_messages", filter: `order_id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ["order-messages", orderId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_order_message_attachments" },
        () => qc.invalidateQueries({ queryKey: ["order-message-attachments"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, qc]);

  return query;
}

export function useSendOrderMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { order_id: string; mensagem: string; autor_tipo: "parceiro" | "comercial" | "admin" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("partner_order_messages" as any).insert({
        order_id: payload.order_id,
        mensagem: payload.mensagem,
        autor_tipo: payload.autor_tipo,
        autor_id: u.user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["order-messages", v.order_id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar mensagem"),
  });
}

// ---------- Message status ----------
export function useSetMessageStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; status: "nao_lida" | "lida" | "respondida" | "encerrada"; order_id: string }) => {
      const { error } = await supabase.rpc("rpc_message_set_status" as any, { p_id: p.id, p_status: p.status });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["order-messages", v.order_id] }),
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar status"),
  });
}

export function useMessageCounters(partnerId?: string | null) {
  return useQuery({
    queryKey: ["msg-counters", partnerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_partner_message_counters" as any, {
        p_partner_id: partnerId ?? null,
      });
      if (error) throw error;
      return data as { nao_lidas: number; pendentes: number; respondidas: number; encerradas: number };
    },
  });
}

// ---------- Attachments ----------
export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export function useMessageAttachments(messageId: string | null | undefined) {
  return useQuery({
    queryKey: ["msg-attachments", messageId],
    enabled: !!messageId,
    queryFn: async (): Promise<MessageAttachment[]> => {
      const { data, error } = await supabase
        .from("partner_order_message_attachments" as any)
        .select("*")
        .eq("message_id", messageId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useUploadMessageAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { message_id: string; order_id: string; file: File }) => {
      const { data: u } = await supabase.auth.getUser();
      const path = `${p.order_id}/${p.message_id}/${Date.now()}-${p.file.name}`;
      const up = await supabase.storage.from("order-attachments").upload(path, p.file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("partner_order_message_attachments" as any).insert({
        message_id: p.message_id,
        file_name: p.file.name,
        file_path: path,
        mime_type: p.file.type,
        size_bytes: p.file.size,
        uploaded_by: u.user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["msg-attachments", v.message_id] });
      toast.success("Anexo enviado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar anexo"),
  });
}

export async function getAttachmentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("order-attachments").createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---------- Dashboard consolidado ----------
export function useConsolidatedDashboard(filters: {
  from?: string; to?: string; partner_id?: string; consultor?: string; region?: string; partner_type?: string;
} = {}) {
  return useQuery({
    queryKey: ["commercial-consolidated", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_commercial_consolidated_dashboard" as any, {
        p_from: filters.from ?? null,
        p_to: filters.to ?? null,
        p_partner_id: filters.partner_id ?? null,
        p_consultor: filters.consultor ?? null,
        p_region: filters.region ?? null,
        p_partner_type: filters.partner_type ?? null,
      });
      if (error) throw error;
      return data as any;
    },
  });
}
