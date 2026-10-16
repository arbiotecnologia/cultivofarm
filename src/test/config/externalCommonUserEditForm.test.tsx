import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const transport = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn(), gate: true }));
vi.mock('@/lib/configuracoes/externalUserEditGate', () => ({ get EXTERNAL_USER_EDIT_PHASE2_REVIEWED() { return transport.gate; } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rest: transport,
  rpc(this: { rest: typeof transport }, name: string, args: unknown) { return this.rest.rpc(name, args); },
} }));
import { ExternalCommonUserEditForm, type ExternalCommonTarget } from '@/components/configuracoes/ExternalCommonUserEditForm';

const target: ExternalCommonTarget = {
  user_id: '11111111-1111-4111-8111-111111111111', updated_at: '2026-10-16T22:00:00Z',
  roles: ['cliente_produtor'], nome: 'Nome Original', telefone: '11999999999', cargo: 'Original',
  cpf_cnpj: null, crea: 'Preservado', especialidade: 'Preservada',
};
const base = {
  target, scope: 'actor:tenant:target:1', actorId: 'actor', organizationId: 'tenant',
  ready: true, expectedVersion: 'a'.repeat(64), snapshotReady: true,
  isCurrent: () => true, onSuccess: vi.fn(), onError: vi.fn(),
};
const result = { data: { success: true, user_id: target.user_id, updated_at: '2026-10-16T22:01:00Z', links_preserved: true, version: 'b'.repeat(64) }, error: null };
function deferred() {
  let resolve: (value: typeof result) => void = () => undefined;
  const promise = new Promise<typeof result>(r => { resolve = r; });
  return { promise, resolve };
}
function form(props = base, key = '1') {
  return <Dialog open><DialogContent aria-describedby={undefined}><DialogTitle>Editar Usuário</DialogTitle>
    <ExternalCommonUserEditForm key={key} {...props} />
  </DialogContent></Dialog>;
}
const reason = () => fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Correção de contato' } });
const save = () => screen.getByRole('button', { name: 'Salvar Alterações' });
beforeEach(() => {
  vi.clearAllMocks(); transport.gate = true;
  transport.rpc.mockReturnValue({ abortSignal: transport.abortSignal });
  transport.abortSignal.mockResolvedValue(result);
});
afterEach(cleanup);

describe('diálogo real de dados comuns externos (gate simulado só no teste)', () => {
  it.each(['cliente_produtor', 'parceiro_b2b'])('envia %s pela RPC canônica preservando receiver, roles, links e campos não exibidos', async role => {
    render(form({ ...base, target: { ...target, roles: [role] } })); reason();
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Corrigido' } });
    fireEvent.click(save());
    await waitFor(() => expect(base.onSuccess).toHaveBeenCalledTimes(1));
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith('admin_edit_user_profile_v1', expect.objectContaining({
      p_user_id: target.user_id, p_roles: [role], p_cliente_ids: [], p_partner_id: null, p_principal_cliente_id: null,
      p_profile: expect.objectContaining({ cargo: 'Corrigido', crea: 'Preservado', especialidade: 'Preservada',
        _external_edit: expect.objectContaining({ expected_version: 'a'.repeat(64), mode: 'common_preserve_links' }) }),
    }));
    expect(transport.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });
  it('nega motivo, nome e telefone inválidos antes de qualquer RPC', () => {
    render(form()); expect(save()).toBeDisabled(); reason();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'x' } });
    expect(save()).toBeDisabled(); fireEvent.click(save());
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome Corrigido' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '123' } });
    expect(save()).toBeDisabled(); fireEvent.click(save()); expect(transport.rpc).not.toHaveBeenCalled();
  });
  it.each([{ expectedVersion: undefined }, { snapshotReady: false }, { ready: false }])('nega snapshot/escopo indisponível %j', delta => {
    render(form({ ...base, ...delta })); reason(); fireEvent.click(save()); expect(transport.rpc).not.toHaveBeenCalled();
  });
  it('gate fechado nega mesmo os dados válidos', () => {
    transport.gate = false; render(form()); reason(); fireEvent.click(save()); expect(transport.rpc).not.toHaveBeenCalled();
  });
  it('trava síncrona impede duplo clique no mesmo evento', async () => {
    const request = deferred(); transport.abortSignal.mockReturnValue(request.promise);
    render(form()); reason(); const button = save();
    act(() => { button.click(); button.click(); });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve(result));
  });
  it.each(['success', 'error'])('fechar e reabrir outro alvo descarta %s antigo sem toast/cache/fechamento', async outcome => {
    const request = deferred(); transport.abortSignal.mockReturnValue(request.promise);
    const oldSuccess = vi.fn(); const oldError = vi.fn(); const newSuccess = vi.fn(); const newError = vi.fn();
    const view = render(form({ ...base, onSuccess: oldSuccess, onError: oldError })); reason(); fireEvent.click(save());
    view.rerender(<></>); // close/unmount then another target/dialog
    view.rerender(form({ ...base, target: { ...target, user_id: '22222222-2222-4222-8222-222222222222', nome: 'Outro Alvo' }, scope: 'other', onSuccess: newSuccess, onError: newError }, '2'));
    await act(async () => request.resolve(outcome === 'success' ? result : { ...result, data: result.data, error: { message: 'user_edit_forbidden' } } as unknown as typeof result));
    expect(screen.getByLabelText('Nome')).toHaveValue('Outro Alvo');
    for (const callback of [oldSuccess, oldError, newSuccess, newError]) expect(callback).not.toHaveBeenCalled();
  });
  it.each([{ actorId: 'other' }, { organizationId: 'other' }, { ready: false }, { scope: 'other' }])('descarta resposta após mudança de identidade/tenant %j', async delta => {
    const request = deferred(); transport.abortSignal.mockReturnValue(request.promise);
    const view = render(form()); reason(); fireEvent.click(save()); view.rerender(form({ ...base, ...delta }));
    await act(async () => request.resolve(result));
    expect(base.onSuccess).not.toHaveBeenCalled(); expect(base.onError).not.toHaveBeenCalled();
  });
  it('callback do pai também impede resultado após fechamento síncrono antes do render', async () => {
    let open = true; const request = deferred(); transport.abortSignal.mockReturnValue(request.promise);
    render(form({ ...base, isCurrent: () => open })); reason(); fireEvent.click(save()); open = false;
    await act(async () => request.resolve(result)); expect(base.onSuccess).not.toHaveBeenCalled(); expect(base.onError).not.toHaveBeenCalled();
  });
  it('retry manual do mesmo payload mantém chave, sem retry automático', async () => {
    transport.abortSignal.mockResolvedValueOnce({ data: null, error: { message: 'user_edit_invalid_fields' } }).mockResolvedValueOnce(result);
    render(form()); reason(); fireEvent.click(save());
    await waitFor(() => expect(base.onError).toHaveBeenCalledTimes(1));
    expect(transport.rpc).toHaveBeenCalledTimes(1); fireEvent.click(save());
    await waitFor(() => expect(base.onSuccess).toHaveBeenCalledTimes(1));
    const keys = transport.rpc.mock.calls.map(call => call[1].p_profile._external_edit.idempotency_key);
    expect(keys[0]).toBe(keys[1]);
  });
  it('payload alterado gera outra chave após erro conhecido', async () => {
    transport.abortSignal.mockResolvedValueOnce({ data: null, error: { message: 'user_edit_invalid_fields' } }).mockResolvedValueOnce(result);
    render(form()); reason(); fireEvent.click(save()); await waitFor(() => expect(base.onError).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Outro cargo' } }); fireEvent.click(save());
    await waitFor(() => expect(base.onSuccess).toHaveBeenCalled());
    expect(transport.rpc.mock.calls[0][1].p_profile._external_edit.idempotency_key).not.toBe(transport.rpc.mock.calls[1][1].p_profile._external_edit.idempotency_key);
  });
  it.each([{ data: null, error: null }, { data: { ...result.data, updated_at: '1' }, error: null }, { data: null, error: { message: 'user_edit_conflict' } }])('ambiguidade/CAS exige reload e não repete %j', async response => {
    transport.abortSignal.mockResolvedValue(response); render(form()); reason(); fireEvent.click(save());
    await waitFor(() => expect(base.onError).toHaveBeenCalledTimes(1));
    const button = screen.getByRole('button', { name: 'Recarregue a lista para tentar novamente' });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(transport.rpc).toHaveBeenCalledTimes(1);
  });
});