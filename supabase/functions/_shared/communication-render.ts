// Renderizador canônico compartilhado — Edge Functions e frontend
// devem produzir SAÍDA IDÊNTICA para os vetores de contrato em
// src/test/comunicacao/render-vectors.ts.
// Sem execução de JS, sem URLs externas, sem HTML complexo.

export type ComunicacaoCanal = "email" | "whatsapp" | "in_app" | "push";

export interface TemplateInput {
  canal: ComunicacaoCanal;
  assunto?: string | null;
  corpo: string;
  variaveisPermitidas: string[];
}

export interface RenderInput {
  variaveis: Record<string, unknown>;
  escapeHtml?: boolean;
  maxOutputChars?: number;
}

export interface RenderResult {
  assunto?: string;
  corpo: string;
  missing: string[];
}

export type RenderErrorCode =
  | "VARIAVEL_NAO_PERMITIDA"
  | "PLACEHOLDER_INVALIDO"
  | "SAIDA_MUITO_LONGA"
  | "HTML_PERIGOSO";

export class TemplateRenderError extends Error {
  code: RenderErrorCode;
  constructor(message: string, code: RenderErrorCode) {
    super(message);
    this.name = "TemplateRenderError";
    this.code = code;
  }
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,63})\s*\}\}/g;
const DEFAULT_LIMIT = 30_000;
const DANGEROUS_HTML = /<\s*(script|iframe|object|embed|link|meta|style|form)\b/i;

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOne(
  raw: string,
  variaveis: Record<string, unknown>,
  permitidas: Set<string>,
  escape: boolean,
  missing: Set<string>,
): string {
  return raw.replace(PLACEHOLDER_RE, (_m, name: string) => {
    if (!permitidas.has(name)) {
      throw new TemplateRenderError(
        `variável não permitida: ${name}`,
        "VARIAVEL_NAO_PERMITIDA",
      );
    }
    const v = variaveis[name];
    if (v === undefined || v === null) {
      missing.add(name);
      return "";
    }
    const asStr = String(v);
    return escape ? escapeHtml(asStr) : asStr;
  });
}

export function renderTemplate(
  template: TemplateInput,
  input: RenderInput,
): RenderResult {
  const permitidas = new Set(template.variaveisPermitidas);
  const escape = input.escapeHtml ?? template.canal === "email";
  const missing = new Set<string>();
  const limit = input.maxOutputChars ?? DEFAULT_LIMIT;

  if (
    DANGEROUS_HTML.test(template.corpo) ||
    (template.assunto && DANGEROUS_HTML.test(template.assunto))
  ) {
    throw new TemplateRenderError(
      "template contém HTML potencialmente perigoso",
      "HTML_PERIGOSO",
    );
  }

  if (/\{\{[^}]*[^a-zA-Z0-9_\s{}][^}]*\}\}/.test(template.corpo)) {
    throw new TemplateRenderError(
      "placeholder com sintaxe inválida",
      "PLACEHOLDER_INVALIDO",
    );
  }

  const corpo = renderOne(template.corpo, input.variaveis, permitidas, escape, missing);
  const assunto = template.assunto
    ? renderOne(template.assunto, input.variaveis, permitidas, escape, missing)
    : undefined;

  const total = (assunto?.length ?? 0) + corpo.length;
  if (total > limit) {
    throw new TemplateRenderError(
      `saída excede ${limit} caracteres`,
      "SAIDA_MUITO_LONGA",
    );
  }

  return { assunto, corpo, missing: Array.from(missing) };
}
