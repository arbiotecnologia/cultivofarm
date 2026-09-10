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
  "enviado_aprovacao",
  "aprovado",
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

  if (isNew) {
    return { readOnly: false, canPersist: true, showSave: true, showFinalize: true };
  }

  const finalizada = !!status && status !== "rascunho";
  const travada = !!status && STATUS_TRAVADOS_PERMANENTEMENTE.includes(status);
  const editando = uiMode === "editing";

  // Sem permissão efetiva de edição → somente leitura, mesmo com read no cliente.
  if (canEdit === false && finalizada) {
    return { readOnly: true, canPersist: false, showSave: false, showFinalize: false };
  }

  const canPersist = !travada && (!finalizada || editando);

  return {
    readOnly: !canPersist,
    canPersist,
    showSave: canPersist,
    showFinalize: canPersist && !finalizada,
  };
}
