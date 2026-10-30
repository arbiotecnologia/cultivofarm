// Client contract for the reviewed envase writer (rpc_cockpit_registrar_envase_v1, stock/envase v2 candidate).
// Preparation only: LIVE grants this RPC to service_role only, so calls are refused (42501) until a reviewed release.
// Rules: exact ACK; only allowlisted business refusals are definitive; anything else is uncertain and the SAME
// frozen attempt (same idempotency key, same args) is the only thing that may be sent again for that lot.

export const ENVASE_RPC = "rpc_cockpit_registrar_envase_v1";

export type EnvaseArgs = {
  p_lote_id: string; p_os_id: string; p_origem: string; p_programacao_id: string;
  p_linhas: { tipo_embalagem: string; quantidade: number }[]; p_validade: string;
  p_operador: string | null; p_idempotency_key: string; p_permitir_parcial: boolean; p_motivo_parcial: string | null;
};
export type EnvaseAttempt = { args: EnvaseArgs; actorId: string; orgId: string; replayRejected?: string };
export type EnvaseAck = { replay: boolean; estado: "completed" | "completed_override" | "partial" | string; saldoRestanteMl: number; message?: string; raw: Record<string, unknown> };
export type EnvaseOutcome =
  | { status: "confirmed"; ack: EnvaseAck }
  | { status: "rejected"; code: string; message: string }
  | { status: "uncertain" }
  | { status: "stale" };

/** Business refusals raised by the reviewed writer BEFORE any effect inside its single transaction. */
const DEFINITIVE_MESSAGES = [
  "COCKPIT_ENVASE_PARAMS_INVALIDOS", "COCKPIT_ENVASE_VALIDADE_OBRIGATORIA", "COCKPIT_ENVASE_VALIDADE_INVALIDA",
  "COCKPIT_ENVASE_SEM_LINHAS", "COCKPIT_IDEMPOTENCY_CONFLICT", "COCKPIT_RELATION_MISMATCH_PROGRAMACAO_OS",
  "COCKPIT_RELATION_MISMATCH_ORIGEM", "COCKPIT_OS_ESTADO_TERMINAL", "COCKPIT_LOTE_NAO_ENCONTRADO",
  "COCKPIT_RELATION_MISMATCH_LOTE_PROGRAMACAO", "COCKPIT_RELATION_MISMATCH_ITEM", "COCKPIT_LOTE_REPROVADO_BLOQUEIA_ENVASE",
  "COCKPIT_LOTE_SEM_VOLUME_PRODUZIDO", "COCKPIT_ENVASE_EXIGE_CQ_APROVADO", "COCKPIT_QUANTIDADE_INVALIDA",
  "COCKPIT_EMBALAGEM_INVALIDA", "COCKPIT_ENVASE_EXCEDE_PRODUZIDO", "COCKPIT_ENVASE_PARCIAL_SEM_ALCADA",
  "COCKPIT_ENVASE_PARCIAL_SEM_MOTIVO", "ENVASE_SCOPE_DENIED", "ENVASE_ORIGIN_COMPOSITION_PENDING",
  "ENVASE_TRANSITION_STATE", "ENVASE_TRANSITION_SCOPE_DENIED", "ENVASE_TRANSITION_CQ_REQUIRED",
  "ENVASE_TRANSITION_NO_ENVASE", "ENVASE_TRANSITION_COVERAGE", "ENVASE_TRANSITION_CLOSED",
];
// IN_PROGRESS / gate / lock / transport / proxy / unknown are NOT proof that nothing committed.
const DEFINITIVE_CODES = new Set(["42501", "PT409", "22023"]);

export function classifyEnvaseError(error: { code?: unknown; message?: unknown } | null | undefined): EnvaseOutcome {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  const token = DEFINITIVE_MESSAGES.find(m => message === m || message.startsWith(m + ":") || message.startsWith(m + " "));
  if (token && (code === "P0001" || DEFINITIVE_CODES.has(code))) return { status: "rejected", code: token, message };
  // Function-level EXECUTE denial (LIVE today: service_role only) happens before the body runs.
  if (code === "42501" && /permission denied for function/i.test(message)) return { status: "rejected", code, message };
  return { status: "uncertain" };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function parseEnvaseAck(data: unknown): EnvaseAck | null {
  if (!isObj(data) || data.success !== true || typeof data.replay !== "boolean") return null;
  if (!["completed", "completed_override", "partial"].includes(String(data.estado))) return null;
  const saldo = Number(data.saldo_restante_ml);
  if (!Number.isFinite(saldo)) return null;
  return { replay: data.replay, estado: String(data.estado), saldoRestanteMl: saldo, message: typeof data.message === "string" ? data.message : undefined, raw: data };
}

/* ---- Frozen uncertain attempt per actor+tenant+lot (survives reload; never overwritten by a distinct attempt). ---- */
const PREFIX = "cf:envase-uncertain:v1:";
const slot = (actorId: string, orgId: string, loteId: string) => `${PREFIX}${actorId}:${orgId}:${loteId}`;
type S = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadEnvaseAttempt(store: S, actorId: string, orgId: string, loteId: string): EnvaseAttempt | "corrupt" | null {
  const raw = store.getItem(slot(actorId, orgId, loteId));
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (!isObj(v) || v.actorId !== actorId || v.orgId !== orgId || !isObj(v.args) || (v.args as EnvaseArgs).p_lote_id !== loteId) return "corrupt";
    return v as EnvaseAttempt;
  } catch { return "corrupt"; }
}
export function saveEnvaseAttempt(store: S, a: EnvaseAttempt) {
  const key = slot(a.actorId, a.orgId, a.args.p_lote_id);
  const raw = JSON.stringify(a);
  const prev = store.getItem(key);
  if (prev !== null && prev !== raw) throw new Error("Já existe um envase com resultado incerto para este lote. Nenhuma alteração foi enviada.");
  store.setItem(key, raw);
  if (store.getItem(key) !== raw) throw new Error("Não foi possível reservar a recuperação local. Nenhuma alteração foi enviada.");
}
const sameAttempt = (raw: string | null, a: EnvaseAttempt) => {
  if (raw === null) return false;
  try { const { replayRejected: _x, ...v } = JSON.parse(raw); const { replayRejected: _y, ...b } = a; return JSON.stringify(v) === JSON.stringify(b); } catch { return false; }
};
/** Conditional clear: only the exact attempt that was settled. */
export function clearEnvaseAttempt(store: S, a: EnvaseAttempt): boolean {
  const key = slot(a.actorId, a.orgId, a.args.p_lote_id);
  if (!sameAttempt(store.getItem(key), a)) return false;
  store.removeItem(key); return true;
}
/** Refusal of a REPLAY does not prove the original uncertain call did not commit: keep it, mark it, block the lot. */
export function markEnvaseReplayRejected(store: S, a: EnvaseAttempt, code: string) {
  const key = slot(a.actorId, a.orgId, a.args.p_lote_id);
  if (!sameAttempt(store.getItem(key), a)) return;
  const { replayRejected: _x, ...b } = a;
  store.setItem(key, JSON.stringify({ ...b, replayRejected: code }));
}

export type EnvaseRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * One dispatch of `attempt` (fresh or exact replay). `fence` throws when actor/tenant changed: the late result is
 * then discarded (stale). The store is updated by the caller-visible rules above; it is never cleared on uncertainty.
 */
export async function dispatchEnvase(rpc: EnvaseRpc, store: S, attempt: EnvaseAttempt, isReplay: boolean, fence: () => void): Promise<EnvaseOutcome> {
  fence();
  saveEnvaseAttempt(store, attempt);
  fence();
  let outcome: EnvaseOutcome;
  try {
    const { data, error } = await rpc(ENVASE_RPC, attempt.args as unknown as Record<string, unknown>);
    if (error) outcome = classifyEnvaseError(error);
    else { const ack = parseEnvaseAck(data); outcome = ack ? { status: "confirmed", ack } : { status: "uncertain" }; }
  } catch { outcome = { status: "uncertain" }; }
  try { fence(); } catch { return { status: "stale" }; }
  if (outcome.status === "confirmed") clearEnvaseAttempt(store, attempt);
  else if (outcome.status === "rejected") {
    if (isReplay) markEnvaseReplayRejected(store, attempt, outcome.code);
    else clearEnvaseAttempt(store, attempt);
  }
  return outcome;
}
