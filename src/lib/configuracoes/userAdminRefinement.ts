/**
 * Refinamento de "Editar Usuário" (tipo de acesso, e-mail, vínculos do consultor).
 * RPCs/Edge em scripts/user-edit-access-email-links-20261117, NÃO instaladas;
 * a UI permanece fechada até o auditor instalar e trocar este gate.
 */
import { z } from "zod";

export const USER_ADMIN_REFINEMENT_INSTALLED = true;

/**
 * Escritas de tipo de acesso e vínculos passam pelo Edge (JWT do ator verificado → núcleo service-only):
 * em produção o gatilho global de principal grava profiles.cliente_id e o guard de profiles nega isso sob JWT.
 */
export const EDGE = { userAdmin: "tenant-user-admin", emailSync: "user-email-change-sync" } as const;
export const RPC = {
  emailStatus: "tenant_admin_email_change_status_v1",
  emailCancel: "tenant_admin_email_change_cancel_v1",
  searchClientes: "tenant_admin_search_clientes_v1",
  consultorLinks: "tenant_admin_consultor_links_v1",
  mySessionState: "my_session_authz_state_v1",
  myEmailPending: "user_email_change_my_pending_v1",
  myEmailAccept: "user_email_change_accept_v1",
  myEmailDecline: "user_email_change_decline_v1",
  myEmailRelease: "user_email_change_release_v1",
  myEmailSync: "user_email_change_sync_self_v1",
} as const;
/** Pedido de e-mail é registrado por RPC; nenhum link é gerado pelo administrador. */
export const RPC_EMAIL_REQUEST = "tenant_admin_email_change_request_v1";
export const PAGE_SIZE = 20;

export type AccessTarget = "internal" | "b2b" | "producer" | "b2b_finance";
export const ACCESS_TARGET_LABEL: Record<AccessTarget, string> = {
  internal: "Interno", b2b: "Parceiro B2B", producer: "Cliente/Produtor", b2b_finance: "Financeiro B2B",
};
/** Destinos oferecidos: Financeiro B2B só após 02c instalado (gate do perfil). */
export function accessTargets(financeInstalled: boolean): AccessTarget[] {
  return financeInstalled ? ["internal", "b2b", "producer", "b2b_finance"] : ["internal", "b2b", "producer"];
}
export const B2B_FINANCE = "parceiro_b2b_financeiro";
/** Vínculo observado (PARTNER_LINK_V1) — sua versão é o CAS enviado ao servidor. */
const partnerLink = z.object({
  contract: z.literal("PARTNER_LINK_V1"), ambiguous: z.boolean(), foreign: z.boolean(),
  link: z.object({ partner_id: z.string().uuid(), papel: z.enum(["gestor", "tecnico", "financeiro"]), version: z.number().int().min(1) }).strict().nullable(),
}).strict();
export type PartnerLinkState = z.infer<typeof partnerLink>;
export function parsePartnerLink(raw: unknown): PartnerLinkState {
  const r = partnerLink.safeParse(raw); if (!r.success) throw new Error("partner_link_invalid"); return r.data;
}
/** A transição envolve o papel financeiro (destino ou origem) e, portanto, exige CAS do vínculo. */
export const needsLinkCas = (to: AccessTarget, current: string[]) => to === "b2b_finance" || current.includes(B2B_FINANCE);

export const emailSchema = z.string().trim().toLowerCase().max(254)
  .regex(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/, "Informe um e-mail válido.");
export const reasonSchema = z.string().trim().min(5, "Informe o motivo (mín. 5 caracteres).").max(500, "Motivo muito longo.");

/** Validação local da transição (o servidor revalida tudo). */
const INTERNAL = ["administrador","gestor","administrativo","financeiro","gestor_comercial","producao","aplicador","operador_onfarm","consultor_tecnico","tecnico_agronomo","vendedor"];
const EXTERNAL = ["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico", "parceiro_b2b_financeiro"];
export const B2B_ROLES = ["parceiro_b2b", "parceiro_b2b_tecnico"] as const;
const ALLOWED: Record<AccessTarget, string[]> = { internal: INTERNAL, b2b: ["parceiro_b2b", "parceiro_b2b_tecnico"], producer: ["cliente_produtor"], b2b_finance: ["parceiro_b2b_financeiro"] };
/** Papéis atuais que não convivem com o destino (espelho da regra do servidor). Compatíveis são preservados. */
export function incompatibleRoles(current: string[], to: AccessTarget): string[] {
  return current.filter((r) => !ALLOWED[to].includes(r)).sort();
}

export function validateTransition(i: {
  actorId: string; targetId: string; from: string; to: AccessTarget;
  internalRoles: string[]; clienteId: string | null; reason: string;
  currentRoles?: string[]; removeRoles?: string[]; b2bRoles?: string[];
  link?: PartnerLinkState | null; partnerId?: string | null;
}): string | null {
  const pend = incompatibleRoles(i.currentRoles ?? [], i.to).filter((r) => !(i.removeRoles ?? []).includes(r));
  if (pend.length) return "Confirme a remoção dos perfis incompatíveis ou mantenha o tipo atual.";
  if (i.actorId === i.targetId) return "Você não pode alterar o próprio tipo de acesso.";
  if (i.from === i.to) return "Selecione um tipo de acesso diferente do atual.";
  if (i.to === "internal" && i.internalRoles.length === 0 && !(i.currentRoles ?? []).some((r) => INTERNAL.includes(r) && !(i.removeRoles ?? []).includes(r))) return "Selecione ao menos um perfil interno.";
  if (i.internalRoles.includes("superadmin")) return "Perfil não atribuível.";
  if (i.internalRoles.includes("administrador") && (i.to !== "internal" || (i.currentRoles ?? []).some((r) => EXTERNAL.includes(r))))
    return "Administrador só pode ser concedido a usuário já interno, em uma alteração separada.";
  if (i.to === "b2b" && !(i.currentRoles ?? []).some((r) => (B2B_ROLES as readonly string[]).includes(r)) && !(i.b2bRoles ?? []).length)
    return "Selecione explicitamente o perfil B2B (gestor e/ou técnico).";
  if (i.to === "producer" && !i.clienteId) return "Selecione o cliente/produtor.";
  if (needsLinkCas(i.to, i.currentRoles ?? [])) {
    if (!i.link) return "Aguarde a leitura do vínculo com o parceiro.";
    if (i.link.ambiguous || i.link.foreign) return "O usuário tem vínculo de parceiro inconsistente ou de outra empresa; regularize antes.";
    if (i.to === "b2b_finance" && !i.link.link && !i.partnerId) return "Selecione o parceiro B2B do financeiro.";
  }
  const r = reasonSchema.safeParse(i.reason);
  return r.success ? null : r.error.issues[0].message;
}

/** Data civil YYYY-MM-DD com campos validados antes de interpretar (ex.: 2026-02-30 é inválida). */
export function isValidCivilDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
const validDate = isValidCivilDate;
export function validatePeriod(from: string | null, until: string | null, now = new Date()): string | null {
  if ((from && !validDate(from)) || (until && !validDate(until))) return "Data inválida.";
  if (until && from && new Date(until) <= new Date(from)) return "O fim da vigência deve ser posterior ao início.";
  if (until && !from && new Date(until) <= now) return "O fim da vigência deve ser futuro.";
  return null;
}

const ERRORS: Record<string, string> = {
  self_change_denied: "Você não pode alterar o próprio acesso.",
  forbidden: "Operação não permitida para este usuário.",
  partner_link_required: "Vincule primeiro o usuário a um parceiro B2B ativo desta empresa.",
  partner_link_conflict: "O vínculo com o parceiro mudou desde a leitura. Os dados foram recarregados; revise e confirme novamente.",
  partner_link_ambiguous: "O usuário tem mais de um vínculo de parceiro ativo; regularize antes.",
  partner_link_foreign: "O vínculo de parceiro do usuário pertence a outra empresa.",
  partner_required: "Selecione o parceiro B2B do financeiro.",
  partner_link_change_unsupported: "Para trocar de parceiro, encerre o vínculo atual no ciclo de vida do parceiro.",
  b2b_finance_role_exclusive: "Financeiro B2B não pode ser combinado com outros perfis.",
  b2b_finance_roles_required: "Financeiro B2B não pode ser combinado com outros perfis.",
  cliente_required: "Selecione um cliente/produtor desta empresa.",
  internal_roles_required: "Selecione ao menos um perfil interno válido.",
  reason_required: "Informe o motivo da alteração.",
  idempotency_conflict: "Esta solicitação já foi usada com outros dados. Recarregue e tente novamente.",
  email_unavailable: "Este e-mail não está disponível.",
  email_change_pending: "Já existe uma alteração de e-mail pendente.",
  email_change_accepted_locked: "O titular já aceitou e o link oficial pode ter sido enviado. Não é possível cancelar com segurança; a troca fica aguardando confirmação.",
  email_unchanged: "O novo e-mail é igual ao atual.",
  invalid_email: "Informe um e-mail válido.",
  link_already_active: "Este cliente já está vinculado.",
  link_not_active: "O vínculo já foi encerrado ou alterado. Recarregue a lista.",
  invalid_period: "Período de vigência inválido.",
  not_internal_consultant: "Somente consultores internos podem receber vínculos aqui.",
  incompatible_roles: "Há perfis incompatíveis com o novo tipo. Confirme a remoção deles; nada foi alterado.",
  invalid_remove_roles: "Só é possível remover perfis incompatíveis com o novo tipo.",
  internal_roles_not_allowed: "Perfis internos não se aplicam a este tipo de acesso.",
  no_change: "Nenhuma alteração a aplicar.",
  request_not_pending: "Este pedido não está mais pendente.",
  admin_grant_requires_internal_user: "Administrador só pode ser concedido a usuário já interno, em uma alteração separada.",
  b2b_roles_required: "Selecione explicitamente o perfil B2B (gestor e/ou técnico).",
  cliente_not_allowed: "Cliente só se aplica ao tipo Cliente/Produtor.",
  scope_unprovable: "Há vínculos deste usuário que não pertencem a esta empresa. Nada foi alterado; acione o suporte interno.",
  scope_postcondition_failed: "O estado final dos vínculos não pôde ser comprovado. Nada foi alterado.",
  principal_sync_incompatible: "Este ambiente não permite trocar o cliente principal deste usuário com segurança. Nada foi alterado.",
  disabled: "Recurso ainda não liberado neste ambiente.",
  email_change_release_too_early: "Ainda pode haver um envio em andamento. Aguarde alguns minutos e verifique sua caixa de entrada antes de tentar de novo.",
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  delivery_not_ready: "Solicitação registrada, mas o envio de confirmação está desativado. O e-mail atual continua válido.",
};
export function friendlyError(message: string | undefined | null): string {
  const key = Object.keys(ERRORS).find((k) => message?.includes(k));
  return key ? ERRORS[key] : "Não foi possível concluir. Nada foi alterado; tente novamente.";
}

const clienteSchema = z.object({ id: z.string().uuid(), nome: z.string().nullable().transform((v) => v ?? "Sem nome") });
export type ClienteOption = z.infer<typeof clienteSchema>;
const pageSchema = z.object({ total: z.number().int().min(0), offset: z.number().int().min(0), limit: z.number().int().min(1).max(50), items: z.array(clienteSchema) });
export type ClientesPage = z.infer<typeof pageSchema>;
export const parseClientesPage = (d: unknown): ClientesPage => pageSchema.parse(d);

const linkSchema = z.object({
  cliente_id: z.string().uuid(), nome: z.string().nullable().transform((v) => v ?? "Sem nome"), access_level: z.enum(["read", "execute", "manage"]),
  valid_from: z.string().nullable(), valid_until: z.string().nullable(), revoked_at: z.string().nullable(),
  status: z.enum(["vigente", "futuro", "expirado", "encerrado"]),
});
const linksSchema = z.object({
  items: z.array(linkSchema),
  history: z.array(z.object({ at: z.string(), action: z.string().nullable(), cliente_id: z.string().nullable(), reason: z.string().nullable() })),
});
export type ConsultorLinks = z.infer<typeof linksSchema>;
export const parseConsultorLinks = (d: unknown): ConsultorLinks => linksSchema.parse(d);

export const isConsultor = (roles: string[] | null | undefined) =>
  (roles ?? []).some((r) => r === "consultor_tecnico" || r === "tecnico_agronomo");

/** Erro do Edge: o corpo traz só o código de negócio fixo do servidor. */
export async function edgeErrorCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  try { const b = (await ctx?.json?.()) as { error?: string } | undefined; if (b?.error) return b.error; } catch { /* corpo ausente */ }
  return (error as Error | null)?.message ?? "failed";
}
