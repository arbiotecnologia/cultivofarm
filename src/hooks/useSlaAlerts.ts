import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SlaConfig {
  etapa: string;
  prazo_horas: number;
  ativo: boolean;
}

export type SlaStatus = "ok" | "atencao" | "atrasado";

/**
 * Carrega as configurações de SLA do banco (atribuição, check-in, recomendação).
 * Cache de 5 minutos para evitar requisições repetidas.
 */
export function useSlaConfig() {
  return useQuery({
    queryKey: ["sla-config"],
    queryFn: async (): Promise<Record<string, SlaConfig>> => {
      const { data } = await supabase
        .from("sla_configuracoes" as any)
        .select("etapa, prazo_horas, ativo")
        .eq("ativo", true);
      const map: Record<string, SlaConfig> = {};
      (data || []).forEach((c: any) => {
        map[c.etapa] = c as SlaConfig;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Calcula o status de SLA para uma data de início e prazo.
 * - ok: dentro do prazo
 * - atencao: passou de 75% do prazo
 * - atrasado: ultrapassou o prazo
 */
export function calcularStatusSla(
  inicio: string | null | undefined,
  prazoHoras: number,
  fim?: string | null
): { status: SlaStatus; horasDecorridas: number; horasRestantes: number } {
  if (!inicio) return { status: "ok", horasDecorridas: 0, horasRestantes: prazoHoras };
  const inicioMs = new Date(inicio).getTime();
  const fimMs = fim ? new Date(fim).getTime() : Date.now();
  const horasDecorridas = (fimMs - inicioMs) / (1000 * 60 * 60);
  const horasRestantes = prazoHoras - horasDecorridas;

  let status: SlaStatus = "ok";
  if (horasDecorridas >= prazoHoras) status = "atrasado";
  else if (horasDecorridas >= prazoHoras * 0.75) status = "atencao";

  return { status, horasDecorridas, horasRestantes };
}

export function slaBadgeClass(status: SlaStatus): string {
  switch (status) {
    case "atrasado":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "atencao":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    default:
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  }
}

export function slaLabel(status: SlaStatus, horasRestantes: number): string {
  if (status === "atrasado") {
    const atraso = Math.abs(horasRestantes);
    if (atraso < 24) return `Atrasado ${Math.round(atraso)}h`;
    return `Atrasado ${Math.round(atraso / 24)}d`;
  }
  if (status === "atencao") return `Restam ${Math.round(horasRestantes)}h`;
  if (horasRestantes < 24) return `${Math.round(horasRestantes)}h restantes`;
  return `${Math.round(horasRestantes / 24)}d restantes`;
}
