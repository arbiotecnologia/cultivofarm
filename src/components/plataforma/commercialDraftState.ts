import { centsFromDecimal, centsToDecimal, type CommercialCurrency } from "./commercialMoney";

export interface CommercialDraftFingerprintInput {
  planKey: string;
  priceCents: number | null;
  currency: CommercialCurrency;
  billingCycle: string;
  trialDays: string;
  effectiveFromLocal: string;
  limits: Record<string, unknown>;
  featureKeys: string[];
}

export interface CommercialDraftServerSnapshot extends CommercialDraftFingerprintInput {
  fingerprint: string;
}

interface ServerDraftLike {
  price_amount: number | null;
  currency: string | null;
  billing_cycle: string | null;
  trial_days: number | null;
  effective_from: string | null;
  limits_snapshot: Record<string, unknown>;
  features_snapshot: Array<{ feature_id: string; enabled?: boolean }>;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function datetimeLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function isoToDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function commercialDraftFingerprint(input: CommercialDraftFingerprintInput): string {
  return JSON.stringify(canonicalize({
    plan_key: input.planKey,
    price_amount: input.priceCents === null ? null : centsToDecimal(input.priceCents),
    currency: input.currency,
    billing_cycle: input.billingCycle || null,
    trial_days: input.trialDays === "" ? null : Number(input.trialDays),
    effective_from: datetimeLocalToIso(input.effectiveFromLocal),
    limits: input.limits,
    feature_keys: [...new Set(input.featureKeys)].sort(),
  }));
}

export function snapshotFromServer(
  draft: ServerDraftLike,
  planKey: string,
  featureKeyById: ReadonlyMap<string, string>,
): CommercialDraftServerSnapshot {
  const currency: CommercialCurrency = draft.currency === "USD" || draft.currency === "EUR" ? draft.currency : "BRL";
  const snapshot: CommercialDraftFingerprintInput = {
    planKey,
    priceCents: centsFromDecimal(draft.price_amount),
    currency,
    billingCycle: draft.billing_cycle ?? "",
    trialDays: draft.trial_days === null || draft.trial_days === undefined ? "" : String(draft.trial_days),
    effectiveFromLocal: isoToDatetimeLocal(draft.effective_from),
    limits: draft.limits_snapshot ?? {},
    featureKeys: (draft.features_snapshot ?? [])
      .filter((feature) => feature.enabled !== false)
      .map((feature) => featureKeyById.get(feature.feature_id))
      .filter((key): key is string => Boolean(key))
      .sort(),
  };
  return { ...snapshot, fingerprint: commercialDraftFingerprint(snapshot) };
}