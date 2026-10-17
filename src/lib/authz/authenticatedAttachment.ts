import { supabase } from "@/integrations/supabase/client";

// Operational bounds, not authorization. Storage RLS remains authoritative.
export const ATTACHMENT_LIMITS = { concurrent: 3, files: 24, fileBytes: 20 * 1024 * 1024, totalBytes: 60 * 1024 * 1024, timeoutMs: 15_000 } as const;
const unavailable = () => new Error("Anexo indisponível");
let active = 0;
const queue: Array<() => void> = [];

async function acquire(signal: AbortSignal): Promise<() => void> {
  if (signal.aborted) throw unavailable();
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      signal.removeEventListener("abort", abort);
      active++;
      resolve();
    };
    const abort = () => {
      const index = queue.indexOf(start);
      if (index >= 0) queue.splice(index, 1);
      reject(unavailable());
    };
    if (active < ATTACHMENT_LIMITS.concurrent) start();
    else { queue.push(start); signal.addEventListener("abort", abort, { once: true }); }
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
    queue.shift()?.();
  };
}

function mime(path: string) {
  const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm" };
  return types[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Canonical SDK fetch carries actor authentication; no signed/public fallback. */
export async function downloadAuthenticatedAttachment(bucket: string, path: string, signal: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, ATTACHMENT_LIMITS.timeoutMs);
  let release: (() => void) | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!bucket || !path || path.startsWith("/") || path.split("/").some(part => part === ".." || part === ".")) throw unavailable();
    release = await acquire(controller.signal);
    if (controller.signal.aborted) throw unavailable();
    const { data, error } = await supabase.storage.from(bucket).download(path, {}, { signal: controller.signal, cache: "no-store" }).asStream();
    if (error || !data || controller.signal.aborted) { await data?.cancel(); throw unavailable(); }
    reader = data.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (controller.signal.aborted) throw unavailable();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > ATTACHMENT_LIMITS.fileBytes) { controller.abort(); throw unavailable(); }
      chunks.push(item.value);
    }
    return new Blob(chunks, { type: mime(path) });
  } catch { throw unavailable(); }
  finally {
    try { await reader?.cancel(); } catch { /* Safe cleanup only. */ }
    reader?.releaseLock();
    release?.();
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}