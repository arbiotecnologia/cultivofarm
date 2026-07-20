// Mapeamento entre os enums de `registros_consultor` (visita técnica)
// e os tipos legíveis usados nos módulos de BI / Previsão.

export type TipoProblemaUnificado =
  | "praga"
  | "doenca"
  | "nematoide"
  | "daninha"
  | "solo"
  | "outro";

/**
 * Converte `categoria_problema_consultor` em um tipo unificado para gráficos
 * e regras de risco. Também aceita o legado `tipo_demanda_consultor`.
 */
export function mapCategoriaToTipo(
  categoria?: string | null,
  tipoDemanda?: string | null
): TipoProblemaUnificado {
  const c = categoria ?? "";
  if (c === "insetos_praga") return "praga";
  if (c === "doencas_fungicas" || c === "doencas_bacterianas") return "doenca";
  if (c === "nematoides") return "nematoide";
  if (c === "plantas_daninhas") return "daninha";
  if (c === "desequilibrio_biologico_solo" || c === "baixa_vitalidade") return "solo";

  // Fallback no tipo_demanda apenas para registros históricos legados
  const td = tipoDemanda ?? "";
  if (td === "praga") return "praga";
  if (td === "doenca") return "doenca";
  if (td === "nematoide") return "nematoide";
  if (td === "planta_daninha" || td === "daninha") return "daninha";
  if (td === "solo" || td === "nutricao") return "solo";

  return "outro";
}

/** Rótulo amigável para gráficos. */
export const TIPO_LABEL: Record<TipoProblemaUnificado, string> = {
  praga: "Pragas",
  doenca: "Doenças",
  nematoide: "Nematoides",
  daninha: "Plantas Daninhas",
  solo: "Solo / Nutrição",
  outro: "Outros",
};

/**
 * Converte `nivel_pressao` (baixo/medio/alto/severo) para `nivel_severidade`
 * (baixo/medio/alto), agregando `severo` em `alto`.
 */
export function mapPressaoToSeveridade(
  nivelPressao?: string | null
): "baixo" | "medio" | "alto" {
  if (nivelPressao === "severo" || nivelPressao === "alto") return "alto";
  if (nivelPressao === "medio") return "medio";
  return "baixo";
}

/** Considera o registro de visita técnica resolvido quando aprovado ou já virou OS. */
export function isRegistroResolvido(status?: string | null): boolean {
  return status === "aprovado" || status === "convertido_os";
}
