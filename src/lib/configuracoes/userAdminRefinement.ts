/**
 * Refinamento de "Editar Usuário" (tipo de acesso, e-mail, vínculos do consultor).
 * RPCs/Edge em scripts/user-edit-access-email-links-20261117, NÃO instaladas;
 * a UI permanece fechada até o auditor instalar e trocar este gate.
 */
import { z } from "zod";

export const USER_ADMIN_REFINEMENT_INSTALLED = false;

export const RPC = {
  changeAccessType: "tenant_admin_change_access_type_v1",
  emailStatus: "tenant_admin_email_change_status_v1",
  emailCancel: "tenant_admin_email_change_cancel_v1",
  searchClientes: "tenant_admin_search_clientes_v1",
  consultorLinks: "tenant_admin_consultor_links_v1",
  consultorLink: "tenant_admin_consultor_link_v1",
} as const;
export const EDGE_EMAIL_CHANGE = "tenant-user-email-change";
export const PAGE_SIZE = 20;

export type AccessTarget = "internal" | "b2b" | "producer";
export const ACCESS_TARGET_LABEL: Record<AccessTarget, string> = {
  internal: "Interno", b2b: "Parceiro B2B", producer: "Cliente/Produtor",
};

export const emailSchema = z.string().trim().toLowerCase().max(254)
  .regex(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/, "Informe um e-mail válido.");
export const reasonSchema = z.string().trim().min(5, "Informe o motivo (mín. 5 caracteres).").max(500, "Motivo muito longo.");

/** Validação local da transição (o servidor revalida tudo). */
export function validateTransition(i: {
  actorId: string; targetId: string; from: string; to: AccessTarget;
  internalRoles: string[]; clienteId: string | null; reason: string;
}): string | null {
  if (i.actorId === i.targetId) return "Você não pode alterar o próprio tipo de acesso.";
  if (i.from === i.to) return "Selecione um tipo de acesso diferente do atual.";
  if (i.to === "internal" && i.internalRoles.length === 0) return "Selecione ao menos um perfil interno.";
  if (i.internalRoles.includes("superadmin")) return "Perfil não atribuível.";
  if (i.to === "producer" && !i.clienteId) return "Selecione o cliente/produtor.";
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
  cliente_required: "Selecione um cliente/produtor desta empresa.",
  internal_roles_required: "Selecione ao menos um perfil interno válido.",
  reason_required: "Informe o motivo da alteração.",
  idempotency_conflict: "Esta solicitação já foi usada com outros dados. Recarregue e tente novamente.",
  email_unavailable: "Este e-mail não está disponível.",
  email_change_pending: "Já existe uma alteração de e-mail pendente.",
  email_unchanged: "O novo e-mail é igual ao atual.",
  invalid_email: "Informe um e-mail válido.",
  link_already_active: "Este cliente já está vinculado.",
  link_not_active: "O vínculo já foi encerrado ou alterado. Recarregue a lista.",
  invalid_period: "Período de vigência inválido.",
  not_internal_consultant: "Somente consultores internos podem receber vínculos aqui.",
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
