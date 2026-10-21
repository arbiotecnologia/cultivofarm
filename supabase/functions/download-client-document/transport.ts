import { validSnapshot, type Snapshot, type Transport } from './download.ts';

export interface ActorProof {
  rpc(path: string, signal: AbortSignal): Promise<unknown>;
}
/** Service identity owns bytes only. It never proves authority or accepts a bucket. */
export function createTransport(actor: ActorProof, bytes: (path: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array> | null>): Transport {
  let approved: Snapshot | null = null;
  return {
    authorize: async (path, signal) => {
      approved = null;
      const value = await actor.rpc(path, signal);
      if (signal.aborted || !value || typeof value !== 'object') return null;
      const row = value as Partial<Snapshot>;
      if (typeof row.actor !== 'string' || typeof row.tenant !== 'string' || typeof row.document !== 'string' ||
        typeof row.client !== 'string' || typeof row.path !== 'string' || !Array.isArray(row.roles) ||
        !row.roles.every(r => typeof r === 'string') || (row.size !== null && typeof row.size !== 'number') ||
        (row.mime !== null && typeof row.mime !== 'string')) return null;
      const snapshot: Snapshot = { actor: row.actor, tenant: row.tenant, document: row.document,
        client: row.client, path: row.path, roles: row.roles, size: row.size, mime: row.mime };
      if (!validSnapshot(snapshot, path)) return null;
      approved = snapshot;
      return snapshot;
    },
    download: async (path, signal) => {
      if (signal.aborted || !approved || approved.path !== path) return null;
      approved = null; // one use, no cached authority between operations
      return bytes(path, signal);
    },
  };
}