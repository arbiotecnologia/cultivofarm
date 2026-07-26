/**
 * Remove todos os caracteres não numéricos de uma string
 */
export const unmask = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\D/g, "");
};

/**
 * Formata um valor como CPF (000.000.000-00)
 */
export const formatCPF = (value: string | number | undefined | null): string => {
  const v = unmask(value);
  if (!v) return "";
  return v
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    .slice(0, 14);
};

// Fase Fiscal 3.19 — CNPJ alfanumérico (IN RFB 2.229/2024).
// A ÚNICA fonte de verdade do algoritmo é `src/lib/fiscal/cnpjAlpha.ts`.
// Este módulo apenas re-exporta para preservar as APIs históricas
// (`formatCNPJ`, `unmaskCnpj`) sem duplicar lógica.
import {
  formatCnpjAlpha as _formatCnpjAlpha,
  unmaskCnpjAlpha as _unmaskCnpjAlpha,
} from "./fiscal/cnpjAlpha";

/**
 * Formata um valor como CNPJ (00.000.000/0000-00). Aceita alfanumérico.
 * Delega ao módulo canônico `cnpjAlpha`.
 */
export const formatCNPJ = (
  value: string | number | undefined | null,
): string => {
  if (value === undefined || value === null) return "";
  return _formatCnpjAlpha(String(value));
};

/**
 * Remove pontuação/espaços de um CNPJ preservando letras (uppercase).
 * NÃO usar `unmask` para CNPJ — `unmask` remove letras.
 */
export const unmaskCnpj = (
  value: string | number | undefined | null,
): string => {
  if (value === undefined || value === null) return "";
  return _unmaskCnpjAlpha(String(value));
};

/**
 * Normaliza um valor CPF/CNPJ preservando semântica de cada tipo:
 * - Se contém letra ⇒ CNPJ alfanumérico (uppercase, sem pontuação).
 * - Caso contrário ⇒ dígitos apenas (compat CPF e CNPJ numérico legado).
 * Use este helper em QUALQUER campo `cpf_cnpj` de banco.
 * Nunca use `unmask()` (numérico puro) para CNPJ na Fase Fiscal 3.19+.
 */
export const unmaskCpfCnpj = (
  value: string | number | undefined | null,
): string => {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  return /[A-Za-z]/.test(raw) ? _unmaskCnpjAlpha(raw) : raw.replace(/\D/g, "");
};


/**
 * Formata conforme o tamanho (CPF ou CNPJ). CPF continua numérico;
 * CNPJ aceita alfanumérico (Fase 3.19).
 */
export const formatCpfCnpj = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null) return "";
  const raw = String(value).replace(/[\s.\-/]/g, "");
  if (!raw) return "";
  // Contém letra → CNPJ alfanumérico (2026+).
  if (/[A-Za-z]/.test(raw)) return formatCNPJ(raw);
  // Só dígitos: heurística por comprimento.
  return raw.length > 11 ? formatCNPJ(raw) : formatCPF(raw);
};

/**
 * Versão segura: sempre retorna algo exibível.
 */
export const formatCpfCnpjSafe = (
  value: string | number | undefined | null,
  fallback = "—",
): string => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const raw = String(value).replace(/[\s.\-/]/g, "");
  if (!raw) return fallback;
  const hasLetter = /[A-Za-z]/.test(raw);
  if (hasLetter) {
    return raw.length === 14 ? formatCNPJ(raw) : `${formatCNPJ(raw)} (inválido)`;
  }
  if (raw.length === 11) return formatCPF(raw);
  if (raw.length === 14) return formatCNPJ(raw);
  return `${raw.length > 11 ? formatCNPJ(raw) : formatCPF(raw)} (inválido)`;
};

/**
 * Versão segura específica para CNPJ (14 posições, alfa 3.19).
 */
export const formatCNPJSafe = (
  value: string | number | undefined | null,
  fallback = "—",
): string => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const raw = String(value).replace(/[\s.\-/]/g, "").toUpperCase();
  if (!raw) return fallback;
  if (raw.length === 14) return formatCNPJ(raw);
  return `${formatCNPJ(raw)} (inválido)`;
};


/**
 * Retorna o tipo de documento ("CPF" | "CNPJ") com base no tipo_pessoa
 * do cliente e/ou no comprimento do documento. Retorna null se indeterminado.
 */
export const getTipoDocumento = (
  value: string | number | undefined | null,
  tipoPessoa?: "fisica" | "juridica" | string | null,
): "CPF" | "CNPJ" | null => {
  if (tipoPessoa === "fisica") return "CPF";
  if (tipoPessoa === "juridica") return "CNPJ";
  if (value === undefined || value === null) return null;
  const raw = String(value).replace(/[\s.\-/]/g, "");
  if (!raw) return null;
  // Alfanumérico → sempre CNPJ (Fase 3.19).
  if (/[A-Za-z]/.test(raw)) return "CNPJ";
  return raw.length > 11 ? "CNPJ" : "CPF";
};


/**
 * Formata telefone brasileiro
 */
export const formatTelefone = (value: string | number | undefined | null): string => {
  const v = unmask(value);
  if (!v) return "";
  
  const len = v.length;
  if (len <= 2) return v;
  if (len <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  if (len <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`;
};

/**
 * Normaliza telefone brasileiro para persistência (somente dígitos).
 * Regras:
 *  - null / undefined / string vazia (após trim) ⇒ null (campo opcional).
 *  - 10 dígitos (fixo com DDD) ou 11 dígitos (celular com DDD) ⇒ dígitos.
 *  - Qualquer outro comprimento ⇒ null (inválido, deve ser barrado pela
 *    validação; nunca persistir string parcial).
 */
export const normalizePhoneBR = (
  value: string | number | null | undefined,
): string | null => {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10 || digits.length === 11) return digits;
  return null;
};

/**
 * Valida telefone brasileiro para uso em formulários.
 * Retorna:
 *  - { ok: true, value: null } quando vazio (permitido em campos opcionais).
 *  - { ok: true, value: '<dígitos>' } quando 10 ou 11 dígitos.
 *  - { ok: false, error } com mensagem pt-BR caso contrário.
 */
export type PhoneValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export const validatePhoneBR = (
  value: string | number | null | undefined,
  { fieldLabel = "Telefone", required = false }: { fieldLabel?: string; required?: boolean } = {},
): PhoneValidationResult => {
  if (value === null || value === undefined || String(value).trim() === "") {
    if (required) return { ok: false, error: `${fieldLabel} é obrigatório.` };
    return { ok: true, value: null };
  }
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    return { ok: true, value: digits };
  }
  return {
    ok: false,
    error: `${fieldLabel} inválido: informe DDD + número (10 ou 11 dígitos).`,
  };
};

/**
 * Formata CEP
 */
export const formatCEP = (value: string | number | undefined | null): string => {
  const v = unmask(value);
  if (!v) return "";
  return v.replace(/(\d{5})(\d{3})/, "$1-$2").slice(0, 9);
};

/**
 * Formata Inscrição Estadual (000000000.00-00)
 */
export const formatIE = (value: string): string => {
  const v = unmask(value);
  if (!v) return "";
  return v.replace(/^(\d{9})(\d{2})(\d{2}).*/, "$1.$2-$3");
};

/**
 * Formata Moeda Brasileira (R$)
 */
export const formatMoedaBR = (value: number | string): string => {
  const v = typeof value === "string" ? parseFloat(value.replace(",", ".")) : value;
  if (isNaN(v)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
};
