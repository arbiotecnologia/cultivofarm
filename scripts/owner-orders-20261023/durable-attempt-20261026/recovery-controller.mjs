// INACTIVE UI adapter: no runtime imports, no tokens, no client-generated keys.
import { adopt, beforeDispatch, parseCanonical } from './journal-prototype.mjs';
export const ORDER_JOURNAL_ENABLED = false;
export const parseJournal = parseCanonical;
export async function recoverJournal({ enabled = ORDER_JOURNAL_ENABLED, scope, current, rpc, expected, acknowledge, advance = false }) {
 if (!enabled || !current()) throw Error('recovery_disabled_or_context');
 // The authenticated RPC response is the capability. Missing RPC/error never falls back.
 const result = parseJournal(await rpc({ expected, acknowledge, advance }));
 if (!current()) throw Error('context_changed');
 // Explicit advance must first persist the confirmed predecessor terminal state.
 // A response alone cannot silently jump an unresolved local generation.
 await adopt(scope, { schema: 1, key: result.key, generation: result.generation,
  state: result.state === 'reserved' ? 'uncertain' : result.state }, current);
 if (!current()) throw Error('context_changed');
 return result; // UI may show committed number; MUST NOT clear an edited cart here.
}
export async function dispatchJournal({ enabled = ORDER_JOURNAL_ENABLED, scope, current, recover, create, expected }) {
 if (!enabled || !current()) throw Error('recovery_disabled_or_context');
 const key = await beforeDispatch(scope,expected,current,recover);
 const result = await create(key);
 if (!current()) throw Error('context_changed');
 return result; // caller still compares full current cart before cleanup/navigation.
}