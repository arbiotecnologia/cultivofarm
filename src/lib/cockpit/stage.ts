/**
 * Cockpit Laboratório — estágio canônico da esteira.
 *
 * Espelho EXATO de `public.fn_cockpit_stage(text)` no banco. O banco é a fonte
 * única de verdade; este módulo existe apenas para rotular a UI sem um
 * round-trip por linha. Qualquer mudança aqui exige a mesma mudança na função
 * SQL (há teste de paridade em src/test/cockpit/stage.test.ts).
 *
 * Diferente do mapeamento anterior (que agrupava "entregue", "em_entrega" e
 * "estoque_reservado" na mesma coluna), cada situação tem estágio próprio —
 * a ambiguidade permitia liberar a ação errada.
 */
export const COCKPIT_STAGES = [
  "aguardando",
  "programada",
  "em_producao",
  "aguardando_cq",
  "cq_reprovado",
  "cq_aprovado",
  "em_envase",
  "estoque_disponivel",
  "estoque_reservado",
  "em_entrega",
  "entregue",
  "finalizada",
  "cancelada",
] as const;

export type CockpitStage = (typeof COCKPIT_STAGES)[number];

/** Mapa status oficial da esteira -> estágio canônico (idêntico ao SQL). */
export const STAGE_BY_STATUS: Record<string, CockpitStage> = {
  cancelada: "cancelada",
  cancelado: "cancelada",
  finalizada: "finalizada",
  finalizado: "finalizada",
  entregue: "entregue",
  aplicado: "entregue",
  em_entrega: "em_entrega",
  estoque_reservado: "estoque_reservado",
  estoque_gerado: "estoque_disponivel",
  pronto_entrega: "estoque_disponivel",
  envase: "em_envase",
  em_envase: "em_envase",
  cq_reprovado: "cq_reprovado",
  reprovado: "cq_reprovado",
  cq_aprovado: "cq_aprovado",
  aprovado_cq: "cq_aprovado",
  aguardando_cq: "aguardando_cq",
  em_cq: "aguardando_cq",
  em_producao: "em_producao",
  programada: "programada",
};

export function cockpitStage(statusOficial?: string | null): CockpitStage {
  return STAGE_BY_STATUS[String(statusOficial ?? "").toLowerCase()] ?? "aguardando";
}

/** Estágios em que a esteira está bloqueada e nenhuma ação de avanço é válida. */
export const STAGES_TERMINAIS: readonly CockpitStage[] = ["finalizada", "cancelada"];

export function isStageTerminal(stage: CockpitStage): boolean {
  return STAGES_TERMINAIS.includes(stage);
}

/** Coluna do Kanban em que o estágio canônico é exibido. */
export const STAGE_COLUMN: Record<CockpitStage, string> = {
  aguardando: "aguardando",
  programada: "aguardando",
  em_producao: "em_producao",
  aguardando_cq: "aguardando_cq",
  cq_reprovado: "aguardando_cq",
  cq_aprovado: "aprovado_cq",
  em_envase: "envase",
  estoque_disponivel: "estoque_reserva",
  estoque_reservado: "estoque_reserva",
  em_entrega: "entrega",
  entregue: "entrega",
  finalizada: "entrega",
  cancelada: "entrega",
};
