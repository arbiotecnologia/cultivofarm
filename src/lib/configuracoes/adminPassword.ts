import { REGRA_SENHA, senhaValida } from "./usuariosValidation";

const GENERIC = "Não foi possível alterar a senha. Tente novamente mais tarde.";
const MESSAGES: Record<string, string> = {
  ADMIN_PASSWORD_UNAUTHORIZED: "Sua sessão não está disponível. Entre novamente para tentar.",
  ADMIN_PASSWORD_FORBIDDEN: "Não é permitido alterar a senha deste usuário.",
  ADMIN_PASSWORD_AUTHORIZATION_ERROR: "Não foi possível verificar a autorização. Tente novamente mais tarde.",
  ADMIN_PASSWORD_INTERNAL_ERROR: GENERIC,
  ADMIN_PASSWORD_UPDATE_FAILED: GENERIC,
  ADMIN_PASSWORD_INVALID_INPUT: "Selecione um usuário válido para alterar a senha.",
  ADMIN_PASSWORD_INVALID_PASSWORD: REGRA_SENHA,
};

export class AdminPasswordError extends Error {}

export function adminPasswordMessage(body: unknown): string {
  let parsed = body;
  if (typeof body === "string") {
    try { parsed = JSON.parse(body); } catch { return GENERIC; }
  }
  const code = parsed && typeof parsed === "object" && "code" in parsed ? parsed.code : null;
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(MESSAGES, code) ? MESSAGES[code] : GENERIC;
}

export async function changeAdminPassword(
  userId: string, password: string, confirmation: string,
  invoke: (body: { user_id: string; new_password: string }) => Promise<{ data: unknown; error: unknown }>,
  readError: (error: unknown) => Promise<unknown>,
): Promise<void> {
  if (!senhaValida(password)) throw new AdminPasswordError(REGRA_SENHA);
  if (password !== confirmation) throw new AdminPasswordError("As senhas não coincidem");
  try {
    const { data, error } = await invoke({ user_id: userId, new_password: password });
    if (error) throw new AdminPasswordError(adminPasswordMessage(await readError(error)));
    if (!data || typeof data !== "object" || !("success" in data) || data.success !== true) {
      throw new AdminPasswordError(adminPasswordMessage(data));
    }
  } catch (error) {
    throw error instanceof AdminPasswordError ? error : new AdminPasswordError(GENERIC);
  }
}

export function adminPasswordErrorMessage(error: unknown): string {
  return error instanceof AdminPasswordError ? error.message : GENERIC;
}