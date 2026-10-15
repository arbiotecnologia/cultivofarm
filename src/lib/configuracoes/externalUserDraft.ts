import { validarNovoUsuario, type ErrosNovoUsuario, type NovoUsuarioInput } from "./usuariosValidation";

// Review gate only; the existing Edge/server/RLS remain authoritative.
export const EXTERNAL_USER_ACTIVATION_REVIEWED = false;
export type UserRegistrationKind = "internal" | "b2b" | "producer";
export interface ExternalUserDraft extends NovoUsuarioInput {
  principal_cliente_id?: string | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateUserDraft(input: ExternalUserDraft, kind: UserRegistrationKind): ErrosNovoUsuario {
  const errors = validarNovoUsuario(input);
  if (kind === "internal") {
    if (input.roles.some(role => ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"].includes(role))) errors.roles = "Selecione somente perfis internos.";
    return errors;
  }
  delete errors.password; // Holder uses the existing first-access flow; never an operator password.
  if (input.password) errors.password = "Não informe senha para este cadastro.";
  const role = kind === "b2b" ? "parceiro_b2b" : "cliente_produtor";
  if (input.roles.length !== 1 || input.roles[0] !== role) errors.roles = "O perfil externo deve ser exclusivo.";
  if (kind === "b2b") {
    if (!uuid.test(input.partner_id ?? "")) errors.partner_id = "Selecione o parceiro vinculado.";
    if (input.cliente_ids?.length || input.principal_cliente_id) errors.cliente_ids = "Este cadastro deve vincular somente o parceiro.";
  } else {
    const clients = input.cliente_ids ?? [];
    if (!clients.length || clients.length > 100 || clients.some(id => !uuid.test(id)) || new Set(clients).size !== clients.length || !clients.includes(input.principal_cliente_id ?? "")) errors.cliente_ids = "Selecione clientes válidos e um cliente principal.";
    if (input.partner_id) errors.partner_id = "Este cadastro deve vincular somente os clientes selecionados.";
  }
  return errors;
}
export function externalUserPayload(input: ExternalUserDraft, kind: Exclude<UserRegistrationKind, "internal">, key: string) {
  if (Object.keys(validateUserDraft(input, kind)).length || !uuid.test(key)) throw new Error("Cadastro externo inválido.");
  return {
    nome: input.nome.trim(), email: input.email.trim().toLowerCase(),
    role: kind === "b2b" ? "parceiro_b2b" : "cliente_produtor",
    roles: [kind === "b2b" ? "parceiro_b2b" : "cliente_produtor"],
    partner_id: kind === "b2b" ? input.partner_id : null,
    partner_papel: kind === "b2b" ? "gestor" : null,
    cliente_ids: kind === "producer" ? input.cliente_ids : [],
    principal_cliente_id: kind === "producer" ? input.principal_cliente_id : null,
    idempotency_key: key,
  }; // No tenant, credential, password or technical-client authority in the payload.
}