/**
 * Sanitização de issues do validador XSD (Xerces) — módulo puro, sem
 * dependências de runtime (Deno ou Node), para poder ser testado em Vitest.
 *
 * Mensagens do Xerces podem ecoar valores do documento fiscal (CNPJ, valores,
 * trechos de XML) ou caminhos locais. Nenhum texto cru é devolvido: a issue
 * carrega apenas uma mensagem genérica e, no código, no máximo um nome de
 * elemento/atributo validado por allowlist.
 */

/** Mensagem genérica: jamais expõe texto do Xerces, valor fiscal, XML ou path. */
export const XSD_GENERIC_MESSAGE = "documento incompatível com o schema XSD oficial";

/** Nome de elemento/atributo aceito: apenas NCName simples, curto. */
export const SAFE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

export interface XsdIssue {
  line: number | null;
  code: string;
  message: string;
}

/** Extrai apenas o nome seguro de elemento/atributo; prefixo de namespace é descartado. */
export function safeName(raw: string): string {
  const m = raw.match(/element\s+'([^']{1,80})'/i) ?? raw.match(/attribute\s+'([^']{1,80})'/i);
  if (!m) return "";
  const candidate = m[1].includes(":") ? m[1].slice(m[1].lastIndexOf(":") + 1) : m[1];
  return SAFE_NAME_RE.test(candidate) ? candidate : "";
}

export function toIssue(diag: { message?: unknown; line?: unknown }): XsdIssue {
  const raw = String(diag?.message ?? "").split("\n")[0];
  const element = safeName(raw);
  return {
    line: typeof diag?.line === "number" && diag.line > 0 ? diag.line : null,
    code: element ? `XSD_INVALID:${element}` : "XSD_INVALID",
    message: XSD_GENERIC_MESSAGE,
  };
}
