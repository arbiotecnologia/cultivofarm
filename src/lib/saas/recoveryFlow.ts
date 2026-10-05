export type RecoveryPasswordMode = "first_access" | "common";

export interface RecoveryFlowDependencies {
  completeFirstAccess: (password: string) => Promise<{ error: unknown | null }>;
  updatePassword: (password: string) => Promise<{ error: unknown | null }>;
  signOut: () => Promise<unknown>;
}

export interface RecoveryFlowResult {
  ok: boolean;
  error: unknown | null;
}

/**
 * Executa exatamente um finalizador de senha.
 * A decisão do modo deve vir do diagnóstico autenticado server-side.
 */
export async function completeRecoveryPassword(
  mode: RecoveryPasswordMode,
  password: string,
  dependencies: RecoveryFlowDependencies,
): Promise<RecoveryFlowResult> {
  const result = mode === "first_access"
    ? await dependencies.completeFirstAccess(password)
    : await dependencies.updatePassword(password);

  if (result.error) {
    return { ok: false, error: result.error };
  }

  await dependencies.signOut();
  return { ok: true, error: null };
}