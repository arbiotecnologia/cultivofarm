// Helper CORS — importável tanto em Node (tests) quanto Deno.
// Aceita:
//   - http://localhost:*, http://127.0.0.1:*
//   - https://*.lovable.app, https://*.lovableproject.com (previews)
//   - https://app.cultivofarm.com.br (produção canônica)
//   - Cada origem listada em COMMUNICATION_ADMIN_ORIGINS (CSV) — lida lazy.
// NUNCA retorna Access-Control-Allow-Origin: *. Origens desconhecidas =>
// resposta sem CORS (o navegador bloqueia leitura pelo script chamador).

const HOST_PATTERNS: RegExp[] = [
  /^https:\/\/app\.cultivofarm\.com\.br$/i,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i,
  /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const ALLOWED_METHODS = "GET, PUT, POST, OPTIONS";

// Env lida lazy — importar o módulo em Node não deve falhar.
function readExtraOrigins(): string[] {
  try {
    // @ts-ignore Deno pode não existir em Node.
    const raw = typeof Deno !== "undefined" ? (Deno.env.get("COMMUNICATION_ADMIN_ORIGINS") ?? "") : "";
    return String(raw).split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  } catch { return []; }
}

/** Overload puro para testes: aceita lista explícita de extras. */
export function isTrustedOriginPure(origin: string | null, extras: string[]): boolean {
  if (!origin) return false;
  const o = origin.toLowerCase();
  if (extras.includes(o)) return true;
  return HOST_PATTERNS.some((r) => r.test(o));
}

export function isTrustedOrigin(origin: string | null): boolean {
  return isTrustedOriginPure(origin, readExtraOrigins());
}

/** Headers CORS — só populados quando origem é confiável. */
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

/** Preflight — 204 se confiável, 403 caso contrário. */
export function handlePreflight(req: Request): Response {
  const origin = req.headers.get("Origin");
  if (!isTrustedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
}

export { HOST_PATTERNS as CORS_HOST_PATTERNS, ALLOWED_HEADERS as CORS_ALLOWED_HEADERS, ALLOWED_METHODS as CORS_ALLOWED_METHODS };
