import { describe, it, expect } from "vitest";
import {
  IE_PATTERNS,
  UF_LIST,
  resolveIEMaskForUF,
  validateIE,
  normalizeIE,
} from "@/lib/fiscal/ie";

/**
 * Gera um IE válido para a UF, iterando os últimos K dígitos até o validador
 * aceitar. Preserva prefixos exigidos (ex.: "24" AL, "20" RN, "15" PA).
 */
function generateValidIE(uf: string): string {
  const pattern = IE_PATTERNS[uf];
  const len = pattern.digits[0];
  const prefixMap: Record<string, string> = {
    AC: "01", AL: "24", AP: "03", MA: "12", MS: "28", PA: "15", RN: "20",
    RR: "24", GO: "10", TO: len === 11 ? "2901" : "29",
  };
  const forcedPrefix = prefixMap[uf] ?? "";
  // SP tem 2 DVs em posições internas: precisa brute-force maior.
  const tailLen = uf === "SP" ? 4 : 3;
  const filler = "123456789012345".slice(0, len - forcedPrefix.length - tailLen);
  const base = (forcedPrefix + filler).padEnd(len - tailLen, "0");
  const max = Math.pow(10, tailLen);
  for (let i = 0; i < max; i++) {
    const suffix = String(i).padStart(tailLen, "0");
    const candidate = base + suffix;
    if (candidate.length !== len) continue;
    if (validateIE(uf, candidate).ok) return candidate;
  }
  throw new Error(`Não foi possível gerar IE válido para ${uf}`);
}

describe("IE — patterns", () => {
  it("cobre as 27 UFs", () => {
    expect(UF_LIST).toHaveLength(27);
  });

  it("resolveIEMaskForUF retorna null sem UF", () => {
    expect(resolveIEMaskForUF(null, "123")).toBeNull();
    expect(resolveIEMaskForUF("", "123")).toBeNull();
  });

  it("resolveIEMaskForUF respeita SP produtor rural (prefixo P)", () => {
    const m = resolveIEMaskForUF("SP", "P012345678901");
    expect(m?.startsWith("P")).toBe(true);
  });
});

describe("IE — validateIE por UF (DV real)", () => {
  for (const uf of UF_LIST) {
    it(`${uf}: aceita IE gerado, rejeita DV alterado e rejeita comprimento errado`, () => {
      const valid = generateValidIE(uf);
      const r = validateIE(uf, valid);
      expect(r.ok, `esperava OK para ${uf}=${valid}`).toBe(true);
      if (r.ok) expect(r.value).toBe(valid);

      // DV incorreto: incrementa o último dígito.
      const lastIdx = valid.length - 1;
      const tampered =
        valid.slice(0, lastIdx) + String((Number(valid[lastIdx]) + 1) % 10);
      // Pode colidir com outro DV válido em UFs muito permissivas — força shift maior.
      let bad = tampered;
      if (validateIE(uf, bad).ok) {
        bad = valid.slice(0, lastIdx) + String((Number(valid[lastIdx]) + 3) % 10);
      }
      expect(validateIE(uf, bad).ok, `esperava FAIL para ${uf}=${bad}`).toBe(false);

      // Comprimento errado.
      expect(validateIE(uf, valid.slice(0, -1)).ok).toBe(false);
    });
  }
});

describe("IE — casos gerais", () => {
  it("vazio + !required ⇒ ok:null", () => {
    const r = validateIE("SP", "");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it("vazio + required ⇒ erro", () => {
    const r = validateIE("SP", "", { required: true });
    expect(r.ok).toBe(false);
  });

  it("ISENTO com allowIsento", () => {
    const r = validateIE("SP", "isento", { allowIsento: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("ISENTO");
  });

  it("ISENTO sem allowIsento ⇒ erro", () => {
    const r = validateIE("SP", "ISENTO");
    expect(r.ok).toBe(false);
  });

  it("UF ausente + valor ⇒ pede seleção da UF", () => {
    const r = validateIE(null, "123456789");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Estado|UF/i);
  });

  it("UF desconhecida ⇒ erro", () => {
    const r = validateIE("XX", "123456789");
    expect(r.ok).toBe(false);
  });
});

describe("IE — normalizeIE", () => {
  it("preserva ISENTO", () => {
    expect(normalizeIE("SP", "isento", { allowIsento: true })).toBe("ISENTO");
  });
  it("remove máscara", () => {
    expect(normalizeIE("SP", "110.042.490.114")).toBe("110042490114");
  });
  it("null quando vazio", () => {
    expect(normalizeIE("SP", "")).toBeNull();
    expect(normalizeIE("SP", null)).toBeNull();
  });
  it("preserva prefixo P do produtor rural SP", () => {
    expect(normalizeIE("SP", "P110.042.490.11-4")).toBe("P110042490114");
  });
});
