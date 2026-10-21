// Existing uploads UI stays 10 MiB; valid legacy bucket objects up to 20 MiB remain readable.
export const LIMITS = { bytes: 20 * 1024 * 1024, bodyBytes: 4096, timeoutMs: 15_000 } as const;
export interface Snapshot {
  actor: string; tenant: string; roles: string[]; document: string;
  client: string; path: string; size: number | null; mime: string | null;
}
export interface Transport {
  authorize(path: string, signal: AbortSignal): Promise<Snapshot | null>;
  download(path: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array> | null>;
}
const strictPath = (path: unknown): path is string => typeof path === "string" &&
  path.length > 0 && path.length <= 1024 && !/[\\%\x00-\x1f\x7f?#]/.test(path) &&
  !path.includes("://") && path.split("/").every(p => !!p && p !== "." && p !== "..");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validSnapshot(value: Snapshot, path: string): boolean {
  return UUID.test(value.actor) && UUID.test(value.tenant) && UUID.test(value.document) && UUID.test(value.client) &&
    value.path === path && path.startsWith(`${value.tenant}/clientes/${value.client}/`) &&
    value.roles.length > 0 && value.roles.every(r => typeof r === "string" && !!r) &&
    (value.size === null || (Number.isSafeInteger(value.size) && value.size >= 0));
}
export async function serveDocument(req: Request, headers: Record<string, string>, transport: Transport): Promise<Response> {
  const entered = performance.now();
  const deadline = entered + LIMITS.timeoutMs;
  const privateHeaders = { ...headers, "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Vary": "Origin, Authorization" };
  const fail = (status: number) => new Response(JSON.stringify({ error: "Documento indisponível" }), {
    status, headers: { ...privateHeaders, "Content-Type": "application/json" },
  });
  if (req.method !== "POST") return fail(405);
  if (req.signal.aborted) return fail(504);
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, LIMITS.timeoutMs);
  const STOP = Symbol("deadline");
  const aborted = new Promise<typeof STOP>(resolve => controller.signal.addEventListener("abort", () => resolve(STOP), { once: true }));
  const check = () => { if (controller.signal.aborted || performance.now() >= deadline) { abort(); throw STOP; } };
  const step = async <T>(operation: () => PromiseLike<T>): Promise<T> => {
    check();
    const result = await Promise.race([Promise.resolve(operation()), aborted]);
    check();
    if (result === STOP) throw STOP;
    return result as T;
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let bodyReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelReaders = () => {
    void reader?.cancel().catch(() => undefined);
    void bodyReader?.cancel().catch(() => undefined);
  };
  controller.signal.addEventListener("abort", cancelReaders, { once: true });
  try {
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(400);
    if (!req.body) return fail(400);
    bodyReader = req.body.getReader();
    const bodyChunks: Uint8Array[] = []; let bodySize = 0;
    while (true) {
      const item = await step(() => bodyReader ? bodyReader.read() : Promise.reject(STOP));
      if (item.done) break;
      bodySize += item.value.byteLength;
      if (bodySize > LIMITS.bodyBytes) { abort(); return fail(413); }
      bodyChunks.push(item.value);
    }
    const bodyBytes = new Uint8Array(bodySize); let offset = 0;
    for (const chunk of bodyChunks) { bodyBytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bodyBytes)); } catch { return fail(400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400);
    const record = body as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || record.bucket !== "clientes-docs" || !strictPath(record.path)) return fail(400);
    const path = record.path;
    const before = await step(() => transport.authorize(path, controller.signal));
    if (!before || !validSnapshot(before, path)) return fail(403);
    if (before.size !== null && before.size > LIMITS.bytes) return fail(413);
    const snapshot = JSON.stringify({ ...before, roles: [...before.roles].sort() });
    const stream = await step(() => transport.download(path, controller.signal).then(value => {
      if (controller.signal.aborted || performance.now() >= deadline) void value?.cancel().catch(() => undefined);
      return value;
    }));
    if (!stream) return fail(404);
    reader = stream.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const item = await step(() => reader ? reader.read() : Promise.reject(STOP));
      if (item.done) break;
      size += item.value.byteLength;
      if (size > LIMITS.bytes) { abort(); return fail(413); }
      chunks.push(new Uint8Array(item.value));
    }
    if (before.size !== null && before.size !== size) return fail(409);
    const after = await step(() => transport.authorize(path, controller.signal));
    if (!after || !validSnapshot(after, path) || JSON.stringify({ ...after, roles: [...after.roles].sort() }) !== snapshot) return fail(403);
    check();
    const bytes = new Uint8Array(size); offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    check();
    // No byte is exposed until the fresh post-read proof succeeds.
    return new Response(bytes, { headers: { ...privateHeaders, "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=\"documento\"" } });
  } catch { return fail(controller.signal.aborted ? 504 : 500); }
  finally {
    clearTimeout(timer); req.signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", cancelReaders);
    // Never await a malicious/hung cancel callback in the response path.
    cancelReaders();
    try { reader?.releaseLock(); } catch { /* pending read owns cleanup */ }
    try { bodyReader?.releaseLock(); } catch { /* pending read owns cleanup */ }
  }
}