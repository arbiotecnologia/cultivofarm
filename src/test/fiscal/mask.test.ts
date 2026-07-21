/**
 * Fase Fiscal 3.0 — Contrato do mascaramento recursivo.
 *
 * Espelha, em TypeScript puro, o comportamento esperado da função SQL
 * `public.mask_sensitive_jsonb(jsonb)`. Serve como especificação executável
 * verificada em CI mesmo sem banco. O teste runtime real está em
 * `src/test/fiscal/rls/mask.sql.test.ts`.
 */
import { describe, test, expect } from "vitest";

const SENSITIVE_KEYS = [
  "authorization",
  "token",
  "password",
  "senha",
  "certificate",
  "certificado",
  "private_key",
  "secret",
  "pfx",
  "p12",
];

const REDACTED = "***REDACTED***";

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower === s || lower.includes(s));
}

function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitive(k) ? REDACTED : maskSensitive(v);
    }
    return out;
  }
  return value;
}

describe("mask_sensitive_jsonb — contrato", () => {
  test("mascara chaves de topo (case-insensitive)", () => {
    expect(maskSensitive({ Authorization: "x", TOKEN: "y", ok: "keep" })).toEqual({
      Authorization: REDACTED,
      TOKEN: REDACTED,
      ok: "keep",
    });
  });

  test("mascara em objetos aninhados", () => {
    expect(
      maskSensitive({ nested: { certificate: "c", ok: "keep" } }),
    ).toEqual({ nested: { certificate: REDACTED, ok: "keep" } });
  });

  test("mascara dentro de arrays", () => {
    expect(maskSensitive([{ password: "p" }, { senha: "s" }, { ok: 1 }])).toEqual([
      { password: REDACTED },
      { senha: REDACTED },
      { ok: 1 },
    ]);
  });

  test("preserva chaves não sensíveis e primitivos", () => {
    expect(maskSensitive({ untouched: 42, name: "ok" })).toEqual({
      untouched: 42,
      name: "ok",
    });
    expect(maskSensitive("string")).toBe("string");
    expect(maskSensitive(null)).toBe(null);
  });

  test("cobre chaves compostas contendo termo sensível", () => {
    expect(maskSensitive({ private_key_pem: "x", accessToken: "y" })).toEqual({
      private_key_pem: REDACTED,
      accessToken: REDACTED,
    });
  });
});
