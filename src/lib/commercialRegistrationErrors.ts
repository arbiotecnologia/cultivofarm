export function commercialRegistrationError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "23505") return "Já existe um cadastro com este documento ou código nesta empresa. Revise os dados antes de tentar novamente.";
  if (code === "23503") return "Este cadastro possui vínculos. Inative-o para preservar o histórico.";
  if (code === "42501") return "Não foi possível salvar. Selecione um cliente da sua empresa e confira sua permissão e sessão.";
  if (code === "22023" || code === "22P02") return "Confira os campos e valores informados antes de salvar.";
  return "Não foi possível concluir. Seus dados foram mantidos; confira a sessão e tente novamente.";
}