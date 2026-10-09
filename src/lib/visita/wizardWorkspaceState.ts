/**
 * Estado autoritativo do wizard de visita técnica.
 *
 * Regra fundamental: NUNCA afirmar "visita concluída / somente leitura" apenas
 * porque o workspace está ausente. Ausência de workspace pode significar
 * carregamento, erro de rede/servidor (ex.: 42703) ou permissão negada — todos
 * estados distintos de "concluída".
 */

export type VisitaWizardState =
  | "novo"
  | "carregando"
  | "erro"
  | "permissao_negada"
  | "editavel"
  | "somente_leitura";

export interface DeriveWizardStateInput {
  isNew: boolean;
  loading: boolean;
  error?: unknown;
  workspace?: {
    status?: string | null;
    permissions?: { can_edit?: boolean; is_editable_status?: boolean } | null;
  } | null;
}

export interface VisitaWizardStateResult {
  state: VisitaWizardState;
  /** Edição bloqueada (fail-closed em qualquer estado não editável). */
  locked: boolean;
  /** Mensagem de banner; null quando não há banner a exibir. */
  message: string | null;
  /** Se true, a UI deve oferecer o botão "Tentar novamente". */
  canRetry: boolean;
}

function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === "42501") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /forbidden_visita|permission denied|unauthenticated/i.test(msg);
}

export function deriveVisitaWizardState(
  input: DeriveWizardStateInput,
): VisitaWizardStateResult {
  const { isNew, loading, error, workspace } = input;

  if (isNew) {
    return { state: "novo", locked: false, message: null, canRetry: false };
  }

  if (loading) {
    return {
      state: "carregando",
      locked: true,
      message: "Carregando atendimento…",
      canRetry: false,
    };
  }

  if (error) {
    if (isPermissionDenied(error)) {
      return {
        state: "permissao_negada",
        locked: true,
        message: "Você não tem permissão para acessar este atendimento.",
        canRetry: false,
      };
    }
    return {
      state: "erro",
      locked: true,
      message: "Não foi possível carregar o atendimento",
      canRetry: true,
    };
  }

  if (!workspace) {
    // Sem erro, sem loading e sem dados: tratar como falha de carregamento.
    return {
      state: "erro",
      locked: true,
      message: "Não foi possível carregar o atendimento",
      canRetry: true,
    };
  }

  const perms = workspace.permissions ?? {};
  if (perms.can_edit === true && ["rascunho", "em_andamento"].includes(workspace.status ?? "")) {
    return { state: "editavel", locked: false, message: null, canRetry: false };
  }

  if (perms.is_editable_status === false || ["finalizado", "enviado_aprovacao", "aprovado", "reprovado", "convertido_os", "arquivado"].includes(workspace.status ?? "")) {
    return {
      state: "somente_leitura",
      locked: true,
      message: workspace.status === "reprovado" ? "Visita reprovada. Modo somente leitura." : "Visita concluída. Modo somente leitura.",
      canRetry: false,
    };
  }

  // Status ainda editável, mas o usuário não pode editar.
  return {
    state: "permissao_negada",
    locked: true,
    message: "Você não tem permissão para editar este atendimento.",
    canRetry: false,
  };
}
