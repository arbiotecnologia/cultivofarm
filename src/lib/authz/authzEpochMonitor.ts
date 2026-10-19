// Foundation de cache de autorização para a MESMA identidade.
//
// Um único monitor por AuthProvider (integração no hook de autenticação, atrás do gate
// AUTHZ_CACHE_FOUNDATION_ENABLED), criado apenas para perfis EXTERNOS após o
// Auth estar pronto. Sem provider/rota paralelo e sem BroadcastChannel entre
// sessões/dispositivos: cada sessão mantém o próprio monitor e revalida no
// servidor.
//
// Semântica (revisão c787cd9e):
// * Relógio MONOTÔNICO injetado (performance.now no runtime; fake nos testes).
// * Lease máxima de leaseMs medida DESDE O INÍCIO do request. A lease expira
//   mesmo quando o estado é "valid": autorização anterior nunca é estendida
//   por um novo poll, e o deadline é rechecado em cada acesso (checkAccess).
// * Revalidação explícita entra imediatamente em pending e ESCONDE render.
//   Poll em background só conserva o prazo previamente CONFIRMADO; timeout
//   da requisição é separado e não renova autoridade antes de uma resposta.
// * Offline/expiração INVALIDAM A GERAÇÃO: resultado em voo de geração antiga
//   nunca reabre dados após offline. Evento "offline" do navegador expira
//   imediatamente, sem esperar o próximo ciclo.
// * Mudança de fingerprint (revogação, troca de vínculo, A→B→A via
//   profile.updated_at monotônico) notifica onEpochChange UMA vez por época.

import type { AuthzDiagnostic } from "./localDiagnostics";

export interface AuthzFingerprintResult {
  eligible: boolean;
  fingerprint: string | null;
  /**
   * Orçamento de validade calculado no servidor (ms até o próximo boundary
   * temporal do vetor de autorização; ver authz_reader_v6.core). Quando
   * presente, a lease concedida é min(leaseMs, server_remaining_ms - RTT
   * monotônico): o cliente NUNCA se autoriza além do boundary do servidor.
   * Ausente/null => apenas leaseMs local.
   */
  server_remaining_ms?: number | null;
}

export type AuthzMonitorState = "idle" | "pending" | "valid" | "expired" | "stopped";

export interface AuthzEpochMonitorDeps {
  fetcher: () => Promise<AuthzFingerprintResult>;
  /** Relógio monotônico em ms (ex.: () => performance.now()). */
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn: (handle: unknown) => void;
  isVisible: () => boolean;
  isOnline: () => boolean;
  onEpochChange: (result: AuthzFingerprintResult) => void;
  onExpire: (reason: "error" | "offline" | "timeout" | "ineligible") => void;
  /** Chamado em toda transição de estado (para expor readiness reativo). */
  onStateChange?: (state: AuthzMonitorState) => void;
  pollMs?: number;
  leaseMs?: number;
  /** No monotonic revision: retire old view/cache on every confirmation. */
  refreshOnConfirmation?: boolean;
  /** Reviewed scope only: attempt polling in hidden tabs, never extend a lease without confirmation. */
  pollWhenHidden?: boolean;
  /**
   * Reviewed paired scope only: schedule the next background confirmation
   * BEFORE the confirmed deadline, using a conservative observed RTT
   * estimate. Never extends a lease; the request still has to be answered
   * before the previously confirmed deadline, otherwise access fails closed.
   */
  renewBeforeDeadline?: boolean;
  /** Jitter source in [0,1); injected by tests. Jitter only renews EARLIER. */
  random?: () => number;
  /** Optional observer only. Must never affect authority, timing or callbacks. */
  onDiagnostic?: (sample: AuthzDiagnostic) => void;
}

// Early-renewal bounds (renewBeforeDeadline only).
// MIN_DELAY: hard floor between a confirmation and the next request (no busy
// loop: at most one request per ~second even with tiny server budgets).
// FLOOR_MARGIN: minimum headroom reserved before the deadline for the next
// round-trip. Margin = max(FLOOR_MARGIN, 2 x RTT estimate).
// JITTER: up to this much earlier, never later than the computed time.
export const EARLY_RENEWAL_MIN_DELAY_MS = 1_000;
export const EARLY_RENEWAL_FLOOR_MARGIN_MS = 5_000;
export const EARLY_RENEWAL_MAX_JITTER_MS = 500;

export interface AuthzEpochMonitor {
  start: () => void;
  stop: () => void;
  revalidate: () => void;
  /** Environmental signal: retain only a still-confirmed lease and coalesce in-flight requests. */
  revalidateEnvironment: () => void;
  /** Expira imediatamente (evento offline do navegador). */
  expireNow: (reason: "offline" | "error") => void;
  state: () => AuthzMonitorState;
  /** true somente em "valid" com lease vigente — rechecagem no acesso. */
  checkAccess: () => boolean;
  currentFingerprint: () => string | null;
}

export function createAuthzEpochMonitor(deps: AuthzEpochMonitorDeps): AuthzEpochMonitor {
  const pollMs = deps.pollMs ?? 10_000;
  const leaseMs = deps.leaseMs ?? 15_000;

  let state: AuthzMonitorState = "idle";
  let fingerprint: string | null = null;
  let generation = 0;
  let leaseUntil = 0;
  let requestUntil = 0;
  let pollTimer: unknown = null;
  let leaseTimer: unknown = null;
  let requestTimer: unknown = null;
  let inFlightGeneration: number | null = null;
  // Conservative RTT estimate: never below the latest sample, decays slowly.
  let rttEstimate: number | null = null;
  let lastRequestStart: number | null = null;
  const diagnostic = (event: AuthzDiagnostic["event"], reason: AuthzDiagnostic["reason"] = null) => {
    if (!deps.onDiagnostic) return;
    try {
      const now = deps.now();
      deps.onDiagnostic({ event, state, reason, visible: deps.isVisible(), online: deps.isOnline(),
        rttMs: lastRequestStart === null ? null : now - lastRequestStart,
        leaseRemainingMs: leaseUntil === 0 ? null : leaseUntil - now,
        requestRemainingMs: requestUntil === 0 ? null : requestUntil - now });
    } catch { /* Diagnostics never alter authorization. */ }
  };

  const setState = (next: AuthzMonitorState) => {
    if (state === next) return;
    state = next;
    deps.onStateChange?.(next);
  };

  const clearTimers = () => {
    if (pollTimer !== null) { deps.clearTimeoutFn(pollTimer); pollTimer = null; }
    if (leaseTimer !== null) { deps.clearTimeoutFn(leaseTimer); leaseTimer = null; }
    if (requestTimer !== null) { deps.clearTimeoutFn(requestTimer); requestTimer = null; }
  };

  const expire = (reason: "error" | "offline" | "timeout" | "ineligible") => {
    if (state === "stopped") return;
    diagnostic("expire", reason);
    // Invalida a geração: resultado em voo nunca reabre dados após expirar.
    generation++;
    clearTimers();
    leaseUntil = 0;
    requestUntil = 0;
    inFlightGeneration = null;
    setState("expired");
    deps.onExpire(reason);
  };

  // Expiração da lease vale também para o estado "valid": passado o deadline,
  // os dados ficam ocultos até nova validação bem-sucedida.
  const armLeaseDeadline = () => {
    if (leaseTimer !== null) deps.clearTimeoutFn(leaseTimer);
    const remaining = leaseUntil - deps.now();
    if (remaining <= 0) { expire("timeout"); return; }
    leaseTimer = deps.setTimeoutFn(() => {
      leaseTimer = null;
      if (state !== "stopped" && deps.now() >= leaseUntil) expire("timeout");
    }, remaining);
  };

  const schedulePoll = (delayMs: number = pollMs) => {
    if (state === "stopped") return;
    if (pollTimer !== null) deps.clearTimeoutFn(pollTimer);
    pollTimer = deps.setTimeoutFn(() => {
      pollTimer = null;
      if (state === "stopped") return;
      if (!deps.isOnline()) { expire("offline"); return; }
      if (state === "valid" && deps.now() >= leaseUntil) { expire("timeout"); return; }
      if (state === "valid" && (deps.pollWhenHidden || deps.isVisible()) && deps.now() < leaseUntil) {
        void poll(false);
      } else {
        schedulePoll();
      }
    }, delayMs);
  };

  // Next background request time measured from the confirmation instant.
  // Bounded to [MIN_DELAY, pollMs]; it can only move the request earlier
  // than the published cadence, never later, and never touches leaseUntil.
  const nextPollDelay = (rttSample: number): number => {
    if (!deps.renewBeforeDeadline) return pollMs;
    const sample = Number.isFinite(rttSample) && rttSample > 0 ? rttSample : 0;
    rttEstimate = rttEstimate === null ? sample : Math.max(sample, 0.75 * rttEstimate + 0.25 * sample);
    const margin = Math.max(EARLY_RENEWAL_FLOOR_MARGIN_MS, 2 * rttEstimate);
    const r = deps.random ? deps.random() : Math.random();
    const jitter = EARLY_RENEWAL_MAX_JITTER_MS * (Number.isFinite(r) ? Math.min(Math.max(r, 0), 1) : 0);
    const untilDeadline = leaseUntil - deps.now();
    const delay = Math.min(pollMs, untilDeadline - margin - jitter);
    return Math.max(EARLY_RENEWAL_MIN_DELAY_MS, delay);
  };

  const poll = async (explicit: boolean) => {
    if (state === "stopped") return;
    if (!deps.isOnline()) { expire("offline"); return; }
    // A suspended timer must not let a request renew already-expired authority.
    if (state === "valid" && deps.now() >= leaseUntil) expire("timeout");

    const myGen = ++generation;
    inFlightGeneration = myGen;
    const requestStart = deps.now();
    lastRequestStart = requestStart;
    if (pollTimer !== null) { deps.clearTimeoutFn(pollTimer); pollTimer = null; }
    if (requestTimer !== null) deps.clearTimeoutFn(requestTimer);
    // Explicit retry never keeps content visible while revalidating.
    // Background polling keeps ONLY the previously confirmed deadline.
    if (explicit || state !== "valid") {
      leaseUntil = 0;
      if (leaseTimer !== null) { deps.clearTimeoutFn(leaseTimer); leaseTimer = null; }
      setState("pending");
    }
    requestUntil = requestStart + leaseMs;
    diagnostic("request");
    requestTimer = deps.setTimeoutFn(() => {
      if (generation === myGen && state !== "stopped") expire("timeout");
    }, leaseMs);

    try {
      const result = await deps.fetcher();
      if ((state as AuthzMonitorState) === "stopped" || generation !== myGen) { diagnostic("stale"); return; }
      diagnostic("response");
      if (deps.now() >= requestUntil || (state === "valid" && deps.now() >= leaseUntil)) {
        expire("timeout"); return;
      }
      if (!result.eligible || !result.fingerprint) { expire("ineligible"); return; }

      if (requestTimer !== null) { deps.clearTimeoutFn(requestTimer); requestTimer = null; }
      // Renew ONLY after a valid response, conservatively from request start.
      // Se o servidor informou orçamento (server_remaining_ms), desconta o
      // round-trip monotônico completo e nunca excede leaseMs nem o boundary
      // do servidor; orçamento já consumido pelo RTT expira imediatamente.
      // Contrato v6: campo ausente/null => apenas leaseMs local. Valor
      // presente porém não numérico finito ou negativo => resposta inválida,
      // falha fechada (não silencia para lease local).
      const budget = result.server_remaining_ms;
      let effectiveLeaseMs: number;
      if (budget === undefined || budget === null) {
        effectiveLeaseMs = leaseMs;
      } else if (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0) {
        expire("error"); return;
      } else {
        effectiveLeaseMs = Math.min(leaseMs, budget - (deps.now() - requestStart));
      }
      if (effectiveLeaseMs <= 0) { expire("timeout"); return; }
      // O deadline precisa ser finito E estritamente futuro ANTES de qualquer
      // transição para valid: RTT alto pode consumir o orçamento mesmo com
      // effectiveLeaseMs > 0 (ex.: budget 7, RTT 4 => deadline em t+3 < now).
      const deadline = requestStart + effectiveLeaseMs;
      if (!Number.isFinite(deadline) || deadline <= deps.now()) { expire("timeout"); return; }
      leaseUntil = deadline;
      requestUntil = 0;
      const changed = fingerprint !== null && (fingerprint !== result.fingerprint || deps.refreshOnConfirmation === true);
      fingerprint = result.fingerprint;
      setState("valid");
      armLeaseDeadline();
      // O relógio pode cruzar o deadline entre a pré-checagem e o arm do
      // timer (armLeaseDeadline expira nesse caso): nenhum callback de época
      // nem poll pode sair após a expiração.
      if (state !== "valid" || generation !== myGen) return;
      if (changed) deps.onEpochChange(result);
      if (state !== "valid" || generation !== myGen) return;
      schedulePoll(nextPollDelay(deps.now() - requestStart));
    } catch {
      if ((state as AuthzMonitorState) === "stopped" || generation !== myGen) return;
      expire("error");
    } finally {
      if (inFlightGeneration === myGen) inFlightGeneration = null;
    }
  };

  return {
    start() {
      if (state === "stopped") return;
      void poll(true);
    },
    stop() {
      setState("stopped");
      clearTimers();
      generation++;
    },
    revalidate() {
      if (state === "stopped") return;
      void poll(true);
    },
    revalidateEnvironment() {
      if (state === "stopped") return;
      diagnostic("environment");
      if (!deps.isOnline()) { expire("offline"); return; }
      // Check deadline BEFORE deduplication: a suspended in-flight request
      // cannot keep old authority alive when focus and visibility resume.
      if (state === "valid" && deps.now() >= leaseUntil) expire("timeout");
      if (inFlightGeneration !== null) return;
      void poll(false);
    },
    expireNow(reason) {
      if (state === "stopped") return;
      clearTimers();
      expire(reason);
    },
    state: () => state,
    // Pure read: used during React render. Timers/poll/response expire state.
    checkAccess: () => state === "valid" && deps.now() < leaseUntil,
    currentFingerprint: () => fingerprint,
  };
}
