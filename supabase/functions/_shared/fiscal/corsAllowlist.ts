/**
 * FASE H7 — Allowlist canônica de origens para as Edge Functions fiscais.
 *
 * As origens públicas do app NÃO são segredo. Manter um default versionado
 * evita que a ausência do secret `FISCAL_CORS_ALLOWLIST` (que só existe no
 * projeto de secrets da plataforma) bloqueie o fluxo fiscal em staging.
 * O secret, quando presente, tem precedência e substitui o default.
 */
export const FISCAL_DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app",
  "https://cultivofarm.lovable.app",
  "https://www.cultivofarm.com.br",
  "https://cultivofarm.com.br",
  "http://localhost:8080",
];

/**
 * H7b — Fonte única de verdade das origens fiscais.
 *
 * Aceita DOIS nomes de secret por compatibilidade histórica:
 *   - `FISCAL_CORS_ALLOWLIST` (usado por certificate-upload/revoke/xml-engine)
 *   - `FISCAL_ALLOWED_ORIGINS` (usado originalmente por fiscal-preflight)
 * Quando ambos existem, a união é aplicada. Sem nenhum deles, cai no default
 * versionado (origens públicas do app, que não são segredo). Nunca `*`.
 */
export function fiscalAllowedOrigins(): string[] {
  const parse = (name: string) =>
    (Deno.env.get(name) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const fromEnv = [...new Set([...parse("FISCAL_CORS_ALLOWLIST"), ...parse("FISCAL_ALLOWED_ORIGINS")])];
  return fromEnv.length > 0 ? fromEnv : [...FISCAL_DEFAULT_ALLOWED_ORIGINS];
}
