import { beforeEach, describe, it, expect, vi } from 'vitest';
const gate = vi.hoisted(() => ({ reviewed: true }));
vi.mock('@/lib/configuracoes/externalUserEditGate', () => ({
  get EXTERNAL_USER_EDIT_PHASE2_REVIEWED() { return gate.reviewed; },
}));
import { buildCommonExternalEdit, submitCommonExternalEditCandidate, type CommonExternalEdit } from '@/lib/configuracoes/externalUserEditCandidate';
const input: CommonExternalEdit = {
  userId: '11111111-1111-4111-8111-111111111111', idempotencyKey: '22222222-2222-4222-8222-222222222222',
  expectedUpdatedAt: '2026-10-16T19:38:00Z', expectedVersion: 'a'.repeat(64), reason: 'Correção de contato',
  roles: ['cliente_produtor'], profile: { nome: 'Nome Corrigido' },
};
beforeEach(() => { gate.reviewed = true; });
describe('F2 dados comuns com gate explicitamente simulado', () => {
  it.each(['cliente_produtor', 'parceiro_b2b'])('preserva links e identidade para %s', role => {
    const args = buildCommonExternalEdit({ ...input, roles: [role] });
    expect(args.p_roles).toEqual([role]); expect(args.p_cliente_ids).toEqual([]);
    expect(args.p_partner_id).toBeNull(); expect(args.p_principal_cliente_id).toBeNull();
    expect(args.p_profile._external_edit.expected_version).toBe(input.expectedVersion);
    expect(args.p_profile).not.toHaveProperty('email'); expect(args.p_profile).not.toHaveProperty('organization_id');
  });
  it.each([['administrador'], ['parceiro_b2b_tecnico'], ['cliente_produtor', 'administrador'], []].map(roles => ({ roles })))('nega tipo bloqueado $roles', ({ roles }) => {
    expect(() => buildCommonExternalEdit({ ...input, roles })).toThrow('user_edit_linked_role_unavailable');
  });
  it.each([{ expectedVersion: 'bad' }, { idempotencyKey: 'bad' }, { reason: '' }, { reason: 'a'.repeat(501) }, { expectedUpdatedAt: '1' }])('nega contrato incompleto %j', delta => {
    expect(() => buildCommonExternalEdit({ ...input, ...delta })).toThrow('user_edit_invalid_input');
  });
  it('mesmo draft conserva UUID e hash CAS em retry manual', () => {
    expect(buildCommonExternalEdit(input)).toEqual(buildCommonExternalEdit(input));
  });
  it('gate fechado impede a chamada da integração mesmo com payload válido', async () => {
    gate.reviewed = false;
    const rpc = vi.fn();
    await expect(submitCommonExternalEditCandidate({ rpc }, input, new AbortController().signal)).rejects.toThrow('user_edit_phase_closed');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('gate aberto envia apenas dados comuns preservando os vínculos', async () => {
    gate.reviewed = true;
    const abortSignal = vi.fn().mockResolvedValue({ data: {
      success: true, user_id: input.userId, updated_at: '2026-10-16T22:01:00Z',
      links_preserved: true, version: 'b'.repeat(64),
    }, error: null });
    const rpc = vi.fn().mockReturnValue({ abortSignal });
    const signal = new AbortController().signal;
    await expect(submitCommonExternalEditCandidate({ rpc }, input, signal)).resolves.toMatchObject({ links_preserved: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_edit_user_profile_v1', buildCommonExternalEdit(input));
    expect(abortSignal).toHaveBeenCalledExactlyOnceWith(signal);
  });
});
