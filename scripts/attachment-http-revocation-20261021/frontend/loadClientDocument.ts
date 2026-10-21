// REVIEW ONLY — intended path src/lib/authz/loadClientDocument.ts.
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

/** Actor session comes only from the canonical client. Never direct Storage fallback. */
export async function loadClientDocument(path: string, signal: AbortSignal): Promise<Blob> {
  const unavailable = () => new Error("Documento indisponível");
  if (SUPABASE_URL !== "https://swzpzcwiasxmjutrmvkm.supabase.co" || signal.aborted) throw unavailable();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  const STOP = Symbol("aborted");
  const stopped = new Promise<typeof STOP>(resolve => controller.signal.addEventListener("abort", () => resolve(STOP), { once: true }));
  const step = async <T>(operation: () => PromiseLike<T>): Promise<T> => {
    if (controller.signal.aborted) throw unavailable();
    const result = await Promise.race([Promise.resolve(operation()), stopped]);
    if (result === STOP || controller.signal.aborted) throw unavailable();
    return result as T;
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => undefined); };
  controller.signal.addEventListener("abort", cancel, { once: true });
  try {
    const session = await step(() => supabase.auth.getSession());
    if (session.error || !session.data.session) throw unavailable();
    // Full canonical function URL; no second Supabase client, no /api alias.
    const response = await step(() => fetch(`${SUPABASE_URL}/functions/v1/download-client-document`, {
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${session.data.session.access_token}`, apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json" }, body: JSON.stringify({ bucket: "clientes-docs", path }),
    }).then(value => {
      if (controller.signal.aborted) void value.body?.cancel().catch(() => undefined);
      return value;
    }));
    if (!response.ok || response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream" ||
      !response.headers.get("Cache-Control")?.includes("no-store") || !response.body) {
      void response.body?.cancel().catch(() => undefined); throw unavailable();
    }
    reader = response.body.getReader();
    const chunks: ArrayBuffer[] = []; let size = 0;
    while (true) {
      const item = await step(() => reader ? reader.read() : Promise.reject(unavailable()));
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 10 * 1024 * 1024) { abort(); throw unavailable(); }
      chunks.push(new Uint8Array(item.value).buffer);
    }
    if (controller.signal.aborted) throw unavailable();
    const extension = path.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
    return new Blob(chunks, { type: types[extension ?? ""] ?? "application/octet-stream" });
  } catch { throw unavailable(); }
  finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", cancel);
    cancel(); try { reader?.releaseLock(); } catch { /* pending read cannot publish */ }
  }
}