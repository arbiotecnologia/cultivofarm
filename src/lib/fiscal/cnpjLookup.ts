/**
 * Fase Fiscal — Consulta CNPJ (RFB) via BrasilAPI + resolução IBGE do
 * município. Apenas UI/apresentação; não persiste, não altera regras.
 *
 * Fontes públicas:
 * - https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 * - https://brasilapi.com.br/api/ibge/municipios/v1/{UF}?providers=dados-abertos-br,gov,wikipedia
 *
 * Não consulta Inscrição Estadual (SINTEGRA): não há API pública
 * unificada gratuita — campo permanece manual.
 */
import type { CompanyFiscalFormValues } from "./companyFiscalValidation";
import { unmaskCnpjAlpha } from "./cnpjAlpha";

export type CnpjLookupErrorCode =
  | "invalid_cnpj"
  | "alpha_unsupported"
  | "not_found"
  | "rate_limited"
  | "network_error";

export class CnpjLookupError extends Error {
  code: CnpjLookupErrorCode;
  constructor(code: CnpjLookupErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

interface BrasilApiCnpj {
  razao_social?: string;
  nome_fantasia?: string;
  cnae_fiscal?: number | string;
  descricao_tipo_de_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  uf?: string;
  municipio?: string;
  ddd_telefone_1?: string;
  opcao_pelo_simples?: boolean;
  opcao_pelo_mei?: boolean;
}

interface IbgeMunicipio {
  nome: string;
  codigo_ibge: string;
}

/**
 * Campos do formulário que o auto-preenchimento pode tocar. Ordem usada
 * também na UI de confirmação.
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

export interface CnpjLookupResult {
  values: Partial<Pick<CompanyFiscalFormValues, LookupTargetField>>;
  /** Município não resolvido no IBGE — usuário precisa preencher manualmente. */
  ibgeUnresolved: boolean;
  /** Sugestão informativa de regime — nunca preenchida automaticamente. */
  taxRegimeHint: "SIMPLES" | "MEI" | null;
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

const BRASILAPI_BASE = "https://brasilapi.com.br/api";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function formatCnae(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const digits = String(v).replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.padStart(7, "0");
}

function formatPhone(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = v.replace(/\D/g, "");
  if (d.length < 10) return d || undefined;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function joinStreet(rfb: BrasilApiCnpj): string | undefined {
  const tipo = (rfb.descricao_tipo_de_logradouro ?? "").trim();
  const log = (rfb.logradouro ?? "").trim();
  const full = [tipo, log].filter(Boolean).join(" ").trim();
  return full || undefined;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch {
    throw new CnpjLookupError("network_error");
  }
  if (res.status === 404) throw new CnpjLookupError("not_found");
  if (res.status === 429) throw new CnpjLookupError("rate_limited");
  if (!res.ok) throw new CnpjLookupError("network_error", `HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new CnpjLookupError("network_error", "invalid_json");
  }
}

async function resolveIbgeCode(
  uf: string,
  municipio: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const list = await fetchJson<IbgeMunicipio[]>(
      `${BRASILAPI_BASE}/ibge/municipios/v1/${encodeURIComponent(uf)}`,
      signal,
    );
    const target = norm(municipio);
    const match = list.find((m) => norm(m.nome) === target);
    return match?.codigo_ibge ?? null;
  } catch {
    return null;
  }
}

/**
 * Consulta CNPJ na BrasilAPI (RFB) e retorna os campos mapeados para o
 * formulário. `cnpj` deve ser 100% numérico (a RFB ainda não expõe
 * endpoint para CNPJ alfanumérico).
 */
export async function lookupCnpj(
  cnpj: string,
  signal?: AbortSignal,
): Promise<CnpjLookupResult> {
  const clean = unmaskCnpjAlpha(cnpj);
  if (clean.length !== 14) throw new CnpjLookupError("invalid_cnpj");
  if (!/^\d{14}$/.test(clean)) throw new CnpjLookupError("alpha_unsupported");

  const rfb = await fetchJson<BrasilApiCnpj>(
    `${BRASILAPI_BASE}/cnpj/v1/${clean}`,
    signal,
  );

  const uf = (rfb.uf ?? "").toUpperCase().trim() || undefined;
  const municipio = (rfb.municipio ?? "").trim() || undefined;

  let ibgeCode: string | null = null;
  let ibgeUnresolved = false;
  if (uf && municipio) {
    ibgeCode = await resolveIbgeCode(uf, municipio, signal);
    if (!ibgeCode) ibgeUnresolved = true;
  }

  const values: Partial<Pick<CompanyFiscalFormValues, LookupTargetField>> = {};
  if (rfb.razao_social) values.legal_name = rfb.razao_social.trim();
  if (rfb.nome_fantasia) values.trade_name = rfb.nome_fantasia.trim();
  const cnae = formatCnae(rfb.cnae_fiscal);
  if (cnae) values.primary_cnae = cnae;
  const phone = formatPhone(rfb.ddd_telefone_1);
  if (phone) values.phone = phone;
  if (rfb.cep) values.postal_code = rfb.cep.replace(/\D/g, "");
  const street = joinStreet(rfb);
  if (street) values.street = street;
  if (rfb.numero) values.number = rfb.numero.trim();
  if (rfb.complemento) values.complement = rfb.complemento.trim();
  if (rfb.bairro) values.neighborhood = rfb.bairro.trim();
  if (municipio) values.city = municipio;
  if (uf) values.state = uf;
  values.country_code = "BR";
  if (ibgeCode) values.municipality_ibge_code = ibgeCode;

  const taxRegimeHint: CnpjLookupResult["taxRegimeHint"] = rfb.opcao_pelo_mei
    ? "MEI"
    : rfb.opcao_pelo_simples
      ? "SIMPLES"
      : null;

  return { values, ibgeUnresolved, taxRegimeHint };
}
