/**
 * Alvo canônico único do módulo fiscal do Cultivo Farm.
 *
 * As Edge Functions fiscais só podem falar com o projeto autorizado. Manter o
 * literal em um único módulo evita divergência entre funções e permite um
 * contrato estático que quebra se alguma delas voltar a apontar para outro
 * destino. O project ref é público (faz parte da URL) e não é segredo.
 */
export const CANONICAL_PROJECT_REF = "swzpzcwiasxmjutrmvkm" as const;
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_PROJECT_REF}.supabase.co` as const;

/** Fail-closed: só o projeto canônico pode ser usado em runtime. */
export function isCanonicalSupabaseUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url === CANONICAL_SUPABASE_URL;
}
