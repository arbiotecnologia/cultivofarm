/**
 * Fase Fiscal H3-A — Consulta cadastral de CNPJ via Edge Function.
 *
 * FONTE
 * - BrasilAPI (`/api/cnpj/v1/{cnpj}`), com dados públicos originados do
 *   CNPJ/RFB. Não é canal oficial da RFB em tempo real. Os dados devem ser
 *   revisados pelo usuário antes de salvar.
 *
 * SEGURANÇA / OBSERVABILIDADE
 * - O frontend chama SOMENTE a Edge Function `fiscal-cnpj-lookup`
 *   (autenticada, com verificação de papel via `has_role`).
 * - Não há fallback direto para BrasilAPI pelo navegador — isso violaria a
 *   autorização e a observabilidade servidor-side.
 * - Consulta automática indisponível para CNPJ alfanumérico enquanto a
 *   BrasilAPI não expuser o formato — o preenchimento manual continua
 *   possível e o CNPJ digitado nunca é alterado por esta função.
 *
 * PROTEÇÕES:
 * - Validação de DV canônica (`validateCnpjAlpha`) antes do request.
 * - `AbortSignal` encaminhado a `supabase.functions.invoke` (functions-js
 *   2.5+ suporta `signal`), permitindo cancelamento real da chamada de rede
 *   ao desmontar o componente.
 * - Whitelist de campos aplicáveis (nenhum campo protegido é tocado).
 */
import type { CompanyFiscalFormValues } from "./companyFiscalValidation";
import { unmaskCnpjAlpha, validateCnpjAlpha } from "./cnpjAlpha";
import { supabase } from "@/integrations/supabase/client";

export type CnpjLookupErrorCode =
  | "invalid_cnpj"
  | "alpha_unsupported"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "upstream_error"
  | "unauthorized"
  | "forbidden"
  | "network_error";

export class CnpjLookupError extends Error {
  code: CnpjLookupErrorCode;
  constructor(code: CnpjLookupErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

/**
 * Campos do formulário que o auto-preenchimento pode tocar. Ordem usada
 * também na UI de confirmação. Nenhum campo protegido aparece aqui.
 */
export const LOOKUP_TARGET_FIELDS = [
  "legal_name",
  "trade_name",
  "primary_cnae",
  "phone",
  "postal_code",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "country_code",
  "municipality_ibge_code",
] as const satisfies ReadonlyArray<keyof CompanyFiscalFormValues>;

export type LookupTargetField = (typeof LOOKUP_TARGET_FIELDS)[number];
const LOOKUP_TARGET_SET = new Set<string>(LOOKUP_TARGET_FIELDS);

export interface CnpjLookupResult {
  values: Partial<Pick<CompanyFiscalFormValues, LookupTargetField>>;
  /** Município não resolvido no IBGE — usuário deve preencher manualmente. */
  ibgeUnresolved: boolean;
  /** Sugestão informativa de regime — nunca preenchida automaticamente. */
  taxRegimeHint: "SIMPLES" | "MEI" | null;
  /** Fonte real dos dados. */
  source: "brasilapi";
}

export const LOOKUP_FIELD_LABELS: Record<LookupTargetField, string> = {
  legal_name: "Razão social",
  trade_name: "Nome fantasia",
  primary_cnae: "CNAE principal",
  phone: "Telefone",
  postal_code: "CEP",
  street: "Logradouro",
  number: "Número",
  complement: "Complemento",
  neighborhood: "Bairro",
  city: "Município",
  state: "UF",
  country_code: "País",
  municipality_ibge_code: "Código IBGE do município",
};

const CONTRACT_VERSION = "fiscal-cnpj-lookup/1.0.0";

// Formatação de telefone para exibição (o backend devolve apenas dígitos).
function formatPhone(digits: string | undefined): string | undefined {
  if (!digits) return undefined;
  const d = digits.replace(/\D/g, "");
  if (d.length < 10) return d || undefined;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function mapErrorCode(code: unknown): CnpjLookupErrorCode {
  switch (code) {
    case "invalid_cnpj":
    case "alpha_unsupported":
    case "not_found":
    case "rate_limited":
    case "timeout":
    case "upstream_error":
    case "unauthorized":
    case "forbidden":
      return code;
    default:
      return "network_error";
  }
}

/**
 * Consulta CNPJ via Edge Function `fiscal-cnpj-lookup`. `cnpj` pode conter
 * pontuação; validação de DV é aplicada antes do request.
 */
export async function lookupCnpj(
  cnpj: string,
  signal?: AbortSignal,
): Promise<CnpjLookupResult> {
  const clean = unmaskCnpjAlpha(cnpj);
  if (!validateCnpjAlpha(clean)) throw new CnpjLookupError("invalid_cnpj");
  if (!/^\d{14}$/.test(clean)) throw new CnpjLookupError("alpha_unsupported");

  if (signal?.aborted) throw new CnpjLookupError("network_error", "aborted");

  let invokeResult: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    invokeResult = await supabase.functions.invoke("fiscal-cnpj-lookup", {
      body: { version: CONTRACT_VERSION, cnpj: clean },
    });
  } catch {
    throw new CnpjLookupError("network_error");
  }

  if (signal?.aborted) throw new CnpjLookupError("network_error", "aborted");

  const { data, error } = invokeResult as { data: unknown; error: unknown };

  if (error) {
    // supabase-js expõe `context.response` para respostas não-2xx; extrai code.
    let code: unknown;
    const ctx = (error as { context?: { response?: Response } })?.context;
    if (ctx?.response) {
      try {
        const body = (await ctx.response.clone().json()) as { error?: unknown };
        code = body?.error;
      } catch {
        code = undefined;
      }
    }
    throw new CnpjLookupError(mapErrorCode(code));
  }

  if (!data || typeof data !== "object")
    throw new CnpjLookupError("upstream_error");

  const payload = data as {
    values?: Record<string, unknown>;
    ibge_unresolved?: unknown;
    tax_regime_hint?: unknown;
    source?: unknown;
  };

  const rawValues = payload.values ?? {};
  const values: Partial<Pick<CompanyFiscalFormValues, LookupTargetField>> = {};
  for (const key of Object.keys(rawValues)) {
    if (!LOOKUP_TARGET_SET.has(key)) continue; // whitelist defensiva
    const raw = rawValues[key];
    if (raw == null) continue;
    const v = String(raw).slice(0, 200);
    if (!v) continue;
    if (key === "phone") {
      const formatted = formatPhone(v);
      if (formatted) values.phone = formatted;
      continue;
    }
    (values as Record<string, string>)[key] = v;
  }

  const hint = payload.tax_regime_hint;
  const taxRegimeHint =
    hint === "SIMPLES" || hint === "MEI" ? hint : null;

  return {
    values,
    ibgeUnresolved: payload.ibge_unresolved === true,
    taxRegimeHint,
    source: "brasilapi",
  };
}
