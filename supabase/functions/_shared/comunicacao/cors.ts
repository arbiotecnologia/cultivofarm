// Helper CORS para funções administrativas. Origens confiáveis apenas.
//
// Aceita:
//   - http://localhost:*, http://127.0.0.1:*
//   - https://*.lovable.app, https://*.lovableproject.com (previews)
//   - Cada origem listada em COMMUNICATION_ADMIN_ORIGINS (CSV) — extensível
//     via env sem redeploy do adapter.
//
// Nunca retorna Access-Control-Allow-Origin: *. Origens desconhecidas resultam
// em resposta sem CORS (ou preflight 403), bloqueando o navegador de expor a
// resposta ao script chamador.

const EXTRA = (Deno.env.get("COMMUNICATION_ADMIN_ORIGINS") ?? "")
  .split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

const HOST_PATTERNS: RegExp[] = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i,
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const ALLOWED_METHODS = "GET, PUT, POST, OPTIONS";

export function isTrustedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const o = origin.toLowerCase();
  if (EXTRA.includes(o)) return true;
  return HOST_PATTERNS.some((r) => r.test(o));
}

/** Headers CORS para respostas normais. Devolve headers só se a origem for confiável. */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!isTrustedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Vary": "Origin",
    "Access-Control-Max-Age": "600",
  };
}

/** Resposta de preflight — 204 se confiável, 403 caso contrário. */
export function handlePreflight(req: Request): Response {
  const origin = req.headers.get("Origin");
  if (!isTrustedOrigin(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
}
