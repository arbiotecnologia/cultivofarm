/**
 * H9-G Bloco 2F — Fonte canônica das ações de persistência da visita técnica.
 *
 * Regra: nenhuma superfície (barra superior, barra inferior mobile, cartões)
 * pode oferecer ação de salvar/finalizar quando a visita está somente leitura.
 * Usuário com acesso apenas de leitura ao cliente NUNCA recebe ação ativa —
 * a RLS continua sendo a autoridade final; aqui evitamos o clique no-op.
 */

export type VisitaUiMode = "locked" | "editing";

/** Status pós-aprovação: travados permanentemente, nem edição justificada. */
export const STATUS_TRAVADOS_PERMANENTEMENTE: readonly string[] = [
  "finalizado",
  "enviado_aprovacao",
  "aprovado",
  "reprovado",
  "convertido_os",
  "arquivado",
];

export interface VisitaAcoesInput {
  isNew: boolean;
  status?: string | null;
  uiMode: VisitaUiMode;
  /** Permissão efetiva de edição (autor/responsável/admin/gestor). */
  canEdit?: boolean;
}

export interface VisitaAcoes {
  /** Somente leitura: nenhuma ação de mutação deve ser oferecida. */
  readOnly: boolean;
  /** Pode persistir alterações agora. */
  canPersist: boolean;
  /** Exibir ação de salvar (canônica). */
  showSave: boolean;
  /** Exibir ação de finalizar. */
  showFinalize: boolean;
}

export function resolveVisitaAcoes(input: VisitaAcoesInput): VisitaAcoes {
  const { isNew, status, uiMode, canEdit } = input;

  // Visita ainda não persistida: só existe a ação de salvar. Finalizar depende
  // de um registro no servidor (check-in, evidências e status não existem
  // antes disso), então a ação não é oferecida.
  const canPersist = canEdit !== false && (isNew ||
    (canEdit === true && (status === "rascunho" || status === "em_andamento") && uiMode === "editing"));

  return {
    readOnly: !canPersist,
    canPersist,
    showSave: canPersist,
    showFinalize: canPersist && !isNew,
  };
}
