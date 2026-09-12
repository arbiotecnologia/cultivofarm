/**
 * Helpers puros do Fluxo Técnico (/fluxo-tecnico).
 *
 * Nenhum status, campo ou regra é inventado aqui: os status de OS seguem
 * exatamente a ordem já declarada na página (`OS_TIMELINE_STEPS`) mais
 * `cancelada`, e as decisões de aprovação seguem `aprovacoes_tecnicas`.
 */

/** Ordem canônica do ciclo da OS On-Farm, conforme a página. */
export const OS_FLOW_ORDER = [
  "aberta",
  "aprovada",
  "programada",
  "em_producao",
  "em_cq",
  "envase",
  "pronto_entrega",
  "entregue",
  "finalizada",
] as const;

export type OSFlowStatus = (typeof OS_FLOW_ORDER)[number] | "cancelada";

/** Status a partir dos quais nenhuma transição é permitida. */
export const OS_TERMINAL_STATUS = ["finalizada", "cancelada"] as const;

/**
 * Impede retrocesso e saltos em relação à ordem canônica.
 * `cancelada` é permitida a partir de qualquer status não terminal.
 */
export function canAdvanceOS(
  current: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (!current || !next || current === next) return false;
  if ((OS_TERMINAL_STATUS as readonly string[]).includes(current)) return false;
  if (next === "cancelada") return true;
  const i = (OS_FLOW_ORDER as readonly string[]).indexOf(current);
  const j = (OS_FLOW_ORDER as readonly string[]).indexOf(next);
  if (i < 0 || j < 0) return false;
  return j === i + 1;
}

/** Motivo legível do bloqueio, para mensagem de erro ao usuário. */
export function blockedOSReason(
  current: string | null | undefined,
  next: string | null | undefined,
): string | null {
  if (canAdvanceOS(current, next)) return null;
  if (!current || !next) return "Status da OS indisponível.";
  if (current === next) return "A OS já está nesse status.";
  if ((OS_TERMINAL_STATUS as readonly string[]).includes(current)) {
    return "A OS está encerrada e não aceita novas transições.";
  }
  const i = (OS_FLOW_ORDER as readonly string[]).indexOf(current);
  const j = (OS_FLOW_ORDER as readonly string[]).indexOf(next);
  if (i < 0 || j < 0) return "Transição não reconhecida para esta OS.";
  if (j < i) return "Não é permitido retroceder o status da OS.";
  return "Não é permitido pular etapas do fluxo da OS.";
}

/** Decisões de aprovação que exigem justificativa escrita. */
export const DECISOES_COM_MOTIVO = ["reprovado", "solicitar_ajuste"] as const;

export function requerMotivo(tipo: string | null | undefined): boolean {
  return (DECISOES_COM_MOTIVO as readonly string[]).includes(tipo ?? "");
}

/** Valida o comentário da decisão, sem inventar limites de negócio. */
export function validarComentarioDecisao(
  tipo: string | null | undefined,
  comentario: string,
): { ok: true } | { ok: false; erro: string } {
  if (!requerMotivo(tipo)) return { ok: true };
  if ((comentario ?? "").trim().length === 0) {
    return { ok: false, erro: "Informe o motivo para esta decisão." };
  }
  return { ok: true };
}

/** Fila de aprovação só aceita registros ainda aguardando decisão. */
export function podeDecidirRegistro(status: string | null | undefined): boolean {
  return status === "enviado_aprovacao";
}

/** Busca tolerante a espaços, aplicada a qualquer conjunto de campos textuais. */
export function matchTexto(campos: Array<unknown>, termo: string): boolean {
  const q = (termo ?? "").trim().toLowerCase();
  if (!q) return true;
  return campos.some(
    (c) => typeof c === "string" && c.toLowerCase().includes(q),
  );
}

/** Exibição segura de campos opcionais (cliente/fazenda/número da OS). */
export function textoOuTraco(valor: unknown): string {
  if (typeof valor === "string" && valor.trim().length > 0) return valor;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return "—";
}
