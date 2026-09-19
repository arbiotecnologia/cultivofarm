const messages: Record<string, string> = {
  invalid_password: "Senha do certificado incorreta.",
  CERT_PASSWORD_REQUIRED: "Informe a senha do certificado.",
  CERTIFICATE_VAULT_NOT_CONFIGURED: "Cofre de certificados não configurado. Contate o administrador.",
  storage_upload_failed: "Armazenamento do cofre indisponível. Contate o administrador.",
  certificate_expired: "O certificado está vencido.",
  certificate_not_yet_valid: "O certificado ainda não está válido.",
  CERT_CNPJ_MISMATCH: "O certificado não pertence à empresa configurada.",
  company_settings_not_found: "Empresa indisponível para este usuário.",
  certificate_not_found: "Certificado indisponível para este usuário.",
  permission_denied: "Você não tem permissão para esta operação.",
  material_read_failed: "Não foi possível conferir o material. Tente novamente.",
};

/** Only fixed messages may cross into the UI, never server-provided text. */
export async function certificateErrorMessage(error: unknown, data?: unknown): Promise<string> {
  let body = data;
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try { body = await error.context.clone().json(); } catch { /* generic fallback */ }
  }
  if (body && typeof body === "object") {
    const value = body as Record<string, unknown>;
    if (value.cleanup_incomplete === true) return "Certificado revogado; limpeza pendente. Tente revogar novamente para concluir.";
    const code = typeof value.code === "string" ? value.code : value.error;
    if (typeof code === "string" && Object.hasOwn(messages, code)) return messages[code];
  }
  return "Não foi possível concluir a operação do certificado. Tente novamente ou contate o administrador.";
}