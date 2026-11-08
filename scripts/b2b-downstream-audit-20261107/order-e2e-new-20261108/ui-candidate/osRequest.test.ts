import { describe, expect, it, vi } from 'vitest';
import { createOsRequest, type Fence, type Rpc } from './osRequest';
const intent = { orderId: '10000000-0000-4000-8000-000000000001', itemId: '10000000-0000-4000-8000-000000000002', observed: '2026-11-08T21:12:00Z' };
const good = { ok: true, replay: false, contract: 'B2B_RESALE_OS_V1', order_id: intent.orderId, order_item_id: intent.itemId, os_id: '10000000-0000-4000-8000-000000000003' };
const scope: Fence = { actor: 'seller', tenant: 'ARB', epoch: 1, ready: true };
describe('OS caller candidate — no network', () => {
  it('calls only endpoint with observed CAS and no actor/tenant/economic input', async () => {
    const rpc = vi.fn(async () => ({ data: good, error: null }));
    await expect(createOsRequest(rpc, () => scope, () => 'request-key-0001')(intent)).resolves.toEqual(good);
    expect(rpc).toHaveBeenCalledWith('rpc_b2b_resale_os_create_v1', { p_order_id: intent.orderId, p_order_item_id: intent.itemId, p_expected_updated_at: intent.observed, p_request_key: 'request-key-0001' });
  });
  it('closed session causes zero dispatch', async () => {
    const rpc = vi.fn(); await expect(createOsRequest(rpc, () => ({ ...scope, ready: false }))(intent)).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  });
  it('invalid observed timestamp causes zero dispatch', async () => {
    const rpc = vi.fn(); await expect(createOsRequest(rpc, () => scope)({ ...intent, observed: '2026-11-08' })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
  });
  it('uncertain transport retains exact request key and refuses changed CAS', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValue({ data: { ...good, replay: true }, error: null });
    const run = createOsRequest(rpc as Rpc, () => scope, () => 'request-key-0001');
    await expect(run(intent)).rejects.toThrow(); await expect(run({ ...intent, observed: '2026-11-08T21:13:00Z' })).rejects.toThrow();
    await expect(run(intent)).resolves.toMatchObject({ replay: true }); expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it('synchronous lock prevents concurrent dispatch', async () => {
    let resolve: ((x: { data: unknown; error: null }) => void) | undefined;
    const rpc = vi.fn(() => new Promise<{data: unknown;error: null}>(r => { resolve = r; }));
    const run = createOsRequest(rpc, () => scope); const first = run(intent);
    await expect(run(intent)).rejects.toThrow(); resolve?.({ data: good, error: null }); await first; expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('scope change rejects late ACK and never reuses pending key across actors', async () => {
    let active = scope;
    const rpc = vi.fn(async () => { active = { ...scope, actor: 'FSF' }; return { data: good, error: null }; });
    const run = createOsRequest(rpc, () => active); await expect(run(intent)).rejects.toThrow('Sessão alterada'); await expect(run(intent)).rejects.toThrow('não reconciliada'); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{...good, order_id: intent.itemId}, {...good, ok: false}, {...good, os_id: null}, {...good, contract: 'other'}])('rejects substituted/negative ACK', async data => {
    await expect(createOsRequest(async () => ({data,error:null}), () => scope)(intent)).rejects.toThrow();
  });
});