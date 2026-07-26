// Compartilhado: guardas de autenticação, autorização e validação para Edge Functions.
// Não é uma função implantada — apenas utilitários usados por outras funções.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requirePost(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });
  return null;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type Caller =
  | { kind: "user"; userId: string; roles: string[] }
  | { kind: "internal" };

/**
 * Autentica o chamador. Aceita:
 *  1. Cabeçalho `x-internal-secret` igual a INTERNAL_FUNCTION_SECRET (para chamadas cron internas).
 *  2. JWT válido em `Authorization: Bearer ...`.
 * Retorna erro 401 caso nenhuma condição seja satisfeita.
 */
export async function authenticate(req: Request): Promise<
  { caller: Caller; supabase: SupabaseClient } | { error: Response }
> {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const providedSecret = req.headers.get("x-internal-secret");
  if (internalSecret && providedSecret && providedSecret === internalSecret) {
    return { caller: { kind: "internal" }, supabase: serviceClient() };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: json(401, { error: "Não autenticado" }) };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return { error: json(401, { error: "Não autenticado" }) };

  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: json(401, { error: "Token inválido" }) };
  }

  const { data: rolesData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const roles = (rolesData ?? []).map((r: { role: string }) => r.role);
  return {
    caller: { kind: "user", userId: data.user.id, roles },
    supabase,
  };
}

export function hasAnyRole(caller: Caller, roles: string[]): boolean {
  if (caller.kind === "internal") return true;
  return caller.roles.some((r) => roles.includes(r));
}

export const STAFF_ROLES = [
  "administrador",
  "gestor",
  "administrativo",
  "consultor_tecnico",
  "tecnico_agronomo",
  "aplicador",
  "producao",
  "financeiro",
];

/** Valida bytes e MIME de um PDF. Aceita base64 (data URI ou puro). */
export function decodePdfBase64(
  b64: string,
  maxBytes: number,
): { bytes: Uint8Array } | { error: string } {
  const clean = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  if (!clean || clean.length < 20) return { error: "PDF vazio" };
  // Estimativa rápida sem decodificar tudo.
  const approxBytes = Math.floor((clean.length * 3) / 4);
  if (approxBytes > maxBytes) {
    return { error: `PDF excede o limite de ${Math.round(maxBytes / (1024 * 1024))}MB` };
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(clean);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return { error: "Base64 inválido" };
  }
  if (bytes.byteLength > maxBytes) {
    return { error: `PDF excede o limite de ${Math.round(maxBytes / (1024 * 1024))}MB` };
  }
  // Assinatura mágica do PDF: %PDF-
  if (
    bytes.byteLength < 5 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    return { error: "Arquivo não é um PDF válido" };
  }
  return { bytes };
}

/** Remove componentes de path e caracteres perigosos do nome de arquivo. */
export function sanitizeFileName(name: string, fallback = "arquivo.pdf"): string {
  const base = (name || fallback)
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
  if (!base) return fallback;
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export const isValidEmail = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s ?? "").trim());

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
