// Validação pura do pedido de troca de e-mail (testável em Node e Deno).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailChangeInput { inviteId: string; newEmail: string; reason: string; idempotencyKey: string }

export function parseEmailChangeBody(body: unknown):
  | { ok: true; value: EmailChangeInput }
  | { ok: false; code: string; message: string } {
  if (!body || typeof body !== "object") return { ok: false, code: "invalid_body", message: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const inviteId = String(b.invite_id ?? "");
  const newEmail = String(b.new_email ?? "").trim().toLowerCase();
  const reason = String(b.reason ?? "").trim();
  const idempotencyKey = String(b.idempotency_key ?? "");
  if (!UUID_RE.test(inviteId)) return { ok: false, code: "invalid_invite", message: "Administrador inválido." };
  if (!UUID_RE.test(idempotencyKey)) return { ok: false, code: "invalid_idempotency_key", message: "Chave de operação inválida." };
  if (!EMAIL_RE.test(newEmail) || newEmail.length > 254) return { ok: false, code: "invalid_email", message: "Informe um e-mail válido." };
  if (reason.length < 2 || reason.length > 500) return { ok: false, code: "invalid_reason", message: "Informe o motivo (mínimo 2 caracteres)." };
  if (b.confirm !== true) return { ok: false, code: "confirmation_required", message: "Confirme a alteração explicitamente." };
  return { ok: true, value: { inviteId, newEmail, reason, idempotencyKey } };
}

export function classifyBeginError(message: string): { code: string; message: string; status: number } {
  if (message.includes("platform_email_in_use")) return { code: "email_in_use", message: "Este e-mail já está em uso.", status: 409 };
  if (message.includes("e-mail igual")) return { code: "same_email", message: "O novo e-mail é igual ao atual.", status: 400 };
  if (message.includes("pendente para este")) return { code: "change_pending", message: "Já existe uma mudança de e-mail pendente para este administrador.", status: 409 };
  if (message.includes("em andamento")) return { code: "provisioning_busy", message: "Há um envio ou provisionamento em andamento. Aguarde e tente novamente.", status: 409 };
  if (message.includes("chave idempotente") || message.includes("substituída")) return { code: "idempotency_conflict", message: "Esta solicitação conflita com outra já registrada. Recarregue a lista.", status: 409 };
  if (message.includes("platform_forbidden")) return { code: "forbidden", message: "Operação não permitida.", status: 403 };
  if (message.includes("vínculo")) return { code: "tenant_mismatch", message: "O vínculo do administrador com a empresa não confere.", status: 409 };
  return { code: "begin_failed", message: "Não foi possível iniciar a alteração.", status: 400 };
}
