import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SlaConfigMap, SlaFase } from "@/lib/b2bSla";

export type SlaConfigRow = {
  id: string;
  fase: SlaFase;
  prazo_horas: number;
  ativo: boolean;
  updated_at: string;
};

export function useB2BSlaConfig() {
  return useQuery({
    queryKey: ["b2b-sla-config"],
    staleTime: 60_000,
    queryFn: async (): Promise<SlaConfigRow[]> => {
      const { data, error } = await supabase
        .from("partner_order_sla_config" as any)
        .select("id, fase, prazo_horas, ativo, updated_at")
        .order("fase");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useB2BSlaConfigMap() {
  const q = useB2BSlaConfig();
  const map: SlaConfigMap = {};
  for (const r of q.data ?? []) map[r.fase] = { prazo_horas: r.prazo_horas, ativo: r.ativo };
  return { ...q, map };
}

/** Limites de SLA aceitos (em horas): 1h a 30 dias). */
export const SLA_MIN_HORAS = 1;
export const SLA_MAX_HORAS = 24 * 30;

export function validateSlaPrazo(prazo: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(prazo);
  if (!Number.isFinite(n)) return { ok: false, error: "Prazo deve ser um número." };
  if (!Number.isInteger(n)) return { ok: false, error: "Prazo deve ser um número inteiro de horas." };
  if (n < SLA_MIN_HORAS) return { ok: false, error: `Prazo mínimo é ${SLA_MIN_HORAS}h.` };
  if (n > SLA_MAX_HORAS) return { ok: false, error: `Prazo máximo é ${SLA_MAX_HORAS}h (30 dias).` };
  return { ok: true, value: n };
}

export function useUpdateSlaConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; prazo_horas?: number; ativo?: boolean }) => {
      const patch: any = {};
      if (v.prazo_horas !== undefined) {
        const r = validateSlaPrazo(v.prazo_horas);
        if (r.ok === false) throw new Error(r.error);
        patch.prazo_horas = r.value;
      }
      if (v.ativo !== undefined) patch.ativo = !!v.ativo;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from("partner_order_sla_config" as any).update(patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SLA atualizado");
      qc.invalidateQueries({ queryKey: ["b2b-sla-config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });
}

