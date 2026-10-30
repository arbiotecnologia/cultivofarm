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
const nonNegInt = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const nonNegNum = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const exactKeys = (o: Record<string, unknown>, req: string[], opt: string[] = []) =>
  req.every(k => k in o) && Object.keys(o).every(k => req.includes(k) || opt.includes(k));
const ACK_KEYS = ["success", "replay", "estado", "envases", "entradas_estoque", "volume_reservado_ml", "volume_livre_ml", "pendente_os_ml", "saldo_restante_ml", "avanco", "message"];
/**
 * Exact canonical envelope of the v2 writer (no coercion: null/strings/NaN never pass). The envelope carries NO
 * os/lot/org/key identifiers, so it is NOT bound to the attempt by content; only the dispatch fence binds it.
 */
export function parseEnvaseAck(data: unknown): EnvaseAck | null {
  if (!isObj(data) || !exactKeys(data, ACK_KEYS) || data.success !== true || typeof data.replay !== "boolean" || typeof data.message !== "string") return null;
  const estado = data.estado;
  if (estado !== "completed" && estado !== "completed_override" && estado !== "partial") return null;
  if (!nonNegInt(data.envases) || !nonNegInt(data.entradas_estoque) || (data.envases as number) < 1 || (data.entradas_estoque as number) < 1) return null;
  if (!nonNegNum(data.volume_reservado_ml) || !nonNegNum(data.volume_livre_ml) || !nonNegNum(data.saldo_restante_ml)) return null;
  // pendente_os_ml = greatest(0, demanda-reservado) minus newly reserved volume: finite, never NaN/null.
  const pend = data.pendente_os_ml;
  if (typeof pend !== "number" || !Number.isFinite(pend)) return null;
  if (estado === "completed" ? pend > 0 : pend <= 0) return null;
  const av = data.avanco;
  if (!isObj(av)) return null;
  if (estado === "partial") {
    if (!exactKeys(av, ["success", "motivo"]) || av.success !== false || av.motivo !== "COCKPIT_ENVASE_PARCIAL_NAO_AVANCA") return null;
  } else {
    if (!exactKeys(av, ["success", "replay", "status"], ["status_anterior"]) || av.success !== true || typeof av.replay !== "boolean" || av.status !== "pronto_entrega") return null;
    if ("status_anterior" in av ? (av.replay !== false || (av.status_anterior !== "em_cq" && av.status_anterior !== "envase")) : av.replay !== true) return null;
  }
  return { replay: data.replay, estado, saldoRestanteMl: data.saldo_restante_ml as number, message: data.message, raw: data };
}

/* ---- Pending uncertain attempts: one slot PER ATTEMPT (actor+tenant+lot+key); a save never overwrites a distinct
 * attempt, a clear removes only the exact attempt, and any pending/corrupt attempt for the lot blocks new keys. ---- */
const PREFIX = "cf:envase-uncertain:v2:";
const LEGACY_PREFIX = "cf:envase-uncertain:v1:";
const lotPrefix = (actorId: string, orgId: string, loteId: string) => `${PREFIX}${actorId}:${orgId}:${loteId}:`;
const slotOf = (a: Pick<EnvaseAttempt, "actorId" | "orgId" | "args">) => `${lotPrefix(a.actorId, a.orgId, a.args.p_lote_id)}${a.args.p_idempotency_key}`;
type S = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const lotSlots = (store: S, actorId: string, orgId: string, loteId: string) => {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && (k.startsWith(lotPrefix(actorId, orgId, loteId)) || k === `${LEGACY_PREFIX}${actorId}:${orgId}:${loteId}`)) out.push(k);
  }
  return out.sort();
};
const parseAttempt = (raw: string | null, slot: string, actorId: string, orgId: string, loteId: string): EnvaseAttempt | "corrupt" | null => {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw);
    if (!isObj(v) || v.actorId !== actorId || v.orgId !== orgId || !isObj(v.args)) return "corrupt";
    const args = v.args as EnvaseArgs;
    if (args.p_lote_id !== loteId || typeof args.p_idempotency_key !== "string" || !args.p_idempotency_key) return "corrupt";
    if (!slot.startsWith(LEGACY_PREFIX) && slot !== slotOf(v as EnvaseAttempt)) return "corrupt";
    return v as EnvaseAttempt;
  } catch { return "corrupt"; }
};
/** All pending attempts of this actor/tenant/lot (fresh read every call). Any unreadable slot -> "corrupt". */
export function loadEnvaseAttempts(store: S, actorId: string, orgId: string, loteId: string): EnvaseAttempt[] | "corrupt" {
  const out: EnvaseAttempt[] = [];
  for (const k of lotSlots(store, actorId, orgId, loteId)) {
    const a = parseAttempt(store.getItem(k), k, actorId, orgId, loteId);
    if (a === "corrupt") return "corrupt";
    if (a) out.push(a);
  }
  return out;
}
const sameAttempt = (raw: string | null, a: EnvaseAttempt) => {
  if (raw === null) return false;
  try { const { replayRejected: _x, ...v } = JSON.parse(raw); const { replayRejected: _y, ...b } = a; return JSON.stringify(v) === JSON.stringify(b); } catch { return false; }
};
const slotHolding = (store: S, a: EnvaseAttempt) =>
  lotSlots(store, a.actorId, a.orgId, a.args.p_lote_id).find(k => sameAttempt(store.getItem(k), a)) ?? null;
/**
 * Reserve this attempt's own slot. Refuses when a distinct attempt already exists for the lot, before AND after the
 * write (another tab may have interleaved); on a post-write collision only our own, never-dispatched slot is removed.
 */
export function saveEnvaseAttempt(store: S, a: EnvaseAttempt) {
  if (slotHolding(store, a)) return; // exact same attempt already reserved (replay)
  const others = () => loadEnvaseAttempts(store, a.actorId, a.orgId, a.args.p_lote_id);
  const before = others();
  if (before === "corrupt" || before.length) throw new Error("Já existe um envase com resultado incerto para este lote. Nenhuma alteração foi enviada.");
  const key = slotOf(a); const raw = JSON.stringify(a);
  if (store.getItem(key) !== null) throw new Error("Já existe um envase com resultado incerto para este lote. Nenhuma alteração foi enviada.");
  store.setItem(key, raw);
  if (store.getItem(key) !== raw) throw new Error("Não foi possível reservar a recuperação local. Nenhuma alteração foi enviada.");
  const after = others();
  if (after === "corrupt" || after.length !== 1) {
    if (store.getItem(key) === raw) store.removeItem(key);
    throw new Error("Outro envio deste lote foi iniciado em paralelo. Nenhuma alteração foi enviada; consulte o histórico.");
  }
}
/** Conditional clear: only the exact attempt that was settled. */
export function clearEnvaseAttempt(store: S, a: EnvaseAttempt): boolean {
  const k = slotHolding(store, a);
  if (!k) return false;
  store.removeItem(k); return true;
}
/** Refusal of a REPLAY does not prove the original uncertain call did not commit: keep it, mark it, block the lot. */
export function markEnvaseReplayRejected(store: S, a: EnvaseAttempt, code: string) {
  const k = slotHolding(store, a);
  if (!k) return;
  const { replayRejected: _x, ...b } = a;
  store.setItem(k, JSON.stringify({ ...b, replayRejected: code }));
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
