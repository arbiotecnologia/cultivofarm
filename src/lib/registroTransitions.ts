/**
 * Fonte única de verdade para transições de status de `registros_consultor`.
 *
 * Espelha exatamente a matriz validada pelo trigger Postgres
 * `validate_registro_status_transition`. Mantenha sincronizado com a função SQL.
 */
import { toast } from "sonner";

export type RegistroStatus =
  | "rascunho"
  | "em_andamento"
  | "finalizado"
  | "enviado_aprovacao"
  | "aprovado"
  | "reprovado"
  | "convertido_os"
  | "arquivado";

export const STATUS_LABEL_REGISTRO: Record<RegistroStatus, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em andamento",
  finalizado: "Finalizado",
  enviado_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  convertido_os: "Convertido em OS",
  arquivado: "Arquivado",
};

/** Ordem canônica para exibir "etapa N de 6" (arquivado é estado terminal lateral). */
export const STATUS_ORDER: RegistroStatus[] = [
  "rascunho",
  "em_andamento",
  "finalizado",
  "enviado_aprovacao",
  "aprovado",
  "convertido_os",
];

/**
 * Matriz de transições permitidas. Espelha o trigger Postgres
 * `validate_registro_status_transition` (H9-E1, forward 20261020000000).
 *
 * - rascunho           → em_andamento (check-in), finalizado, arquivado
 * - em_andamento       → finalizado (check-out), arquivado
 * - finalizado         → enviado_aprovacao, arquivado
 * - enviado_aprovacao  → aprovado, reprovado, rascunho (ajuste), finalizado, arquivado
 * - aprovado           → convertido_os, arquivado, enviado_aprovacao (reabertura admin)
 * - reprovado          → arquivado
 * - convertido_os      → arquivado
 * - arquivado          → (terminal)
 */
const TRANSITIONS: Record<RegistroStatus, RegistroStatus[]> = {
  rascunho: ["em_andamento", "finalizado", "arquivado"],
  em_andamento: ["finalizado", "arquivado"],
  finalizado: ["enviado_aprovacao", "arquivado"],
  enviado_aprovacao: ["aprovado", "reprovado", "rascunho", "finalizado", "arquivado"],
  aprovado: ["convertido_os", "arquivado", "enviado_aprovacao"],
  reprovado: ["arquivado"],
  convertido_os: ["arquivado"],
  arquivado: [],
};

export function canTransition(from: RegistroStatus | string | undefined | null, to: RegistroStatus): boolean {
  if (!from) return false;
  const allowed = TRANSITIONS[from as RegistroStatus];
  if (!allowed) return false;
  return allowed.includes(to);
}

/** Próximo status canônico no fluxo (ignora `arquivado`). */
export function nextRequiredStatus(from: RegistroStatus | string | undefined | null): RegistroStatus | null {
  if (!from) return null;
  const idx = STATUS_ORDER.indexOf(from as RegistroStatus);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

/** Mensagem padronizada para feedback de bloqueio antes de chamar o backend. */
export function getBlockReason(from: RegistroStatus | string | undefined | null, to: RegistroStatus): string {
  if (!from) return "Status atual desconhecido.";
  if (canTransition(from, to)) return "";
  const fromLabel = STATUS_LABEL_REGISTRO[from as RegistroStatus] || from;
  const toLabel = STATUS_LABEL_REGISTRO[to] || to;
  const next = nextRequiredStatus(from);
  if (next && STATUS_ORDER.indexOf(to) > STATUS_ORDER.indexOf(next)) {
    return `Não é possível pular para "${toLabel}". Conclua a etapa "${STATUS_LABEL_REGISTRO[next]}" antes.`;
  }
  if (from === "arquivado") {
    return `Registro arquivado. Não é possível alterar o status.`;
  }
  return `Transição inválida: de "${fromLabel}" para "${toLabel}" não é permitida.`;
}

/**
 * Extrai os status `from`/`to` da exceção lançada pelo trigger Postgres
 * (ex.: `Transição inválida: não é possível mudar de "rascunho" para "aprovado".`).
 */
export function parseBackendTransitionError(msg: string | undefined | null): { from: RegistroStatus; to: RegistroStatus } | null {
  if (!msg) return null;
  const re = /mudar de\s*"([^"]+)"\s*para\s*"([^"]+)"/i;
  const m = msg.match(re);
  if (!m) return null;
  const from = m[1] as RegistroStatus;
  const to = m[2] as RegistroStatus;
  if (!STATUS_LABEL_REGISTRO[from] || !STATUS_LABEL_REGISTRO[to]) return null;
  return { from, to };
}

/** Detecta se a string de erro vem de uma violação de transição/check do backend. */
export function isTransitionBackendError(msg: string | undefined | null): boolean {
  if (!msg) return false;
  return /Transição inválida/i.test(msg) || /check_violation/i.test(msg);
}

/**
 * Toast padronizado para erros de transição vindos do backend.
 * Mostra etapa atual e próxima etapa esperada quando possível.
 */
export function showTransitionErrorToast(err: unknown, fallback?: string) {
  const msg = (err as any)?.message || (typeof err === "string" ? err : "") || fallback || "Transição não permitida";
  const parsed = parseBackendTransitionError(msg);
  if (parsed) {
    const next = nextRequiredStatus(parsed.from);
    const description = next
      ? `Etapa atual: ${STATUS_LABEL_REGISTRO[parsed.from]} • Próxima etapa esperada: ${STATUS_LABEL_REGISTRO[next]}`
      : `Etapa atual: ${STATUS_LABEL_REGISTRO[parsed.from]}`;
    toast.error("Transição não permitida", {
      description,
      duration: 7000,
    });
    return;
  }
  if (isTransitionBackendError(msg)) {
    toast.error("Transição não permitida", { description: msg, duration: 7000 });
    return;
  }
  toast.error(msg);
}
