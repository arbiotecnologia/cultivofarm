// Núcleo puro (sem Deno) da consulta de CNPJ no onboarding — testável no Vitest.
// Nenhum dado do QSA além do nome é devolvido; nada é persistido.

export const BRASILAPI_HOST = "brasilapi.com.br";
export const BRASILAPI_PATH = "/api/cnpj/v1/";
export const MAX_BYTES = 64 * 1024;
export const TIMEOUT_MS = 6000;

export type Codigo =
  | "ok" | "invalid_cnpj" | "unsupported_alpha" | "not_found" | "rate_limited"
  | "upstream_error" | "timeout" | "malformed" | "too_large" | "network_error";

export interface DadosEmpresa {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  matriz_filial: string | null;
  porte: string | null;
  natureza_juridica: string | null;
  data_abertura: string | null;
  cnae_principal: string | null;
  cnae_descricao: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email_contato: string | null;
  regime_tributario: string | null;
  socios_sugeridos: string[];
}

export type Resultado = { codigo: "ok"; dados: DadosEmpresa } | { codigo: Exclude<Codigo, "ok"> };

export function normalizar(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\s.\-/]/g, "").toUpperCase() : "";
}

export function cnpjValido(v: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(v)) return false;
  if (/^(\d)\1{13}$/.test(v)) return false;
  const dv = (b: string, w: number[]) => {
    let s = 0;
    for (let i = 0; i < b.length; i++) s += (b.charCodeAt(i) - 48) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(v.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(v.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return v.slice(12) === `${d1}${d2}`;
}

export function urlConsulta(cnpj: string): string {
  if (!/^\d{14}$/.test(cnpj)) throw new Error("cnpj_nao_normalizado");
  return `https://${BRASILAPI_HOST}${BRASILAPI_PATH}${cnpj}`;
}

const txt = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

export function mapear(cnpj: string, raw: unknown): DadosEmpresa | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (normalizar(String(r.cnpj ?? "")) !== cnpj || typeof r.razao_social !== "string") return null;
  const cep = txt(r.cep, 9)?.replace(/\D/g, "") ?? null;
  const tipoLog = txt(r.descricao_tipo_de_logradouro, 40);
  const log = txt(r.logradouro);
  const tel = txt(r.ddd_telefone_1, 20)?.replace(/\D/g, "") || null;
  const email = txt(r.email, 255);
  const uf = txt(r.uf, 2)?.toUpperCase() ?? null;
  // Regime só quando o retorno permite afirmar com segurança.
  let regime: string | null = null;
  if (r.opcao_pelo_mei === true) regime = "MEI";
  else if (r.opcao_pelo_simples === true) regime = "Simples Nacional";
  const qsa = Array.isArray(r.qsa) ? r.qsa : [];
  const socios = qsa
    .map((s) => (s && typeof s === "object" ? txt((s as Record<string, unknown>).nome_socio, 160) : null))
    .filter((n): n is string => !!n)
    .slice(0, 10);
  return {
    cnpj,
    razao_social: txt(r.razao_social),
    nome_fantasia: txt(r.nome_fantasia),
    situacao_cadastral: txt(r.descricao_situacao_cadastral, 40)?.toUpperCase() ?? null,
    matriz_filial: txt(r.descricao_identificador_matriz_filial ?? r.descricao_matriz_filial, 20),
    porte: txt(r.porte ?? r.descricao_porte, 60),
    natureza_juridica: txt(r.natureza_juridica, 160),
    data_abertura: txt(r.data_inicio_atividade, 10),
    cnae_principal: txt(r.cnae_fiscal, 10),
    cnae_descricao: txt(r.cnae_fiscal_descricao),
    cep: cep && cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : null,
    logradouro: log ? (tipoLog && !log.toUpperCase().startsWith(tipoLog.toUpperCase()) ? `${tipoLog} ${log}` : log) : null,
    numero: txt(r.numero, 20),
    complemento: txt(r.complemento, 120),
    bairro: txt(r.bairro, 120),
    cidade: txt(r.municipio, 120),
    uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
    telefone: tel && tel.length >= 10 ? tel : null,
    email_contato: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    regime_tributario: regime,
    socios_sugeridos: socios,
  };
}

/** Consulta a BrasilAPI com timeout e limite de tamanho. `fetchFn` injetável para testes. */
export async function consultar(
  entrada: unknown,
  fetchFn: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<Resultado> {
  const cnpj = normalizar(entrada);
  if (/^[0-9A-Z]{14}$/.test(cnpj) && /[A-Z]/.test(cnpj)) return { codigo: "unsupported_alpha" };
  if (!cnpjValido(cnpj)) return { codigo: "invalid_cnpj" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(urlConsulta(cnpj), {
      signal: ctrl.signal, redirect: "error", headers: { accept: "application/json" },
    });
    if (ctrl.signal.aborted) return { codigo: "timeout" };
    if (res.status === 404) return { codigo: "not_found" };
    if (res.status === 429) return { codigo: "rate_limited" };
    if (!res.ok) return { codigo: "upstream_error" };
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_BYTES) return { codigo: "too_large" };
    const body = await res.text();
    if (body.length > MAX_BYTES) return { codigo: "too_large" };
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { return { codigo: "malformed" }; }
    const dados = mapear(cnpj, raw);
    return dados ? { codigo: "ok", dados } : { codigo: "malformed" };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return { codigo: "timeout" };
    return { codigo: "network_error" };
  } finally {
    clearTimeout(t);
  }
}

export const STATUS_HTTP: Record<Codigo, number> = {
  ok: 200, invalid_cnpj: 400, unsupported_alpha: 422, not_found: 404, rate_limited: 429,
  upstream_error: 502, timeout: 504, malformed: 502, too_large: 502, network_error: 502,
};

/** Limite simples por usuário (janela deslizante, por instância). */
export function criarLimitador(max = 10, janelaMs = 60_000) {
  const m = new Map<string, number[]>();
  return (chave: string, agora = Date.now()) => {
    const l = (m.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    if (l.length >= max) { m.set(chave, l); return false; }
    l.push(agora); m.set(chave, l); return true;
  };
}
