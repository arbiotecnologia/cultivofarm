import type { CondutaState } from "@/components/visita/CondutaCard";

export type { CondutaState };

export const CONDUTA_HEADER = "### Conduta";

export function parseConduta(observacoes: string | null | undefined): { conduta: CondutaState | null; clean: string } {
  if (!observacoes) return { conduta: null, clean: "" };
  const idx = observacoes.indexOf(CONDUTA_HEADER);
  if (idx < 0) return { conduta: null, clean: observacoes };
  const before = observacoes.slice(0, idx).trimEnd();
  const block = observacoes.slice(idx + CONDUTA_HEADER.length).trim();
  const codeStart = block.indexOf("```json");
  const codeEnd = block.indexOf("```", codeStart + 7);
  if (codeStart < 0 || codeEnd < 0) return { conduta: null, clean: before };
  try {
    const json = block.slice(codeStart + 7, codeEnd).trim();
    return { conduta: JSON.parse(json), clean: before };
  } catch {
    return { conduta: null, clean: before };
  }
}

export function serializeConduta(clean: string, conduta: CondutaState): string {
  const base = (clean || "").trimEnd();
  return `${base}\n\n${CONDUTA_HEADER}\n\`\`\`json\n${JSON.stringify(conduta, null, 2)}\n\`\`\``.trim();
}
