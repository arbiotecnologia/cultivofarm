import type { WorkerEnv } from "./adapters-types.ts";

export type SmtpProviderRoute = "current" | "kinghost_smtpi";

const KINGHOST_SMTP_ROUTES: Readonly<Record<string, string>> = {
  "smtp.kinghost.net": "smtpi.kinghost.net",
  "smtp.uni5.net": "smtpi.uni5.net",
};

function normalizeHostname(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\.$/, "");
}

export function getKinghostSmtpiCandidate(host: string | undefined, port: string | undefined): string | null {
  if (Number(port) !== 465) return null;
  return KINGHOST_SMTP_ROUTES[normalizeHostname(host)] ?? null;
}

export function isKinghostSmtpiCandidateAvailable(host: string | undefined, port: string | undefined): boolean {
  return getKinghostSmtpiCandidate(host, port) !== null;
}

export function buildSmtpCandidateRuntime(
  env: WorkerEnv,
  route: SmtpProviderRoute,
): { ok: true; env: WorkerEnv; route: SmtpProviderRoute } | { ok: false; code: "candidate_not_applicable" } {
  if (route === "current") return { ok: true, env: { ...env }, route };

  const candidateHost = getKinghostSmtpiCandidate(env.SMTP_HOST, env.SMTP_PORT);
  if (!candidateHost) return { ok: false, code: "candidate_not_applicable" };

  return {
    ok: true,
    route,
    env: { ...env, SMTP_HOST: candidateHost },
  };
}