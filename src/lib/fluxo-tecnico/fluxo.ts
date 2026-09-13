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
export interface ResultadoValidacao {
  ok: boolean;
  erro?: string;
}

export function validarComentarioDecisao(
  tipo: string | null | undefined,
  comentario: string,
): ResultadoValidacao {
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

/** Normalização de busca: ignora caixa, acentos e espaços redundantes. */
export function normalizarBusca(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Busca tolerante a espaços, caixa e acentos. */
export function matchTexto(campos: Array<unknown>, termo: string): boolean {
  const q = normalizarBusca(termo);
  if (!q) return true;
  return campos.some((c) => normalizarBusca(c).includes(q));
}

/** Exibição segura de campos opcionais (cliente/fazenda/número da OS). */
export function textoOuTraco(valor: unknown): string {
  if (typeof valor === "string" && valor.trim().length > 0) return valor;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return "—";
}

/* ------------------------------------------------------------------ *
 * Autorização de decisão (apenas UI — a RLS continua sendo a autoridade)
 * ------------------------------------------------------------------ */

/** Papéis que podem decidir uma recomendação técnica. */
export const PAPEIS_DECISAO = ["administrador", "gestor"] as const;

export function podeDecidirPorPapel(role: string | null | undefined): boolean {
  return (PAPEIS_DECISAO as readonly string[]).includes(role ?? "");
}

/* ------------------------------------------------------------------ *
 * Contrato de banco disponível hoje no CultivoFarm
 * ------------------------------------------------------------------ */

/**
 * Não existe RPC pública e transacional que grave, em uma única transação,
 * `registros_consultor.status` + `aprovacoes_tecnicas` + `status_log`.
 * Enquanto isso, a decisão fica desabilitada para não corromper o fluxo.
 */
export const RPC_APROVACAO_TRANSACIONAL_DISPONIVEL = false;

/**
 * Também não existe RPC idempotente para gerar as OS On-Farm de uma
 * recomendação aprovada. Geração automática fica bloqueada (evita criação
 * parcial e duplicação em retry).
 */
export const RPC_GERACAO_OS_DISPONIVEL = false;

export const MSG_DECISAO_INDISPONIVEL =
  "Aprovação temporariamente indisponível para proteção da integridade";

export const MSG_GERACAO_OS_INDISPONIVEL =
  "Geração automática de Ordens de Serviço temporariamente indisponível para proteção da integridade. A recomendação permanece aprovada e deve ser convertida manualmente.";

/** Só libera a decisão quando papel, status e contrato de banco permitem. */
export function podeDecidir(
  role: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return (
    RPC_APROVACAO_TRANSACIONAL_DISPONIVEL &&
    podeDecidirPorPapel(role) &&
    podeDecidirRegistro(status)
  );
}

/** Mensagem amigável — nunca expõe texto interno do banco/Supabase. */
export function mensagemAmigavel(
  _erro: unknown,
  fallback = "Não foi possível concluir a operação. Tente novamente.",
): string {
  return fallback;
}

/** Próximo status possível da OS, ou null quando não há avanço permitido. */
export function proximoStatusOS(atual: string | null | undefined): string | null {
  if (!atual) return null;
  const i = (OS_FLOW_ORDER as readonly string[]).indexOf(atual);
  if (i < 0 || i >= OS_FLOW_ORDER.length - 1) return null;
  return OS_FLOW_ORDER[i + 1];
}

