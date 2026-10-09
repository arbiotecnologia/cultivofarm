/**
 * Utilitários para formatação de datas no padrão brasileiro.
 *
 * REGRA DO PROJETO:
 * - Exibição de datas: DD/MM/YYYY
 * - Exibição de datas com hora: DD/MM/YYYY HH:mm
 * - Armazenamento permanece ISO (YYYY-MM-DD ou timestamptz).
 * - Inputs nativos <input type="date"> mantêm value em YYYY-MM-DD.
 *
 * Para datas "puras" (coluna `date` do Postgres, strings YYYY-MM-DD),
 * usamos UTC ao formatar para evitar erros de fuso horário ("off-by-one").
 * Para timestamps (com hora), usamos fuso local.
 */

type DateInput = string | number | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, "0");

const isDateOnlyString = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * String já no padrão brasileiro DD/MM/YYYY.
 *
 * Sem esta checagem, `new Date("12/09/2026")` era interpretado como
 * mês/dia/ano (padrão norte-americano) e 12/09/2026 virava 09/12/2026 —
 * exatamente o deslocamento observado no cabeçalho da visita técnica.
 */
const isBrDateString = (v: unknown): v is string =>
  typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(v);

const toDate = (date: DateInput): Date | null => {
  if (date === null || date === undefined || date === "") return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  const d = new Date(date as any);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Formata uma data para DD/MM/YYYY.
 * Strings no formato YYYY-MM-DD são tratadas em UTC (evita off-by-one).
 */
export const formatDateDisplay = (date: DateInput): string => {
  if (date === null || date === undefined || date === "") return "";
  try {
    // Já está em pt-BR: devolve sem reinterpretar (evita virar mês/dia).
    if (isBrDateString(date)) return date;
    if (isDateOnlyString(date)) {
      const [y, m, d] = date.split("-");
      return `${d}/${m}/${y}`;
    }
    const d = toDate(date);
    if (!d) return String(date);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return String(date);
  }
};

/** Data civil serializada pela RPC como timestamp: não aplicar fuso local.
 * Usar somente em campos cujo contrato de apresentação é uma data civil.
 * Timestamps de eventos continuam usando formatDateDisplay/formatDateTimeDisplay.
 */
export const formatCivilDateDisplay = (date: DateInput): string => {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(date)) {
    return formatDateDisplay(date.slice(0, 10));
  }
  return formatDateDisplay(date);
};

/**
 * Formata data + hora para DD/MM/YYYY HH:mm (fuso local).
 */
export const formatDateTimeDisplay = (date: DateInput): string => {
  if (date === null || date === undefined || date === "") return "";
  // DD/MM/YYYY sem hora: preserva a data pt-BR em vez de reinterpretá-la.
  if (isBrDateString(date)) return date;
  const d = toDate(date);
  if (!d) return String(date);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Formata apenas a hora HH:mm (fuso local).
 */
export const formatTimeDisplay = (date: DateInput): string => {
  if (date === null || date === undefined || date === "") return "";
  const d = toDate(date);
  if (!d) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Converte DD/MM/YYYY -> YYYY-MM-DD (ISO) para persistência.
 */
export const formatDateToISO = (dateStr: string): string => {
  if (!dateStr || !dateStr.includes("/")) return dateStr;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

/**
 * Valida string DD/MM/YYYY.
 */
export const isValidDateBR = (dateStr: string): boolean => {
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!regex.test(dateStr)) return false;
  const [day, month, year] = dateStr.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

/**
 * Máscara DD/MM/YYYY durante digitação.
 */
export const applyDateMask = (value: string): string => {
  const numbers = value.replace(/\D/g, "");
  let masked = "";
  if (numbers.length > 0) {
    masked += numbers.substring(0, 2);
    if (numbers.length > 2) {
      masked += "/" + numbers.substring(2, 4);
      if (numbers.length > 4) {
        masked += "/" + numbers.substring(4, 8);
      }
    }
  }
  return masked;
};
