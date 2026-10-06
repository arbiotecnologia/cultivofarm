export type LimitState = "not_included" | "limited" | "unlimited";

export interface StructuredLimitValue {
  state: LimitState;
  value?: number;
}

export function isValidStructuredLimit(value: StructuredLimitValue): boolean {
  if (value.state !== "limited") return value.value === undefined;
  return typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0;
}

export function parseStructuredLimits(value: Record<string, unknown>) {
  const parsed: Record<string, StructuredLimitValue> = {};
  const legacy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry) &&
      ["not_included", "limited", "unlimited"].includes(String((entry as { state?: unknown }).state))) {
      const candidate = entry as { state: LimitState; value?: unknown };
      parsed[key] = candidate.state === "limited" && typeof candidate.value === "number"
        ? { state: candidate.state, value: candidate.value }
        : { state: candidate.state };
    } else legacy[key] = entry;
  }
  return { parsed, legacy };
}

export function serializeStructuredLimits(limits: Record<string, StructuredLimitValue>) {
  return Object.fromEntries(Object.entries(limits).filter(([, value]) => isValidStructuredLimit(value)));
}