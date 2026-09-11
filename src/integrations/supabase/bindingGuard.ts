export const CANONICAL_SUPABASE_REF = "swzpzcwiasxmjutrmvkm" as const;
export const CANONICAL_SUPABASE_HOST = `${CANONICAL_SUPABASE_REF}.supabase.co` as const;
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_HOST}` as const;

export type BindingValidation =
  | { ok: true }
  | { ok: false; reason: "invalid_url" | "insecure_protocol" | "unexpected_host" };

export function validateSupabaseBinding(urlValue: string): BindingValidation {
  let url: URL;

  try {
    url = new URL(urlValue);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "insecure_protocol" };
  }

  if (url.hostname !== CANONICAL_SUPABASE_HOST) {
    return { ok: false, reason: "unexpected_host" };
  }

  return { ok: true };
}

export function assertCanonicalSupabaseBinding(urlValue: string): void {
  if (!validateSupabaseBinding(urlValue).ok) {
    throw new Error("Conexão bloqueada: ambiente não autorizado.");
  }
}