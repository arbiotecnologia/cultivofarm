// REVIEW ONLY — intended path supabase/functions/download-technical-attachment/core.ts.
// Same contract as download-client-document v3 (clientes-docs untouched), scoped to consultor-arquivos only.
export const LIMITS = { bytes: 20 * 1024 * 1024, bodyBytes: 4096, timeoutMs: 15_000 } as const;
export const BUCKET = "consultor-arquivos" as const;
const MEDIA = new Set(["foto", "audio", "documento"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Snapshot {
  actor: string; tenant: string; roles: string[]; document: string;
  visit: string; client: string; path: string; size: number | null; mime: string | null;
}
export interface Transport {
  authorize(path: string, signal: AbortSignal): Promise<Snapshot | null>;
  download(path: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array> | null>;
}
export const strictPath = (path: unknown): path is string => typeof path === "string" &&
  path.length > 0 && path.length <= 1024 && !/[\\%\x00-\x1f\x7f?#]/.test(path) &&
  !path.includes("://") && path.split("/").every(p => !!p && p !== "." && p !== "..");

export function validSnapshot(v: Snapshot, path: string): boolean {
  const parts = path.split("/");
  return UUID.test(v.actor) && UUID.test(v.tenant) && UUID.test(v.document) && UUID.test(v.visit) && UUID.test(v.client) &&
    v.path === path && parts.length === 4 &&
    parts[0] === v.tenant && parts[1] === v.visit && MEDIA.has(parts[2]) && /^[A-Za-z0-9_.-]+$/.test(parts[3]) &&
    Array.isArray(v.roles) && v.roles.length > 0 && v.roles.every(r => typeof r === "string" && !!r) &&
    (v.size === null || (Number.isSafeInteger(v.size) && v.size >= 0)) &&
    (v.mime === null || typeof v.mime === "string");
}
const canonical = (s: Snapshot) => JSON.stringify({ ...s, roles: [...s.roles].sort() });

export async function serveTechnicalAttachment(req: Request, headers: Record<string, string>, transport: Transport): Promise<Response> {
  const deadline = performance.now() + LIMITS.timeoutMs; // absolute: covers body, both proofs and bytes
  const priv = { ...headers, "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
    "Surrogate-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Vary": "Origin, Authorization" };
  const fail = (status: number) => new Response(JSON.stringify({ error: "Documento indisponível" }), {
    status, headers: { ...priv, "Content-Type": "application/json" } });
  if (req.method !== "POST") return fail(405);
  if (req.signal.aborted) return fail(504);
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, LIMITS.timeoutMs);
  const STOP = Symbol("deadline");
  const stopped = new Promise<typeof STOP>(r => controller.signal.addEventListener("abort", () => r(STOP), { once: true }));
  const check = () => { if (controller.signal.aborted || performance.now() >= deadline) { abort(); throw STOP; } };
  const step = async <T>(op: () => PromiseLike<T>): Promise<T> => {
    check();
    const result = await Promise.race([Promise.resolve(op()), stopped]);
    check();
    if (result === STOP) throw STOP;
    return result as T;
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let bodyReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelReaders = () => { void reader?.cancel().catch(() => undefined); void bodyReader?.cancel().catch(() => undefined); };
  controller.signal.addEventListener("abort", cancelReaders, { once: true });
  try {
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !req.body) return fail(400);
    bodyReader = req.body.getReader();
    const bodyChunks: Uint8Array[] = []; let bodySize = 0;
    while (true) {
      const item = await step(() => bodyReader ? bodyReader.read() : Promise.reject(STOP));
      if (item.done) break;
      bodySize += item.value.byteLength;
      if (bodySize > LIMITS.bodyBytes) { abort(); return fail(413); }
      bodyChunks.push(item.value);
    }
    const raw = new Uint8Array(bodySize); let off = 0;
    for (const c of bodyChunks) { raw.set(c, off); off += c.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return fail(400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400);
    const rec = body as Record<string, unknown>;
    if (Object.keys(rec).length !== 2 || rec.bucket !== BUCKET || !strictPath(rec.path)) return fail(400);
    const path = rec.path;
    const before = await step(() => transport.authorize(path, controller.signal));
    if (!before || !validSnapshot(before, path)) return fail(403);
    if (before.size !== null && before.size > LIMITS.bytes) return fail(413);
    const proof = canonical(before);
    const stream = await step(() => transport.download(path, controller.signal).then(v => {
      if (controller.signal.aborted || performance.now() >= deadline) void v?.cancel().catch(() => undefined);
      return v;
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
    if (!after || !validSnapshot(after, path) || canonical(after) !== proof) return fail(403);
    check();
    const bytes = new Uint8Array(size); off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
    check();
    return new Response(bytes, { headers: { ...priv, "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=\"documento\"" } });
  } catch { return fail(controller.signal.aborted ? 504 : 500); }
  finally {
    clearTimeout(timer); req.signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", cancelReaders);
    cancelReaders();
    try { reader?.releaseLock(); } catch { /* pending read owns cleanup */ }
    try { bodyReader?.releaseLock(); } catch { /* pending read owns cleanup */ }
  }
}
