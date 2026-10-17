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

export interface AuthzFingerprintResult {
  eligible: boolean;
  fingerprint: string | null;
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
}

export interface AuthzEpochMonitor {
  start: () => void;
  stop: () => void;
  revalidate: () => void;
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
    // Invalida a geração: resultado em voo nunca reabre dados após expirar.
    generation++;
    clearTimers();
    leaseUntil = 0;
    requestUntil = 0;
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

  const schedulePoll = () => {
    if (state === "stopped") return;
    if (pollTimer !== null) deps.clearTimeoutFn(pollTimer);
    pollTimer = deps.setTimeoutFn(() => {
      pollTimer = null;
      if (state === "stopped") return;
      if (!deps.isOnline()) { expire("offline"); return; }
      if (state === "valid" && deps.isVisible() && deps.now() < leaseUntil) {
        void poll(false);
      } else {
        schedulePoll();
      }
    }, pollMs);
  };

  const poll = async (explicit: boolean) => {
    if (state === "stopped") return;
    if (!deps.isOnline()) { expire("offline"); return; }
    // A suspended timer must not let a request renew already-expired authority.
    if (state === "valid" && deps.now() >= leaseUntil) expire("timeout");

    const myGen = ++generation;
    const requestStart = deps.now();
    if (pollTimer !== null) { deps.clearTimeoutFn(pollTimer); pollTimer = null; }
    if (requestTimer !== null) deps.clearTimeoutFn(requestTimer);
    // Explicit focus/retry never keeps content visible while revalidating.
    // Background polling keeps ONLY the previously confirmed deadline.
    if (explicit || state !== "valid") {
      leaseUntil = 0;
      if (leaseTimer !== null) { deps.clearTimeoutFn(leaseTimer); leaseTimer = null; }
      setState("pending");
    }
    requestUntil = requestStart + leaseMs;
    requestTimer = deps.setTimeoutFn(() => {
      if (generation === myGen && state !== "stopped") expire("timeout");
    }, leaseMs);

    try {
      const result = await deps.fetcher();
      if ((state as AuthzMonitorState) === "stopped" || generation !== myGen) return; // resposta antiga
      if (deps.now() >= requestUntil || (state === "valid" && deps.now() >= leaseUntil)) {
        expire("timeout"); return;
      }
      if (!result.eligible || !result.fingerprint) { expire("ineligible"); return; }

      if (requestTimer !== null) { deps.clearTimeoutFn(requestTimer); requestTimer = null; }
      // Renew ONLY after a valid response, conservatively from request start.
      leaseUntil = requestUntil;
      requestUntil = 0;
      const changed = fingerprint !== null && fingerprint !== result.fingerprint;
      fingerprint = result.fingerprint;
      setState("valid");
      armLeaseDeadline();
      if (changed) deps.onEpochChange(result);
      schedulePoll();
    } catch {
      if ((state as AuthzMonitorState) === "stopped" || generation !== myGen) return;
      expire("error");
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
    expireNow(reason) {
      if (state === "stopped") return;
      clearTimers();
      expire(reason);
    },
    state: () => state,
    checkAccess: () => state === "valid" && deps.now() < leaseUntil,
    currentFingerprint: () => fingerprint,
  };
}
