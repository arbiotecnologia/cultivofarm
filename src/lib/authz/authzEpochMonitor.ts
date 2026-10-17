// Foundation de cache de autorização para a MESMA identidade.
//
// Um único monitor por AuthProvider (integração em useAuth.tsx, atrás do gate
// AUTHZ_CACHE_FOUNDATION_ENABLED). Sem provider/rota paralelo e sem
// BroadcastChannel entre sessões/dispositivos: cada sessão mantém o próprio
// monitor e revalida no servidor.
//
// Semântica:
// * Polling a cada pollMs apenas quando visível, online e com lease válida.
// * Lease máxima de leaseMs medida DESDE O INÍCIO do request: uma resposta
//   atrasada NÃO renova lease já vencida (expira e oculta dados sensíveis).
// * Foco/visibility/online revalidam ANTES de mostrar dados (estado pending).
// * Erro/offline/timeout expiram a lease e notificam onExpire.
// * Mudança de fingerprint (revogação, troca de vínculo, A→B→A via
//   profile.updated_at monotônico) notifica onEpochChange UMA vez por época.
// * Proteção ABA/geração: cada request carrega uma geração; respostas de
//   gerações antigas são descartadas e nunca reabrem dados.

export interface AuthzFingerprintResult {
  eligible: boolean;
  fingerprint: string | null;
}

export type AuthzMonitorState = "idle" | "pending" | "valid" | "expired" | "stopped";

export interface AuthzEpochMonitorDeps {
  fetcher: () => Promise<AuthzFingerprintResult>;
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn: (handle: unknown) => void;
  isVisible: () => boolean;
  isOnline: () => boolean;
  onEpochChange: (result: AuthzFingerprintResult) => void;
  onExpire: (reason: "error" | "offline" | "timeout" | "ineligible") => void;
  pollMs?: number;
  leaseMs?: number;
}

export interface AuthzEpochMonitor {
  start: () => void;
  stop: () => void;
  revalidate: () => void;
  state: () => AuthzMonitorState;
  currentFingerprint: () => string | null;
}

export function createAuthzEpochMonitor(deps: AuthzEpochMonitorDeps): AuthzEpochMonitor {
  const pollMs = deps.pollMs ?? 10_000;
  const leaseMs = deps.leaseMs ?? 15_000;

  let state: AuthzMonitorState = "idle";
  let fingerprint: string | null = null;
  let generation = 0;
  let leaseUntil = 0;
  let pollTimer: unknown = null;
  let leaseTimer: unknown = null;

  const clearTimers = () => {
    if (pollTimer !== null) { deps.clearTimeoutFn(pollTimer); pollTimer = null; }
    if (leaseTimer !== null) { deps.clearTimeoutFn(leaseTimer); leaseTimer = null; }
  };

  const expire = (reason: "error" | "offline" | "timeout" | "ineligible") => {
    if (state === "stopped") return;
    state = "expired";
    leaseUntil = 0;
    deps.onExpire(reason);
  };

  const schedulePoll = () => {
    if (state === "stopped") return;
    if (pollTimer !== null) deps.clearTimeoutFn(pollTimer);
    pollTimer = deps.setTimeoutFn(() => {
      pollTimer = null;
      if (state === "stopped") return;
      // Offline expira prontamente mesmo sem ciclo completo.
      if (!deps.isOnline()) { void poll(); return; }
      // Só dispara novo ciclo com lease válida e visível; caso contrário
      // reagenda e aguarda revalidate() externo (foco/visibility/online).
      if (state === "valid" && deps.isVisible() && deps.now() < leaseUntil) {
        void poll();
      } else {
        schedulePoll();
      }
    }, pollMs);
  };

  const poll = async () => {
    if (state === "stopped") return;
    if (!deps.isOnline()) { expire("offline"); return; }

    const myGen = ++generation;
    const requestStart = deps.now();
    state = "pending";

    // Lease máxima medida desde o início do request.
    leaseUntil = requestStart + leaseMs;
    if (leaseTimer !== null) deps.clearTimeoutFn(leaseTimer);
    leaseTimer = deps.setTimeoutFn(() => {
      leaseTimer = null;
      if (state !== "stopped" && generation === myGen && state !== "valid") {
        expire("timeout");
      }
    }, leaseMs);

    try {
      const result = await deps.fetcher();
      if (state === "stopped" || generation !== myGen) return; // resposta antiga

      // Resposta atrasada não renova lease vencida.
      if (deps.now() >= leaseUntil) { expire("timeout"); return; }

      if (!result.eligible || !result.fingerprint) { expire("ineligible"); return; }

      const changed = fingerprint !== null && fingerprint !== result.fingerprint;
      fingerprint = result.fingerprint;
      state = "valid";
      if (changed) deps.onEpochChange(result);
      schedulePoll();
    } catch {
      if (state === "stopped" || generation !== myGen) return;
      expire("error");
    }
  };

  return {
    start() {
      if (state === "stopped") return;
      void poll();
    },
    stop() {
      state = "stopped";
      clearTimers();
      generation++;
    },
    revalidate() {
      if (state === "stopped") return;
      // Foco/visibility/online: revalida antes de mostrar dados.
      void poll();
    },
    state: () => state,
    currentFingerprint: () => fingerprint,
  };
}
