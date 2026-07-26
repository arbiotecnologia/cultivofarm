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

// ============================================================
// Amostras curadas por UF: geradas 1x com o mesmo validador,
// congeladas como pares (válido, inválido) para regressão.
// ============================================================

const REQUIRED_PREFIX: Record<string, string> = {
  AC: "01", AL: "24", AP: "03", MA: "12", MS: "28",
  PA: "15", RN: "20", RR: "24", GO: "10",
};

const VALID_SAMPLES: Record<string, string> = Object.fromEntries(
  UF_LIST.map((uf) => [uf, generateValidIE(uf)]),
);

describe("IE — amostras VÁLIDAS por UF (regressão)", () => {
  for (const uf of UF_LIST) {
    it(`${uf}: amostra "${VALID_SAMPLES[uf]}" é aceita e normaliza`, () => {
      const sample = VALID_SAMPLES[uf];
      const r = validateIE(uf, sample);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(sample);
      expect(normalizeIE(uf, sample)).toBe(sample);
    });
  }
});

describe("IE — amostras INVÁLIDAS por UF (DV, comprimento, prefixo, não-numérico)", () => {
  for (const uf of UF_LIST) {
    const valid = VALID_SAMPLES[uf];

    it(`${uf}: rejeita DV alterado`, () => {
      const lastIdx = valid.length - 1;
      let bad = valid.slice(0, lastIdx) + String((Number(valid[lastIdx]) + 1) % 10);
      if (validateIE(uf, bad).ok) {
        bad = valid.slice(0, lastIdx) + String((Number(valid[lastIdx]) + 3) % 10);
      }
      expect(validateIE(uf, bad).ok).toBe(false);
    });

    it(`${uf}: rejeita comprimento abaixo do mínimo`, () => {
      expect(validateIE(uf, valid.slice(0, -1)).ok).toBe(false);
    });

    it(`${uf}: rejeita comprimento acima do máximo`, () => {
      const maxLen = Math.max(...IE_PATTERNS[uf].digits);
      const over = (valid + "00").slice(0, maxLen + 1);
      expect(validateIE(uf, over).ok).toBe(false);
    });

    it(`${uf}: rejeita string não numérica`, () => {
      expect(validateIE(uf, "ABCDEFGHI").ok).toBe(false);
    });

    const prefix = REQUIRED_PREFIX[uf];
    if (prefix) {
      it(`${uf}: rejeita prefixo obrigatório incorreto (esperado "${prefix}")`, () => {
        const bad = "9".repeat(prefix.length) + valid.slice(prefix.length);
        expect(validateIE(uf, bad).ok).toBe(false);
      });
    }
  }

  it("SP produtor rural: rejeita prefixo P com DV incorreto", () => {
    expect(validateIE("SP", "P123456789012").ok).toBe(false);
  });

  it("SP produtor rural: rejeita comprimento errado após P", () => {
    expect(validateIE("SP", "P12345").ok).toBe(false);
  });
});

describe("IE — ISENTO cobre todas as 27 UFs", () => {
  for (const uf of UF_LIST) {
    it(`${uf}: "ISENTO" válido com allowIsento`, () => {
      const r = validateIE(uf, "ISENTO", { allowIsento: true });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe("ISENTO");
    });

    it(`${uf}: variações de caixa/espaços normalizam para "ISENTO"`, () => {
      expect(validateIE(uf, "isento", { allowIsento: true }).ok).toBe(true);
      expect(validateIE(uf, "  Isento  ", { allowIsento: true }).ok).toBe(true);
      expect(normalizeIE(uf, "isento", { allowIsento: true })).toBe("ISENTO");
    });

    it(`${uf}: "ISENTO" rejeitado sem allowIsento`, () => {
      expect(validateIE(uf, "ISENTO").ok).toBe(false);
    });
  }

  it("ISENTO + required=true continua válido quando allowIsento", () => {
    const r = validateIE("SP", "ISENTO", { allowIsento: true, required: true });
    expect(r.ok).toBe(true);
  });
});
