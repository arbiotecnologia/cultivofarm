export type FinalizeErrorCode =
  | "profile_tenant_conflict"
  | "auth_metadata_mismatch"
  | "stale_lease"
  | "authorization_failed"
  | "database_constraint"
  | "finalize_internal_error";

export function classifyFinalizeError(error: unknown): FinalizeErrorCode {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (message.includes("platform_profile_tenant_conflict")) return "profile_tenant_conflict";
  if (message.includes("platform_auth_metadata_mismatch")) return "auth_metadata_mismatch";
  if (message.includes("platform_stale_lease")) return "stale_lease";
  if (message.includes("platform_authorization_failed") || message.includes("platform_forbidden")) {
    return "authorization_failed";
  }
  if (message.includes("platform_database_constraint") || message.includes("23505")) {
    return "database_constraint";
  }
  return "finalize_internal_error";
}

export function finalizeErrorResponse(code: FinalizeErrorCode): { message: string; status: number } {
  switch (code) {
    case "profile_tenant_conflict":
      return { message: "Este acesso já está vinculado a outra empresa.", status: 409 };
    case "auth_metadata_mismatch":
      return { message: "A identidade do convite não corresponde à solicitação atual.", status: 409 };
    case "stale_lease":
      return { message: "A reserva deste convite expirou. Atualize o status antes de tentar novamente.", status: 409 };
    case "authorization_failed":
      return { message: "Permissão insuficiente para concluir o convite.", status: 403 };
    case "database_constraint":
      return { message: "Os dados do acesso entram em conflito com um cadastro existente.", status: 409 };
    default:
      return { message: "Não foi possível concluir o cadastro do administrador.", status: 500 };
  }
}