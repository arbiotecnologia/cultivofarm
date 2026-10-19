// Foundation de cache de autorização (mesma identidade). Gate FECHADO até
// revisão independente: o monitor não é criado enquanto false.
export const AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = true;

// Limited observational scopes only; no global v6 activation.
export const AUTHZ_CACHE_ROLLOUT_SCOPE: "b2b-context" | "external-fingerprint" = "b2b-context";

// Producer preview activation authorized 2026-10-18 23:37 after regressions.
// Does not enable global fingerprint/v6 or authenticated attachment Blobs.
export const PRODUCER_CONTEXT_MONITOR_ENABLED: boolean = true;

// Financial-only activation authorized 2026-10-18 23:47 after draft regressions
// and auditor-reported canonical preflight; not global entity/entitlement monitoring.
export const FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = true;

// Company administrator only; candidate remains OFF pending owner preflight/review.
export const COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = true;

// Exclusive tenant technical consultant; OFF until independent review.
export const CONSULTANT_CONTEXT_MONITOR_ENABLED: boolean = true;
