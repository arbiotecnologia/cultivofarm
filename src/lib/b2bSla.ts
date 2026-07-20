export type SlaFase = "planejamento" | "em_producao" | "produzido" | "cq" | "envase" | "entrega";

export type SlaConfigMap = Partial<Record<SlaFase, { prazo_horas: number; ativo: boolean }>>;

export const FASE_LABEL: Record<SlaFase, string> = {
  planejamento: "Planejamento",
  em_producao: "Em produção",
  produzido: "Produzido",
  cq: "Controle de qualidade",
  envase: "Envase",
  entrega: "Entrega",
};

/** Map planning.status → fase monitorada (null = sem SLA ativo). */
export function planningStatusToFase(planningStatus: string | null | undefined): SlaFase | null {
  switch (planningStatus) {
    case "aguardando_planejamento":
    case "planejado":
      return "planejamento";
    case "em_producao":
      return "em_producao";
    case "produzido":
      return "entrega";
    default:
      return null; // entregue / cancelado / sem planning
  }
}

export type SlaBadgeInfo = {
  fase: SlaFase;
  prazo: number;
  horasDecorridas: number;
  atrasada: boolean;
  proximoEstouro: boolean; // > 80% do prazo
};

export function computeSlaBadge(
  planningStatus: string | null | undefined,
  faseInicio: string | Date | null | undefined,
  config: SlaConfigMap,
): SlaBadgeInfo | null {
  const fase = planningStatusToFase(planningStatus);
  if (!fase) return null;
  const cfg = config[fase];
  if (!cfg || !cfg.ativo) return null;
  const inicio = faseInicio ? new Date(faseInicio).getTime() : Date.now();
  const horas = (Date.now() - inicio) / 3_600_000;
  return {
    fase,
    prazo: cfg.prazo_horas,
    horasDecorridas: horas,
    atrasada: horas > cfg.prazo_horas,
    proximoEstouro: horas > cfg.prazo_horas * 0.8 && horas <= cfg.prazo_horas,
  };
}
