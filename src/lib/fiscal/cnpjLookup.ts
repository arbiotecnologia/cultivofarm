/**
 * Consulta cadastral de CNPJ na tela fiscal da empresa.
 *
 * FONTE
 * - BrasilAPI (`/api/cnpj/v1/{cnpj}`), com dados públicos originados do
 *   CNPJ/RFB. Não é canal oficial da RFB em tempo real. Os dados devem ser
 *   revisados pelo usuário antes de salvar.
 *
 * CANAL
 * - Mesmo mecanismo já usado nos cadastros de Cliente e Parceiro B2B:
 *   requisição direta do navegador à base pública. A Edge Function
 *   `fiscal-cnpj-lookup` permanece no repositório, sem deploy, caso se
 *   queira voltar ao canal server-side.
 * - Consulta automática indisponível para CNPJ alfanumérico enquanto a
 *   BrasilAPI não expuser o formato — o preenchimento manual continua
 *   possível e o CNPJ digitado nunca é alterado por esta função.
 *
 * PROTEÇÕES:
 * - Validação de DV canônica (`validateCnpjAlpha`) antes do request.
 * - `AbortSignal` + timeout próprio, permitindo cancelamento real da
 *   chamada de rede ao desmontar o componente.
 * - Whitelist de campos aplicáveis (nenhum campo protegido é tocado).
 */
import type { CompanyFiscalFormValues } from "./companyFiscalValidation";
import { unmaskCnpjAlpha, validateCnpjAlpha } from "./cnpjAlpha";


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

const BRASILAPI_CNPJ_URL = "https://brasilapi.com.br/api/cnpj/v1";
const REQUEST_TIMEOUT_MS = 12_000;

// Formatação de telefone para exibição (a fonte devolve apenas dígitos).
function formatPhone(digits: string | undefined): string | undefined {
  if (!digits) return undefined;
  const d = digits.replace(/\D/g, "");
  if (d.length < 10) return d || undefined;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function clean200(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const v = String(raw).trim().slice(0, 200);
  return v || undefined;
}

function assign(
  values: Record<string, string>,
  key: LookupTargetField,
  raw: unknown,
): void {
  if (!LOOKUP_TARGET_SET.has(key)) return; // whitelist defensiva
  const v = clean200(raw);
  if (v) values[key] = v;
}

/**
 * Consulta CNPJ diretamente na base pública (BrasilAPI), mesmo mecanismo já
 * usado nos cadastros de Cliente e Parceiro B2B. `cnpj` pode conter
 * pontuação; a validação de DV é aplicada antes do request.
 */
export async function lookupCnpj(
  cnpj: string,
  signal?: AbortSignal,
): Promise<CnpjLookupResult> {
  const clean = unmaskCnpjAlpha(cnpj);
  if (!validateCnpjAlpha(clean)) throw new CnpjLookupError("invalid_cnpj");
  if (!/^\d{14}$/.test(clean)) throw new CnpjLookupError("alpha_unsupported");

  if (signal?.aborted) throw new CnpjLookupError("network_error", "aborted");

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, REQUEST_TIMEOUT_MS);


  let resp: Response;
  try {
    resp = await fetch(`${BRASILAPI_CNPJ_URL}/${clean}`, { signal: ctrl.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      if (timedOut && !signal?.aborted) throw new CnpjLookupError("timeout");
      throw new CnpjLookupError("network_error", "aborted");
    }
    throw new CnpjLookupError("network_error");
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(timeoutMark);
    signal?.removeEventListener("abort", onAbort);
  }

  if (signal?.aborted) throw new CnpjLookupError("network_error", "aborted");

  if (!resp.ok) {
    if (resp.status === 404) throw new CnpjLookupError("not_found");
    if (resp.status === 429) throw new CnpjLookupError("rate_limited");
    if (resp.status === 408 || resp.status === 504)
      throw new CnpjLookupError("timeout");
    if (resp.status >= 500) throw new CnpjLookupError("upstream_error");
    throw new CnpjLookupError("upstream_error");
  }

  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    throw new CnpjLookupError("upstream_error");
  }
  if (!data || typeof data !== "object")
    throw new CnpjLookupError("upstream_error");

  const d = data as Record<string, unknown>;
  const values: Record<string, string> = {};

  assign(values, "legal_name", d.razao_social);
  assign(values, "trade_name", d.nome_fantasia ?? d.razao_social);
  assign(values, "primary_cnae", d.cnae_fiscal);
  assign(values, "postal_code", clean200(d.cep)?.replace(/\D/g, ""));
  assign(values, "street", d.logradouro);
  assign(values, "number", d.numero);
  assign(values, "complement", d.complemento);
  assign(values, "neighborhood", d.bairro);
  assign(values, "city", d.municipio);
  assign(values, "state", d.uf);
  assign(values, "country_code", "BR");

  const phone = formatPhone(clean200(d.ddd_telefone_1));
  if (phone) values.phone = phone;

  // A BrasilAPI expõe o código IBGE do município apenas em parte das
  // respostas. Quando ausente, sinalizamos para preenchimento manual.
  const ibge = clean200(d.codigo_municipio_ibge)?.replace(/\D/g, "");
  if (ibge && ibge.length === 7) values.municipality_ibge_code = ibge;

  const taxRegimeHint: "SIMPLES" | "MEI" | null =
    d.opcao_pelo_mei === true ? "MEI" : d.opcao_pelo_simples === true ? "SIMPLES" : null;

  return {
    values: values as Partial<Pick<CompanyFiscalFormValues, LookupTargetField>>,
    ibgeUnresolved: !values.municipality_ibge_code,
    taxRegimeHint,
    source: "brasilapi",
  };
}

