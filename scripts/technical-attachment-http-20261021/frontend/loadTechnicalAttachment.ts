// REVIEW ONLY — intended path src/lib/authz/loadTechnicalAttachment.ts. Mirrors loadClientDocument.
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export const TECHNICAL_ATTACHMENT_LIMITS = { bytes: 20 * 1024 * 1024, timeoutMs: 15_000 } as const;

/** POST download-technical-attachment only; no SDK GET, signed URL or retry. */
export async function loadTechnicalAttachment(path: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  const unavailable = () => new Error("Documento indisponível");
  if (SUPABASE_URL !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || signal.aborted) throw unavailable();
  const controller = new AbortController();
  const deadline = performance.now() + TECHNICAL_ATTACHMENT_LIMITS.timeoutMs;
  const abort = () => controller.abort();
  const expired = () => { if (performance.now() >= deadline) abort(); return controller.signal.aborted; };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, TECHNICAL_ATTACHMENT_LIMITS.timeoutMs);
  const STOP = Symbol("aborted");
  const stopped = new Promise<typeof STOP>(r => controller.signal.addEventListener("abort", () => r(STOP), { once: true }));
  const step = async <T>(op: () => PromiseLike<T>): Promise<T> => {
    if (expired()) throw unavailable();
    const result = await Promise.race([Promise.resolve(op()), stopped]);
    if (result === STOP || expired()) throw unavailable();
    return result as T;
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => undefined); };
  controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    const session = await step(() => supabase.auth.getSession());
    if (session.error || !session.data.session) throw unavailable();
    const response = await step(() => fetchImpl(`${SUPABASE_URL}/functions/v1/download-technical-attachment`, {
      method: "POST", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${session.data.session.access_token}`, apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json" }, body: JSON.stringify({ bucket: "consultor-arquivos", path }),
    }));
    if (!response.ok || response.redirected ||
      response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream" ||
      !response.headers.get("Cache-Control")?.includes("no-store") || !response.body) {
      void response.body?.cancel().catch(() => undefined); throw unavailable();
    }
    reader = response.body.getReader();
    const chunks: ArrayBuffer[] = []; let size = 0;
    while (true) {
      const item = await step(() => reader ? reader.read() : Promise.reject(unavailable()));
      if (item.done) break;
      size += item.value.byteLength;
      if (size > TECHNICAL_ATTACHMENT_LIMITS.bytes) { abort(); throw unavailable(); }
      chunks.push(new Uint8Array(item.value).buffer);
    }
    if (expired()) throw unavailable();
    const ext = path.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm" };
    return new Blob(chunks, { type: types[ext ?? ""] ?? "application/octet-stream" });
  } catch { throw unavailable(); }
  finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", cancel);
    cancel(); try { reader?.releaseLock(); } catch { /* pending read cannot publish */ }
  }
}
