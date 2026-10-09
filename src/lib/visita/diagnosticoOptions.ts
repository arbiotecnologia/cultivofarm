import type { Database } from "@/integrations/supabase/cultivofarm.types";
type Enums = Database["public"]["Enums"];

export const CATEGORIAS: { value: Enums["categoria_problema_consultor"]; label: string }[] = [
  { value: "insetos_praga", label: "Insetos-praga" },
  { value: "doencas_fungicas", label: "Doenças fúngicas" },
  { value: "doencas_bacterianas", label: "Doenças bacterianas" },
  { value: "nematoides", label: "Nematoides" },
  { value: "plantas_daninhas", label: "Plantas daninhas" },
  { value: "desequilibrio_biologico_solo", label: "Desequilíbrio biológico do solo" },
  { value: "baixa_vitalidade", label: "Baixa vitalidade" },
  { value: "falha_estande", label: "Falha de estande" },
  { value: "fitotoxidade", label: "Fitotoxicidade" },
  { value: "outro", label: "Outro" },
];
export const SEVERIDADES: { value: Enums["nivel_pressao"]; label: string }[] = [
  { value: "baixo", label: "Baixo" }, { value: "medio", label: "Médio" },
  { value: "alto", label: "Alto" }, { value: "severo", label: "Severo" },
];
export const URGENCIAS: { value: Enums["urgencia_consultor"]; label: string }[] = [
  { value: "baixa", label: "Baixa" }, { value: "media", label: "Média" },
  { value: "alta", label: "Alta" }, { value: "critica", label: "Crítica" },
];
export function diagnosticoValidationError(form: { categoria?: string | null; severidade?: string | null; urgencia?: string | null }): string | null {
  for (const [field, options] of [["categoria", CATEGORIAS], ["severidade", SEVERIDADES], ["urgencia", URGENCIAS]] as const) {
    const value = form[field];
    if (value && !options.some((o) => o.value === value)) return `Valor legado inválido em ${field}: ${value}. Selecione uma opção válida para corrigir; a pendência foi preservada.`;
  }
  return null;
}