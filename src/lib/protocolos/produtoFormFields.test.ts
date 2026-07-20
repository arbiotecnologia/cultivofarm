import { describe, expect, it } from "vitest";
import {
  normalizeVersaoCatalogoForSave,
  versaoCatalogoToInput,
} from "./produtoFormFields";

describe("versao_catalogo · ciclo limpar → salvar → reabrir", () => {
  it("ao salvar com campo limpo, envia null (não 'v1.2')", () => {
    expect(normalizeVersaoCatalogoForSave("")).toBeNull();
    expect(normalizeVersaoCatalogoForSave("   ")).toBeNull();
    expect(normalizeVersaoCatalogoForSave(null)).toBeNull();
    expect(normalizeVersaoCatalogoForSave(undefined)).toBeNull();
  });

  it("ao salvar com valor preenchido, preserva sem fallback", () => {
    expect(normalizeVersaoCatalogoForSave("v2.0")).toBe("v2.0");
    expect(normalizeVersaoCatalogoForSave("  v3.1  ")).toBe("v3.1");
  });

  it("ao reabrir, null/undefined do banco viram string vazia (não 'v1.2')", () => {
    expect(versaoCatalogoToInput(null)).toBe("");
    expect(versaoCatalogoToInput(undefined)).toBe("");
  });

  it("ao reabrir, valor persistido é mantido", () => {
    expect(versaoCatalogoToInput("v2.0")).toBe("v2.0");
  });

  it("fluxo completo: limpar → salvar → reabrir mantém vazio", () => {
    const inputLimpo = "";
    const salvo = normalizeVersaoCatalogoForSave(inputLimpo);
    expect(salvo).toBeNull();
    // simula releitura do banco
    const reaberto = versaoCatalogoToInput(salvo);
    expect(reaberto).toBe("");
  });
});
