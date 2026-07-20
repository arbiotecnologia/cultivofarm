/**
 * Helpers para campos opcionais de Produto que precisam preservar o estado vazio
 * entre salvar / reabrir. Centralizado para evitar regressões como
 * `versao_catalogo: form.versao_catalogo || "v1.2"` que sobrescrevia o valor
 * limpado pelo usuário.
 */

/** Normaliza o input do usuário para envio ao banco — vazio vira `null`. */
export function normalizeVersaoCatalogoForSave(input: string | null | undefined): string | null {
  const v = (input ?? "").trim();
  return v === "" ? null : v;
}

/** Mapeia o valor vindo do banco de volta para o input — `null` vira `""`. */
export function versaoCatalogoToInput(value: string | null | undefined): string {
  return value ?? "";
}
