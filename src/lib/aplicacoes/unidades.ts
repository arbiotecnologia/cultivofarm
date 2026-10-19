/** Somente unidades explícitas de uma recomendação vinculada à OS. */
export function unidadeAplicacao(unidade: unknown) {
  if (typeof unidade !== "string") return null;
  const match = unidade.trim().match(/^([^/]+)\s*\/\s*ha$/);
  if (!match || !match[1].trim()) return null;
  const total = match[1].trim();
  return { dose: `${total}/ha`, total };
}

export function totalAplicacao(dose: string, area: string, unidade: unknown) {
  const u = unidadeAplicacao(unidade);
  const valor = Number(dose) * Number(area);
  return u && Number(dose) > 0 && Number(area) > 0 && Number.isFinite(valor)
    ? { valor, unidade: u.total } : null;
}

export function dependentesNovaOS() {
  return { dose: "", area: "", lote: "", calda: "" };
}

/** Explicit execution input, not a recommendation inferred from today's catalog. */
export const UNIDADE_EXECUCAO_CANONICA = "mL/ha";