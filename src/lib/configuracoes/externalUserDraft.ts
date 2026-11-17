import { B2B_FINANCE_ROLE, B2B_FINANCE_ROLE_INSTALLED } from "@/lib/comercial/b2bFinanceRole";
import { validarNovoUsuario, type ErrosNovoUsuario, type NovoUsuarioInput } from "@/lib/configuracoes/usuariosValidation";
export const EXTERNAL_USER_ACTIVATION_REVIEWED = true; // Inactive coordinated copy only.
export type UserRegistrationKind = "internal" | "b2b" | "producer";
export const EXTERNAL_ROLES = ["parceiro_b2b", "parceiro_b2b_tecnico", "cliente_produtor"] as const;
export const EXTERNAL_LABELS: Record<string, string> = { parceiro_b2b: "Gestor B2B", parceiro_b2b_tecnico: "Técnico B2B", cliente_produtor: "Cliente/Produtor", [B2B_FINANCE_ROLE]: "Financeiro B2B" };
/** Perfis oferecidos no cadastro externo; Financeiro B2B só após instalação revisada do servidor. */
export function registrationRoles(financeInstalled = B2B_FINANCE_ROLE_INSTALLED): readonly string[] {
  return financeInstalled ? [...EXTERNAL_ROLES, B2B_FINANCE_ROLE] : EXTERNAL_ROLES;
}
const PARTNER_LINK_ROLES = ["parceiro_b2b", "parceiro_b2b_tecnico", B2B_FINANCE_ROLE];
export const needsPartnerLink = (roles: readonly string[]) => roles.some((r) => PARTNER_LINK_ROLES.includes(r));
export interface ExternalUserDraft extends NovoUsuarioInput {
  principal_cliente_id?: string | null;
  verified_client_ids?: string[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateUserDraft(input: ExternalUserDraft, kind: UserRegistrationKind, financeInstalled = B2B_FINANCE_ROLE_INSTALLED): ErrosNovoUsuario {
  const allowedRoles = registrationRoles(financeInstalled);
  if (kind === "internal") {
    const errors = validarNovoUsuario(input);
    if (input.roles.some(r => EXTERNAL_ROLES.some(x => x === r) || r === B2B_FINANCE_ROLE)) errors.roles = "Selecione somente perfis internos.";
    return errors;
  }
  // Reuse name/email checks, not the legacy mutually-exclusive role validation.
  const errors = validarNovoUsuario({ ...input, roles: ["administrativo"], password: "Synthetic1" });
  if (input.password) errors.password = "Não informe senha para este cadastro.";
  if (!input.roles.length || new Set(input.roles).size !== input.roles.length || input.roles.some(r => !allowedRoles.includes(r))) errors.roles = "Selecione somente os perfis externos autorizados.";
  else if (input.roles.includes(B2B_FINANCE_ROLE) && input.roles.length !== 1) errors.roles = "Financeiro B2B não pode ser combinado com outros perfis.";
  const partner = needsPartnerLink(input.roles);
  if (partner ? !uuid.test(input.partner_id ?? "") : !!input.partner_id) errors.partner_id = partner ? "Selecione o parceiro da sua empresa." : "Produtor exclusivo não deve vincular parceiro.";
  const clients = input.cliente_ids ?? [];
  if (input.roles.includes("cliente_produtor")) {
    if (!clients.length || clients.length > 100 || new Set(clients).size !== clients.length || clients.some(id => !uuid.test(id)) || !clients.includes(input.principal_cliente_id ?? "") || clients.some(id => !input.verified_client_ids?.includes(id))) errors.cliente_ids = "Selecione clientes ativos com fazenda ativa na sua empresa e um cliente principal.";
  } else if (clients.length || input.principal_cliente_id) errors.cliente_ids = "Clientes de produtor exigem o perfil Cliente/Produtor.";
  return errors;
}
export function externalUserPayload(input: ExternalUserDraft, kind: Exclude<UserRegistrationKind, "internal">, key: string, financeInstalled = B2B_FINANCE_ROLE_INSTALLED) {
  if (Object.keys(validateUserDraft(input, kind, financeInstalled)).length || !uuid.test(key)) throw new Error("Cadastro externo inválido.");
  const roles = [...input.roles].sort();
  const partner = needsPartnerLink(roles);
  return { nome: input.nome.trim(), email: input.email.trim().toLowerCase(), roles, external_roles: [...roles],
    partner_id: partner ? input.partner_id : null,
    partner_papel: partner ? roles.includes("parceiro_b2b") ? "gestor" : roles.includes(B2B_FINANCE_ROLE) ? "financeiro" : "tecnico" : null,
    cliente_ids: roles.includes("cliente_produtor") ? [...(input.cliente_ids ?? [])] : [],
    principal_cliente_id: roles.includes("cliente_produtor") ? input.principal_cliente_id : null,
    idempotency_key: key }; // No role alias for cumulative payload, tenant, password or farm grant.
}