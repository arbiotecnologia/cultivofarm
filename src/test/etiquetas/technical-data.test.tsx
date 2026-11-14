import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ roles: ['gestor'], ready: true, actor: 'actor', tenant: 'tenant', epoch: 0, rpc: vi.fn(), lease: true }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ roles: state.roles, user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true }, loading: false, authzReady: state.ready, authzEpoch: state.epoch, checkAuthzAccess: () => state.lease }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { LabelTechnicalDataDialog } from '@/components/etiquetas/LabelTechnicalDataDialog';
const lote = '11111111-1111-4111-8111-111111111111';
const produto = '22222222-2222-4222-8222-222222222222';
const perfil = '33333333-3333-4333-8333-333333333333';
beforeEach(() => { Object.assign(state, { roles: ['gestor'], ready: true, actor: 'actor', tenant: 'tenant', epoch: 0, lease: true }); state.rpc.mockReset(); });
afterEach(cleanup);
function mount(kind: 'validade' | 'toxicidade' = 'validade') { return render(<LabelTechnicalDataDialog kind={kind} targetId={kind === 'validade' ? lote : produto} targetName="QA declarado" />); }
function fill(kind: 'validade' | 'toxicidade' = 'validade') {
  fireEvent.click(screen.getByRole('button', { name: kind === 'validade' ? 'Validade do lote' : 'Toxicidade do produto' }));
  fireEvent.change(screen.getByLabelText(kind === 'validade' ? 'Validade aprovada' : 'Toxicidade aprovada'), { target: { value: kind === 'validade' ? '2099-12-31' : 'DADO DE TESTE — toxicidade simulada para homologação.' } });
  fireEvent.change(screen.getByLabelText('Referência técnica'), { target: { value: ' QA-REFERENCIA ' } });
  return screen.getByRole('button', { name: kind === 'validade' ? 'Aprovar validade' : 'Cadastrar toxicidade' });
}
it.each(['gestor', 'administrador'])('%s aprova validade por lote sem argumentos de tenant/ator', async role => {
  state.roles = [role]; state.rpc.mockResolvedValue({ data: null, error: null }); mount(); fireEvent.click(fill());
  await screen.findByText(/Validade aprovada para este lote/);
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith('rpc_aprovar_validade_etiqueta_lote', { p_lote_id: lote, p_validade: '2099-12-31', p_referencia: 'QA-REFERENCIA' });
});
it('toxicidade afeta produto e confirma UUID de perfil', async () => {
  state.rpc.mockResolvedValue({ data: perfil, error: null }); mount('toxicidade'); fireEvent.click(fill('toxicidade'));
  await screen.findByText('Toxicidade cadastrada para este produto.');
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith('rpc_cadastrar_toxicidade_etiqueta_produto', { p_produto_id: produto, p_toxicidade: 'DADO DE TESTE — toxicidade simulada para homologação.', p_referencia: 'QA-REFERENCIA' });
});
it.each(['operador_onfarm', 'financeiro', 'consultor_tecnico', 'cliente_produtor', 'parceiro_b2b', 'superadmin'])('%s não recebe formulário nem writer', role => { state.roles = [role]; mount(); expect(screen.queryByRole('button')).toBeNull(); expect(state.rpc).not.toHaveBeenCalled(); });
it('gestor com contexto externo continua negado', () => { state.roles = ['gestor', 'parceiro_b2b']; mount(); expect(screen.queryByRole('button')).toBeNull(); });
it('sessão pausada não monta ação', () => { state.ready = false; mount(); expect(screen.queryByRole('button')).toBeNull(); });
it('referência ausente bloqueia chamada', () => { mount(); const submit = fill(); fireEvent.change(screen.getByLabelText('Referência técnica'), { target: { value: '' } }); expect(submit).toBeDisabled(); fireEvent.click(submit); expect(state.rpc).not.toHaveBeenCalled(); });
it('validade impossível é negada antes da RPC sem normalizar calendário', () => { mount(); fill(); const date = screen.getByLabelText('Validade aprovada'); fireEvent.change(date, { target: { value: '2099-02-31' } }); fireEvent.submit(date.closest('form') as HTMLFormElement); expect(state.rpc).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent(/validade/i); });
it('negação real do servidor preserva rascunho sem retry', async () => { state.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'deny' }, status: 403 }); mount(); fireEvent.click(fill()); await screen.findByRole('alert'); expect(screen.getByRole('alert')).toHaveTextContent(/servidor recusou/); expect(screen.getByLabelText('Validade aprovada')).toHaveValue('2099-12-31'); expect(state.rpc).toHaveBeenCalledTimes(1); });
it('erro de dados é exibido sem sucesso', async () => { state.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Referência recusada pelo servidor' }, status: 400 }); mount(); fireEvent.click(fill()); expect(await screen.findByRole('alert')).toHaveTextContent('Referência recusada'); expect(screen.queryByRole('status')).toBeNull(); });
it('UUID de perfil ausente bloqueia confirmação e repetição', async () => { state.rpc.mockResolvedValue({ data: null, error: null }); mount('toxicidade'); const submit = fill('toxicidade'); fireEvent.click(submit); await screen.findByRole('alert'); expect(submit).toBeDisabled(); expect(screen.queryByRole('status')).toBeNull(); });
it('falha de rede mantém resultado incerto sem retry', async () => { state.rpc.mockRejectedValue(new TypeError('Failed to fetch')); mount(); const submit = fill(); fireEvent.click(submit); await screen.findByRole('alert'); expect(submit).toBeDisabled(); expect(state.rpc).toHaveBeenCalledTimes(1); });
it('lease revogada antes do clique impede primeira RPC', () => { mount(); const submit = fill(); state.lease = false; fireEvent.click(submit); expect(state.rpc).not.toHaveBeenCalled(); });
it('duplo clique tem uma chamada e ACK tardio não atravessa troca de tenant', async () => {
  let resolve: ((r: unknown) => void) | undefined; state.rpc.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = mount(); const submit = fill(); fireEvent.click(submit); fireEvent.click(submit); expect(state.rpc).toHaveBeenCalledTimes(1);
  state.tenant = 'other'; state.epoch++; view.rerender(<LabelTechnicalDataDialog kind="validade" targetId={lote} targetName="QA declarado" />);
  await act(async () => { resolve?.({ data: null, error: null }); }); expect(screen.queryByText(/Validade aprovada para este lote/)).toBeNull();
});