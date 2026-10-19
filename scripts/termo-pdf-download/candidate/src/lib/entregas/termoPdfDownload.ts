import { supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => new Error("Documento indisponível");
export const TERMO_PDF_MAX_BYTES = 15 * 1024 * 1024;
export const TERMO_PDF_DEADLINE_MS = 15_000;

/** Espera limitada: rejeita no abort mesmo que o transporte ignore o sinal. */
function bounded<T>(p: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(unavailable()); return; }
    const on = () => reject(unavailable());
    signal.addEventListener("abort", on, { once: true });
    Promise.resolve(p).then(
      (v) => { signal.removeEventListener("abort", on); resolve(v); },
      (e) => { signal.removeEventListener("abort", on); reject(e); },
    );
  });
}

/**
 * Binário do termo pela Edge canônica `entrega-termo-pdf` (action "download").
 * Sem URL portadora, sem assinatura de Storage e sem fallback: qualquer falha
 * vira erro neutro. Autorização e vigência são provadas no servidor.
 * Prazo real de 15 s (sinal repassado ao fetch + espera limitada) e limite de
 * bytes aplicado no stream, antes de acumular o corpo inteiro.
 */
export async function downloadTermoPdf(termoId: string, outer: AbortSignal): Promise<Blob> {
  if (!UUID.test(termoId) || outer.aborted) throw unavailable();
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, TERMO_PDF_DEADLINE_MS);
  outer.addEventListener("abort", abort, { once: true });
  const signal = controller.signal;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const { data } = await bounded(supabase.auth.getSession(), signal);
    const token = data?.session?.access_token;
    if (!token) throw unavailable();
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const res = await bounded(fetch(`${base}/functions/v1/entrega-termo-pdf`, {
      method: "POST", signal, cache: "no-store", credentials: "omit",
      headers: { Authorization: `Bearer ${token}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ termo_id: termoId, action: "download" }),
    }), signal);
    if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").startsWith("application/pdf")) {
      res.body?.cancel().catch(() => {});
      throw unavailable();
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > TERMO_PDF_MAX_BYTES) { res.body.cancel().catch(() => {}); throw unavailable(); }
    reader = res.body.getReader();
    const parts: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { done, value } = await bounded(reader.read(), signal);
      if (done) break;
      total += value.byteLength;
      if (total > TERMO_PDF_MAX_BYTES) throw unavailable();
      parts.push(value);
    }
    reader = undefined;
    if (total < 5 || signal.aborted) throw unavailable();
    const blob = new Blob(parts as BlobPart[], { type: "application/pdf" });
    const magic = new TextDecoder().decode(parts.length ? concatHead(parts, 5) : new Uint8Array());
    if (magic !== "%PDF-" || signal.aborted) throw unavailable();
    return blob;
  } catch {
    controller.abort();
    reader?.cancel().catch(() => {});
    throw unavailable();
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", abort);
  }
}

function concatHead(parts: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n); let off = 0;
  for (const p of parts) { const take = Math.min(p.byteLength, n - off); out.set(p.subarray(0, take), off); off += take; if (off >= n) break; }
  return out.subarray(0, off);
}
