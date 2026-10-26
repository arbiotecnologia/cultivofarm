// INACTIVE UI adapter: no runtime imports, no tokens, no client-generated keys.
import { adopt, read } from './journal-prototype.mjs';
export const ORDER_JOURNAL_ENABLED = false;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseJournal(value) {
 if (!value || value.contract !== 'C2_ORDER_JOURNAL_V1' || !uuid.test(value.key) ||
     !Number.isSafeInteger(value.generation) || value.generation < 1 ||
     !['reserved','uncertain','closed','committed'].includes(value.state)) throw Error('contract_invalid');
 if (value.state === 'committed' && (!uuid.test(value.order_id) || typeof value.numero !== 'string' || !value.numero.trim())) throw Error('contract_invalid');
 return value;
}
export async function recoverJournal({ enabled = ORDER_JOURNAL_ENABLED, scope, current, rpc, expected, acknowledge, advance = false }) {
 if (!enabled || !current()) throw Error('recovery_disabled_or_context');
 // The authenticated RPC response is the capability. Missing RPC/error never falls back.
 const result = parseJournal(await rpc({ expected, acknowledge, advance }));
 if (!current()) throw Error('context_changed');
 await adopt(scope, { schema: 1, key: result.key, generation: result.generation,
  state: result.state === 'reserved' ? 'uncertain' : result.state }, current);
 if (!current()) throw Error('context_changed');
 return result; // UI may show committed number; MUST NOT clear an edited cart here.
}
export async function dispatchJournal({ enabled = ORDER_JOURNAL_ENABLED, scope, current, recover, create, expected }) {
 if (!enabled || !current()) throw Error('recovery_disabled_or_context');
 const canonical = parseJournal(await recover());
 if (!current() || canonical.key !== expected.key || canonical.generation !== expected.generation ||
     !['reserved','uncertain'].includes(canonical.state)) throw Error('dispatch_blocked');
 const local = await read(scope);
 if (!current() || local.key !== canonical.key || local.generation !== canonical.generation || local.state !== 'uncertain') throw Error('dispatch_blocked');
 const result = await create(canonical.key);
 if (!current()) throw Error('context_changed');
 return result; // caller still compares full current cart before cleanup/navigation.
}