/**
 * Indica somente a presença de uma referência de segredo.
 * Nunca resolve, converte ou retorna o valor armazenado no Vault.
 */
export function isSecretReferenceConfigured(
  row: Record<string, unknown>,
  key: string,
): boolean {
  const reference = row[key];
  if (typeof reference === "string") return reference.trim().length > 0;
  return reference !== null && reference !== undefined;
}