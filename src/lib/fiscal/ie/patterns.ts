/**
 * Máscaras e formatos aceitos de Inscrição Estadual por UF.
 *
 * Fonte: formatos publicados pela SEFAZ / Sintegra (referência consolidada
 * pela Receita Federal — Convênio ICMS 57/95 e atualizações). Onde uma UF
 * aceita mais de um comprimento, todos os comprimentos válidos são listados
 * em `digits` e a máscara é escolhida em runtime pelo tamanho digitado.
 */
export interface IEPattern {
  /** Máscara `_` = dígito. Quando existem múltiplos formatos, o primeiro
   *  serve de referência visual; a resolução em runtime escolhe a mais
   *  próxima do input. */
  masks: string[];
  /** Comprimentos válidos (somente dígitos) para o algoritmo de DV. */
  digits: number[];
  /** Exemplo já formatado para placeholder. */
  example: string;
}

export const IE_PATTERNS: Record<string, IEPattern> = {
  AC: { masks: ["__.___.___/___-__"], digits: [13], example: "01.004.823/001-12" },
  AL: { masks: ["_________"], digits: [9], example: "240000048" },
  AP: { masks: ["_________"], digits: [9], example: "030123459" },
  AM: { masks: ["__.___.___-_"], digits: [9], example: "04.145.871-6" },
  BA: { masks: ["______-__", "_______-__"], digits: [8, 9], example: "123456-63" },
  CE: { masks: ["________-_"], digits: [9], example: "06000001-5" },
  DF: { masks: ["___________-__"], digits: [13], example: "07300001001-09" },
  ES: { masks: ["___.___.__-_"], digits: [9], example: "082.575.87-1" },
  GO: { masks: ["__.___.___-_"], digits: [9], example: "10.987.654-7" },
  MA: { masks: ["_________"], digits: [9], example: "120000387" },
  MG: { masks: ["___.___.___/____"], digits: [13], example: "062.307.904/0081" },
  MS: { masks: ["_________"], digits: [9], example: "283015401" },
  MT: { masks: ["___________"], digits: [11], example: "00130000019" },
  PA: { masks: ["__-______-_"], digits: [9], example: "15-999999-5" },
  PB: { masks: ["________-_"], digits: [9], example: "06000001-5" },
  PE: { masks: ["_______-__", "__.__.___.___-_"], digits: [9, 14], example: "0321418-40" },
  PI: { masks: ["_________"], digits: [9], example: "193015401" },
  PR: { masks: ["________-__"], digits: [10], example: "12345678-50" },
  RJ: { masks: ["__.___.__-_"], digits: [8], example: "99.999.99-5" },
  RN: { masks: ["__.___.___-_", "__.____.___-_"], digits: [9, 10], example: "20.040.040-1" },
  RO: { masks: ["_____________-_"], digits: [14], example: "0000000062521-73" },
  RR: { masks: ["________-_"], digits: [9], example: "24000000-1" },
  RS: { masks: ["___/_______"], digits: [10], example: "224/3658792" },
  SC: { masks: ["___.___.___"], digits: [9], example: "251.040.852" },
  SE: { masks: ["_________-_"], digits: [9], example: "27123456-3" },
  SP: {
    masks: ["___.___.___.___", "P________-_"],
    digits: [12],
    example: "110.042.490.114",
  },
  TO: { masks: ["___________", "_________"], digits: [9, 11], example: "29010227836" },
};

export const UF_LIST = Object.keys(IE_PATTERNS) as (keyof typeof IE_PATTERNS)[];

/**
 * Resolve a máscara adequada em runtime, escolhendo por comprimento do input.
 * Sem UF conhecida, retorna null (chamador aplica fallback genérico).
 */
export function resolveIEMaskForUF(uf: string | null | undefined, rawValue: string): string | null {
  if (!uf) return null;
  const key = String(uf).trim().toUpperCase();
  const p = IE_PATTERNS[key];
  if (!p) return null;
  const cleanLen = String(rawValue ?? "").replace(/[^\dPp]/g, "").length;
  // SP produtor rural começa por "P" + 12 dígitos.
  if (key === "SP" && /^P/i.test(String(rawValue))) {
    return p.masks.find((m) => m.startsWith("P")) ?? p.masks[0];
  }
  // Escolhe a máscara cujo número de placeholders é >= cleanLen (menor possível).
  const sorted = [...p.masks].sort((a, b) => (a.match(/_/g)?.length ?? 0) - (b.match(/_/g)?.length ?? 0));
  for (const m of sorted) {
    const slots = m.replace(/[^_]/g, "").length;
    if (cleanLen <= slots) return m;
  }
  return sorted[sorted.length - 1];
}
