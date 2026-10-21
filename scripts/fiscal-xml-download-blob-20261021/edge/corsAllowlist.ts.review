/**
 * FASE H7e — Allowlist canônica de origens para as Edge Functions fiscais.
 *
 * Regras (H7e):
 *  - NUNCA `*`.
 *  - As origens públicas do app NÃO são segredo: existe um default versionado.
 *  - Um secret de ambiente NUNCA elimina silenciosamente as origens canônicas:
 *    a allowlist efetiva é a UNIÃO entre o default versionado e as origens
 *    configuradas por ambiente (`FISCAL_CORS_ALLOWLIST` / `FISCAL_ALLOWED_ORIGINS`).
 *  - Comparação por origem NORMALIZADA (`new URL(origin).origin`), evitando
 *    falha por barra final, caixa alta no host ou porta default explícita.
 *  - Preview do Lovable aceito somente para o projeto autorizado
 *    `a79bb3db-f665-466d-bf41-ee8c6cb91fab`.
 */
export const FISCAL_LOVABLE_PROJECT_ID = "a79bb3db-f665-466d-bf41-ee8c6cb91fab" as const;

export const FISCAL_DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  `https://id-preview--${FISCAL_LOVABLE_PROJECT_ID}.lovable.app`,
  `https://preview--${FISCAL_LOVABLE_PROJECT_ID}.lovable.app`,
  `https://${FISCAL_LOVABLE_PROJECT_ID}.lovableproject.com`,
  "https://cultivofarm.lovable.app",
  "https://app.cultivofarm.com.br",
  "https://www.cultivofarm.com.br",
  "https://cultivofarm.com.br",
  "http://localhost:8080",
];

/** Identificador NÃO sensível de release do pacote fiscal (H7e). */
export const FISCAL_RELEASE_ID: string = Deno.env.get("FISCAL_RELEASE_ID") ?? "h7e-2026-08-31";

/** Normaliza para a forma canônica `scheme://host[:port]`. Retorna null se inválida. */
export function normalizeOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const raw = origin.trim();
  if (!raw || raw === "null") return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Allowlist efetiva = default versionado ∪ origens do ambiente.
 * Aceita dois nomes de secret por compatibilidade histórica.
 */
export function fiscalAllowedOrigins(): string[] {
  const parse = (name: string) =>
    (Deno.env.get(name) ?? "")
      .split(",")
      .map((s) => normalizeOrigin(s))
      .filter((s): s is string => !!s);
  const canonical = FISCAL_DEFAULT_ALLOWED_ORIGINS.map((o) => normalizeOrigin(o)!).filter(Boolean);
  return [
    ...new Set([
      ...canonical,
      ...parse("FISCAL_CORS_ALLOWLIST"),
      ...parse("FISCAL_ALLOWED_ORIGINS"),
    ]),
  ];
}

/** Fail-closed: origem ausente, inválida ou fora da allowlist => false. */
export function isFiscalOriginAllowed(origin: string | null | undefined): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return fiscalAllowedOrigins().includes(normalized);
}

export interface FiscalCors {
  allowed: boolean;
  origin: string | null;
  headers: Record<string, string>;
}

/**
 * Headers CORS canônicos das funções fiscais. Nunca ecoa origem não permitida
 * e nunca usa wildcard. Inclui o marcador de release (não sensível).
 */
export function fiscalCorsHeaders(origin: string | null, methods = "POST, OPTIONS"): FiscalCors {
  const normalized = normalizeOrigin(origin);
  const allowed = !!normalized && fiscalAllowedOrigins().includes(normalized);
  return {
    allowed,
    origin: normalized,
    headers: {
      "Access-Control-Allow-Origin": allowed ? normalized! : "null",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      "Access-Control-Allow-Methods": methods,
      "Vary": "Origin",
      "X-AR-Bio-Function-Version": FISCAL_RELEASE_ID,
    },
  };
}
