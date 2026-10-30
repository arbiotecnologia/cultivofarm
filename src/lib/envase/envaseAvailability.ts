import type { EnvaseAttempt, EnvaseRpc } from './envaseFlow';

export const ENVASE_CAPABILITY_RPC = 'rpc_envase_capability_v1';
/** Exact availability only; the writer must independently authorize the transaction. */
export function envaseCapabilityMatches(data: unknown, attempt: EnvaseAttempt): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const v = data as Record<string, unknown>;
  const keys = ['capability', 'available', 'actor_id', 'organization_id', 'lote_id', 'os_id', 'programacao_id'];
  return Object.keys(v).length === keys.length && keys.every(k => k in v) &&
    v.capability === 'envase_isolated_v1' && v.available === true &&
    v.actor_id === attempt.actorId && v.organization_id === attempt.orgId &&
    v.lote_id === attempt.args.p_lote_id && v.os_id === attempt.args.p_os_id && v.programacao_id === attempt.args.p_programacao_id;
}
export async function probeEnvaseAvailability(rpc: EnvaseRpc, attempt: EnvaseAttempt, fence: () => void): Promise<boolean> {
  fence();
  try {
    const { data, error } = await rpc(ENVASE_CAPABILITY_RPC, {
      p_lote: attempt.args.p_lote_id, p_os: attempt.args.p_os_id,
      p_prog: attempt.args.p_programacao_id, p_origem: attempt.args.p_origem,
    });
    fence();
    return !error && envaseCapabilityMatches(data, attempt);
  } catch { return false; }
}