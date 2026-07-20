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

/**
 * Formata um valor como CNPJ (00.000.000/0000-00)
 */
export const formatCNPJ = (value: string | number | undefined | null): string => {
  const v = unmask(value);
  if (!v) return "";
  return v
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
    .slice(0, 18);
};

/**
 * Formata conforme o tamanho (CPF ou CNPJ)
 */
export const formatCpfCnpj = (value: string | number | undefined | null): string => {
  const v = unmask(value);
  if (!v) return "";
  return v.length > 11 ? formatCNPJ(v) : formatCPF(v);
};

/**
 * Versão segura: sempre retorna algo exibível.
 * - vazio/nulo → fallback (default "—")
 * - tamanho inválido (≠ 11 e ≠ 14) → "<mask> (inválido)"
 */
export const formatCpfCnpjSafe = (
  value: string | number | undefined | null,
  fallback = "—",
): string => {
  const v = unmask(value);
  if (!v) return fallback;
  if (v.length === 11) return formatCPF(v);
  if (v.length === 14) return formatCNPJ(v);
  return `${v.length > 11 ? formatCNPJ(v) : formatCPF(v)} (inválido)`;
};

/**
 * Versão segura específica para CNPJ (14 dígitos).
 */
export const formatCNPJSafe = (
  value: string | number | undefined | null,
  fallback = "—",
): string => {
  const v = unmask(value);
  if (!v) return fallback;
  if (v.length === 14) return formatCNPJ(v);
  return `${formatCNPJ(v)} (inválido)`;
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
  const v = unmask(value);
  if (!v) return null;
  return v.length > 11 ? "CNPJ" : "CPF";
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
