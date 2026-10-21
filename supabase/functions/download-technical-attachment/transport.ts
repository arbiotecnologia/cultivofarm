// Promoted runtime 2026-10-21 from candidate scripts/technical-attachment-http-20261021 @ 3cd1e4b6.
import { BUCKET, validSnapshot, type Snapshot, type Transport } from "./core.ts";

export interface ActorProof { rpc(path: string, signal: AbortSignal): Promise<unknown> }
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Server-only byte read for consultor-arquivos; never follows redirects, never caches. */
export async function fetchStorageBytes(fetchImpl: Fetch, url: string, key: string, path: string, signal: AbortSignal) {
  if (signal.aborted) return null;
  const h: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) h.Authorization = `Bearer ${key}`;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  let response: Response;
  try {
    response = await fetchImpl(`${url}/storage/v1/object/authenticated/${BUCKET}/${encoded}`,
      { headers: h, signal, cache: "no-store", redirect: "error" });
  } catch { return null; }
  if (!response.ok || response.redirected || response.status !== 200 || signal.aborted) {
    void response.body?.cancel().catch(() => undefined); return null;
  }
  return response.body;
}

/** Bytes only after an approved snapshot for that exact path; one use; bucket alone never authorizes. */
export function createTransport(actor: ActorProof, bytes: (path: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array> | null>): Transport {
  let approved: Snapshot | null = null;
  return {
    authorize: async (path, signal) => {
      approved = null;
      const value = await actor.rpc(path, signal);
      if (signal.aborted || !value || typeof value !== "object") return null;
      const r = value as Partial<Snapshot>;
      if (typeof r.actor !== "string" || typeof r.tenant !== "string" || typeof r.document !== "string" ||
        typeof r.visit !== "string" || typeof r.client !== "string" || typeof r.path !== "string" ||
        !Array.isArray(r.roles) || !r.roles.every(x => typeof x === "string") ||
        (r.size !== null && typeof r.size !== "number") || (r.mime !== null && typeof r.mime !== "string")) return null;
      const s: Snapshot = { actor: r.actor, tenant: r.tenant, document: r.document, visit: r.visit,
        client: r.client, path: r.path, roles: r.roles, size: r.size ?? null, mime: r.mime ?? null };
      if (!validSnapshot(s, path)) return null;
      approved = s;
      return s;
    },
    download: async (path, signal) => {
      if (signal.aborted || !approved || approved.path !== path) return null;
      approved = null;
      return bytes(path, signal);
    },
  };
}
