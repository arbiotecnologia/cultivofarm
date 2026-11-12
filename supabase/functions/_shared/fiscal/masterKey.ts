/**
 * Derivação ÚNICA da chave mestra do cofre A1 (`FISCAL_CERTIFICATE_MASTER_KEY`).
 *
 * Reproduz EXATAMENTE a regra histórica de `fiscal-certificate-upload`, que
 * cifrou todo o material existente:
 *   1. se `atob(raw)` decodifica para exatamente 32 bytes, usa esses bytes;
 *   2. senão, se `raw` tiver pelo menos 32 caracteres, usa SHA-256(UTF-8(raw));
 *   3. caso contrário, indisponível (null).
 *
 * Upload, assinatura de evento, transporte SEFAZ e motor XML importam este
 * módulo — nenhuma outra variável de ambiente, fallback, log ou leitura extra.
 */
declare const Deno: { env: { get(name: string): string | undefined } };

export async function deriveMasterKey(raw: string | null | undefined): Promise<Uint8Array | null> {
  if (!raw) return null;
  try {
    const bin = atob(raw);
    if (bin.length === 32) {
      const out = new Uint8Array(32);
      for (let i = 0; i < 32; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
  } catch {
    // segue para a derivação SHA-256
  }
  if (raw.length < 32) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return new Uint8Array(digest);
}

/** Lê somente a chave canônica e aplica a derivação única. */
export function decodeMasterKey(): Promise<Uint8Array | null> {
  return deriveMasterKey(Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY"));
}
