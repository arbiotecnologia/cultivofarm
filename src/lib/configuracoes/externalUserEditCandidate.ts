import { construirProfilePayload, edicaoBemSucedida, type ArgsEdicaoUsuario } from './edicaoUsuarioRpc';
import { tipoAcessoDoUsuario } from './userLinks';
import { EXTERNAL_USER_EDIT_PHASE2_REVIEWED } from './externalUserEditGate';
import { validatePhoneBR } from '@/lib/masks';
import { NOME_MIN, NOME_MAX } from './usuariosValidation';

export { EXTERNAL_USER_EDIT_PHASE2_REVIEWED } from './externalUserEditGate';
export type CommonExternalEdit = {
  userId: string;
  expectedUpdatedAt: string;
  expectedVersion: string;
  idempotencyKey: string;
  reason: string;
  roles: string[];
  profile: ArgsEdicaoUsuario['profile'];
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function validateCommonExternalEdit(profile: CommonExternalEdit['profile'], reason: string) {
  const errors: Partial<Record<'nome' | 'telefone' | 'motivo', string>> = {};
  const nome = profile.nome?.trim() ?? '';
  if (nome.length < NOME_MIN || nome.length > NOME_MAX) errors.nome = `Informe o nome completo (de ${NOME_MIN} a ${NOME_MAX} caracteres).`;
  const phone = validatePhoneBR(profile.telefone, { fieldLabel: 'Telefone' });
  if (!phone.ok) errors.telefone = phone.error;
  if (reason.trim().length < 2 || reason.trim().length > 500) errors.motivo = 'Informe o motivo (de 2 a 500 caracteres).';
  return errors;
}

export function buildCommonExternalEdit(input: CommonExternalEdit) {
  const kind = tipoAcessoDoUsuario(input.roles);
  if (kind !== 'producer' && kind !== 'b2b') throw new Error('user_edit_linked_role_unavailable');
  if (!uuid.test(input.userId) || !uuid.test(input.idempotencyKey) ||
    !/^[a-f0-9]{64}$/.test(input.expectedVersion) ||
    !/^\d{4}-\d{2}-\d{2}[T ]/.test(input.expectedUpdatedAt) || Number.isNaN(Date.parse(input.expectedUpdatedAt)) ||
    input.reason.trim().length < 2 || input.reason.trim().length > 500)
    throw new Error('user_edit_invalid_input');
  if (Object.keys(validateCommonExternalEdit(input.profile, input.reason)).length) throw new Error('user_edit_invalid_input');
  return {
    p_user_id: input.userId, p_expected_updated_at: input.expectedUpdatedAt,
    p_profile: { ...construirProfilePayload(input.profile), _external_edit: {
      mode: 'common_preserve_links', expected_version: input.expectedVersion,
      idempotency_key: input.idempotencyKey, reason: input.reason.trim(),
    } },
    p_roles: [...input.roles], p_cliente_ids: [], p_principal_cliente_id: null, p_partner_id: null,
  };
}

export type CandidateClient = {
  rpc(name: 'admin_edit_user_profile_v1', args: ReturnType<typeof buildCommonExternalEdit>): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
};
export async function submitCommonExternalEditCandidate(client: CandidateClient, input: CommonExternalEdit, signal: AbortSignal) {
  if (!EXTERNAL_USER_EDIT_PHASE2_REVIEWED || signal.aborted) throw new Error('user_edit_phase_closed');
  const { data, error } = await client.rpc('admin_edit_user_profile_v1', buildCommonExternalEdit(input)).abortSignal(signal);
  // Preserve structured RPC tokens for the existing safe user-error mapper.
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('user_edit_result_unconfirmed');
  const row = data as Record<string, unknown>;
  if (!edicaoBemSucedida(row, input.userId) || row.links_preserved !== true ||
    typeof row.version !== 'string' || !/^[a-f0-9]{64}$/.test(row.version))
    throw new Error('user_edit_result_unconfirmed');
  return row;
}
