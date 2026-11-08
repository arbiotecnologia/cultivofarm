import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResaleOsAction } from './ResaleOsAction';
const mocked = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocked.rpc } }));
const intent = { orderId: '10000000-0000-4000-8000-000000000001', itemId: '10000000-0000-4000-8000-000000000002', observed: '2026-11-08T21:12:00Z' };
const fence = { actor: 'seller', tenant: 'ARB', epoch: 1, ready: true };
const ack = { ok: true, replay: false, contract: 'B2B_RESALE_OS_V1', os_id: '10000000-0000-4000-8000-000000000003', order_id: intent.orderId, order_item_id: intent.itemId };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('candidate UI with mocked canonical SDK, never hosted', () => {
  it('closed capability never dispatches', () => {
    render(<ResaleOsAction intent={intent} fence={fence} available={false} onConfirmed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button')); expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it('click calls public endpoint once and adopts exact ACK', async () => {
    mocked.rpc.mockResolvedValue({data:ack,error:null}); const confirmed=vi.fn();
    render(<ResaleOsAction intent={intent} fence={fence} available onConfirmed={confirmed} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(confirmed).toHaveBeenCalledWith(ack));
    expect(mocked.rpc).toHaveBeenCalledTimes(1); expect(mocked.rpc.mock.calls[0][0]).toBe('rpc_b2b_resale_os_create_v1');
  });
  it('late ACK after identity change never confirms', async () => {
    let settle: ((x: unknown) => void) | undefined;
    mocked.rpc.mockImplementation(() => new Promise(r => { settle=r; })); const confirmed=vi.fn();
    const ui=render(<ResaleOsAction intent={intent} fence={fence} available onConfirmed={confirmed} />);
    fireEvent.click(screen.getByRole('button'));
    ui.rerender(<ResaleOsAction intent={intent} fence={{...fence,actor:'FSF',epoch:2}} available onConfirmed={confirmed} />);
    settle?.({data:ack,error:null});
    await screen.findByRole('alert'); expect(confirmed).not.toHaveBeenCalled();
  });
});