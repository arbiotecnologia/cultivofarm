export type CommercialCurrency = "BRL" | "USD" | "EUR";

type MoneyParseResult =
  | { kind: "empty"; cents: null }
  | { kind: "invalid"; cents: null }
  | { kind: "valid"; cents: number };

const CURRENCY_LOCALE: Record<CommercialCurrency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "pt-BR",
};

const CURRENCY_SYMBOL: Record<CommercialCurrency, string> = {
  BRL: "R$",
  USD: "US$",
  EUR: "€",
};

export const COMMERCIAL_CURRENCIES: ReadonlyArray<{
  value: CommercialCurrency;
  label: string;
}> = [
  { value: "BRL", label: "Real brasileiro (BRL) — R$" },
  { value: "USD", label: "Dólar americano (USD) — US$" },
  { value: "EUR", label: "Euro (EUR) — €" },
];

export function parseCommercialMoney(value: string): MoneyParseResult {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return { kind: "empty", cents: null };
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(compact)) return { kind: "invalid", cents: null };

  const [integerPart, fractionPart = ""] = compact.split(/[.,]/);
  const centsText = `${integerPart}${fractionPart.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  const cents = Number(centsText || "0");
  if (!Number.isSafeInteger(cents)) return { kind: "invalid", cents: null };
  return { kind: "valid", cents };
}

export function centsFromDecimal(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseCommercialMoney(String(value));
  return parsed.kind === "valid" ? parsed.cents : null;
}

export function centsToDecimal(cents: number): string {
  const integerPart = Math.floor(cents / 100);
  const fractionPart = String(cents % 100).padStart(2, "0");
  return `${integerPart}.${fractionPart}`;
}

export function formatCommercialMoney(cents: number, currency: CommercialCurrency): string {
  const amount = new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${CURRENCY_SYMBOL[currency]} ${amount}`;
}

export function editableCommercialMoney(cents: number, currency: CommercialCurrency): string {
  const decimal = centsToDecimal(cents);
  return currency === "USD" ? decimal : decimal.replace(".", ",");
}