/**
 * H7b — Guard de binding fiscal no cliente.
 *
 * O runtime fiscal só pode falar com o projeto CultivoFarm autorizado. O `.env` gerado
 * pela plataforma pode sofrer drift; por isso a verdade usada aqui é a URL
 * efetiva do cliente Supabase (`client.ts`), não `import.meta.env`.
 *
 * Não contém segredos: project refs são públicos (fazem parte da URL).
 */
import { supabase } from "@/integrations/supabase/client";

export const FISCAL_EXPECTED_PROJECT_REF = "swzpzcwiasxmjutrmvkm" as const;
export const FISCAL_FORBIDDEN_PRODUCTION_REF = "navfzbwgwzruipouyfnk" as const;
export const FISCAL_PRODUCTION_EMISSION_ALLOWED = false as const;

/** Project ref efetivamente usado em runtime pelo cliente Supabase. */
export function runtimeProjectRef(): string | null {
  try {
    // @ts-expect-error acesso interno estável ao endpoint configurado
    const url: string = supabase.supabaseUrl ?? supabase.restUrl ?? "";
    if (!url) return null;
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export type FiscalBindingCheck = {
  ok: boolean;
  ref: string | null;
  reason?: "unknown_ref" | "production_forbidden" | "ref_mismatch";
  message?: string;
};

/** Fail-closed: qualquer ref diferente do CultivoFarm autorizado bloqueia. */
export function checkFiscalProjectRef(ref: string | null): FiscalBindingCheck {
  if (!ref) {
    return { ok: false, ref, reason: "unknown_ref", message: "Ambiente fiscal não identificado." };
  }
  if (ref === FISCAL_FORBIDDEN_PRODUCTION_REF) {
    return {
      ok: false,
      ref,
      reason: "production_forbidden",
      message: "Operação fiscal bloqueada: ambiente de produção não é permitido nesta fase.",
    };
  }
  if (ref !== FISCAL_EXPECTED_PROJECT_REF) {
    return {
      ok: false,
      ref,
      reason: "ref_mismatch",
      message: "Operação fiscal bloqueada: o app não está conectado ao projeto CultivoFarm autorizado.",
    };
  }
  return { ok: true, ref };
}

export function checkFiscalBinding(): FiscalBindingCheck {
  return checkFiscalProjectRef(runtimeProjectRef());
}
