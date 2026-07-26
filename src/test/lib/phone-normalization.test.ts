import { describe, it, expect } from "vitest";
import { normalizePhoneBR, validatePhoneBR } from "@/lib/masks";

describe("normalizePhoneBR", () => {
  it("retorna null para valores vazios", () => {
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR(undefined)).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("   ")).toBeNull();
  });

  it("aceita 10 dígitos (fixo)", () => {
    expect(normalizePhoneBR("1133224455")).toBe("1133224455");
    expect(normalizePhoneBR("(11) 3322-4455")).toBe("1133224455");
  });

  it("aceita 11 dígitos (celular)", () => {
    expect(normalizePhoneBR("11987654321")).toBe("11987654321");
    expect(normalizePhoneBR("(11) 98765-4321")).toBe("11987654321");
  });

  it("rejeita comprimentos inválidos (retorna null)", () => {
    expect(normalizePhoneBR("119")).toBeNull();
    expect(normalizePhoneBR("119876543")).toBeNull(); // 9
    expect(normalizePhoneBR("119876543219")).toBeNull(); // 12
  });

  it("descarta caracteres não numéricos", () => {
    expect(normalizePhoneBR("+55 (11) 98765-4321")).toBe("5511987654321"); // 13 dígitos → null
    expect(normalizePhoneBR("+55 (11) 98765-4321")).not.toBe("11987654321");
    // exemplo de exatamente 11 dígitos com ruído
    expect(normalizePhoneBR("11-98765-4321")).toBe("11987654321");
  });
});

describe("validatePhoneBR", () => {
  it("aceita vazio quando opcional e retorna value=null", () => {
    const r = validatePhoneBR("", { fieldLabel: "Telefone" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it("rejeita vazio quando required=true", () => {
    const r = validatePhoneBR("", { fieldLabel: "Telefone", required: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("obrigatório");
  });

  it("aceita 10 e 11 dígitos e retorna somente dígitos", () => {
    const a = validatePhoneBR("(11) 3322-4455");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.value).toBe("1133224455");

    const b = validatePhoneBR("(11) 98765-4321");
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value).toBe("11987654321");
  });

  it("rejeita comprimento inválido com mensagem em pt-BR", () => {
    const r = validatePhoneBR("119", { fieldLabel: "Telefone comercial" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Telefone comercial");
      expect(r.error).toContain("10 ou 11 dígitos");
    }
  });

  it("aceita valores numéricos", () => {
    const r = validatePhoneBR(11987654321);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("11987654321");
  });
});
