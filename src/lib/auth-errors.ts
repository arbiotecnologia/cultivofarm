export function traduzirErroAuth(error: { message?: string; status?: number } | null | undefined): string {
  if (!error) return "";
  const msg = (error.message || "").toLowerCase();

  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Email ou senha incorretos.";
  }
  if (msg.includes("email not confirmed")) {
    return "Confirme seu email antes de entrar.";
  }
  if (msg.includes("user already registered") || msg.includes("already registered")) {
    return "Este email já está cadastrado.";
  }
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (msg.includes("password should be at least")) {
    return "A senha deve ter no mínimo 6 caracteres.";
  }
  if (msg.includes("user not found")) {
    return "Usuário não encontrado.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "Sem conexão com o servidor. Verifique sua internet.";
  }
  return "Não foi possível concluir. Verifique seus dados e tente novamente.";
}
