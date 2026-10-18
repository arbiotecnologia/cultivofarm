// Foundation de cache de autorização (mesma identidade). Gate FECHADO até
// revisão independente: o monitor não é criado enquanto false.
export const AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = false;

// Candidate scope only: no producer/global v6 activation.
export const AUTHZ_CACHE_ROLLOUT_SCOPE: "b2b-context" | "external-fingerprint" = "b2b-context";
