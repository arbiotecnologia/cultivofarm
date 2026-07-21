/**
 * Fase Fiscal 3.0.1 — contrato TS do mascaramento recursivo.
 * Espelha exatamente `public.mask_sensitive_jsonb(jsonb)` (versão 3.0.1).
 */
import { describe, test, expect } from "vitest";

const SENSITIVE_KEYS = [
  "authorization", "token", "access_token", "refresh_token",
  "password", "senha",
  "certificate", "certificado",
  "private_key", "privatekey",
  "secret", "client_secret",
  "pfx", "p12",
  "api_key", "apikey",
  "bearer",
];
const REDACTED = "***REDACTED***";

export function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s));
}

export function maskSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitive(k) ? REDACTED : maskSensitive(v);
    }
    return out;
  }
  return value;
}

describe("mask_sensitive_jsonb — contrato TS ampliado", () => {
  test("primeiro nível case-insensitive", () => {
    expect(maskSensitive({ Authorization: "x", TOKEN: "y", ok: "keep" })).toEqual({
      Authorization: REDACTED, TOKEN: REDACTED, ok: "keep",
    });
  });

  test("três níveis de aninhamento", () => {
    expect(maskSensitive({ a: { b: { certificate: "c", ok: 1 } } })).toEqual({
      a: { b: { certificate: REDACTED, ok: 1 } },
    });
  });

  test("arrays simples preservados", () => {
    expect(maskSensitive([1, "a", null])).toEqual([1, "a", null]);
  });

  test("arrays de objetos", () => {
    expect(maskSensitive([{ password: "p" }, { ok: 1 }])).toEqual([
      { password: REDACTED }, { ok: 1 },
    ]);
  });

  test("headers Authorization/apikey", () => {
    expect(maskSensitive({ headers: { Authorization: "Bearer z", apikey: "k", "X-Custom": "keep" } }))
      .toEqual({ headers: { Authorization: REDACTED, apikey: REDACTED, "X-Custom": "keep" } });
  });

  test("chaves compostas: accessToken e private_key_pem", () => {
    expect(maskSensitive({ accessToken: "a", private_key_pem: "p", refresh_token: "r", client_secret: "s" }))
      .toEqual({ accessToken: REDACTED, private_key_pem: REDACTED, refresh_token: REDACTED, client_secret: REDACTED });
  });

  test("null e objeto/array vazios", () => {
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive({})).toEqual({});
    expect(maskSensitive([])).toEqual([]);
  });

  test("payload grande (500 chaves)", () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) big[`k${i}`] = i;
    big.token = "s";
    big.nested = { authorization: "z", ok: "keep" };
    const out = maskSensitive(big) as Record<string, unknown> & {
      nested: { authorization: string; ok: string };
    };
    expect(out.token).toBe(REDACTED);
    expect(out.nested.authorization).toBe(REDACTED);
    expect(out.nested.ok).toBe("keep");
    expect(out.k499).toBe(499);
  });

  test("preserva chaves não sensíveis e primitivos", () => {
    expect(maskSensitive({ untouched: 42, name: "ok" })).toEqual({ untouched: 42, name: "ok" });
    expect(maskSensitive("string")).toBe("string");
  });
});
