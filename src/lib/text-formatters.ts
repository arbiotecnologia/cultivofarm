const PREPOSITIONS = ["da", "de", "do", "das", "dos", "e", "com", "em"];
const ACRONYMS = ["LTDA", "ME", "EPP", "CNPJ", "CPF", "RG", "IE", "IM", "PIX", "S/A", "SA", "MEI", "EIRELI"];

/**
 * Normaliza o texto para Title Case, mantendo preposições em minúsculo 
 * e siglas conhecidas em maiúsculo.
 */
export const formatTitleCase = (text: string): string => {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (word.length === 0) return "";
      
      const upperWord = word.toUpperCase();
      
      // Se for uma sigla conhecida
      if (ACRONYMS.includes(upperWord)) {
        return upperWord;
      }
      
      // Se for uma preposição e não for a primeira palavra
      if (index > 0 && PREPOSITIONS.includes(word)) {
        return word;
      }
      
      // Capitaliza a primeira letra
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
};

/**
 * Formatação leve para onChange (apenas para evitar inconsistência visual rápida)
 */
export const formatLiveCase = (text: string, mode: "title" | "upper" | "lower"): string => {
  if (!text) return "";
  
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      // No onChange do Title Case, apenas garantimos que a primeira letra digitada seja maiúscula
      // para dar um feedback visual, mas não processamos preposições ainda para não atrapalhar o fluxo.
      if (text.length === 1) return text.toUpperCase();
      return text;
    default:
      return text;
  }
};
