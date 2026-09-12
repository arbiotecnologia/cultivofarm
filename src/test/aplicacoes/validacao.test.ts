import { describe, it, expect } from "vitest";
import { validarAplicacao } from "@/lib/aplicacoes/validacao";

const base = { osId: "os-1", doseAplicada: "100", areaAplicada: "10" };

describe("validarAplicacao", () => {
  it("aceita entrada válida", () => {
    expect(validarAplicacao(base)).toBeNull();
  });
  it("exige OS", () => {
    expect(validarAplicacao({ ...base, osId: "" })).toBe("Selecione a OS");
  });
  it("exige dose e área", () => {
    expect(validarAplicacao({ ...base, doseAplicada: "" })).toBe("Informe dose e área");
  });
  it("rejeita dose zero ou negativa", () => {
    expect(validarAplicacao({ ...base, doseAplicada: "0" })).toMatch(/Dose/);
    expect(validarAplicacao({ ...base, areaAplicada: "-5" })).toMatch(/Área/);
  });
  it("rejeita NaN", () => {
    expect(validarAplicacao({ ...base, doseAplicada: "abc" })).toMatch(/Dose/);
  });
  it("limita umidade a 0-100", () => {
    expect(validarAplicacao({ ...base, umidade: "120" })).toMatch(/Umidade/);
    expect(validarAplicacao({ ...base, umidade: "80" })).toBeNull();
  });
  it("exige término após início", () => {
    expect(
      validarAplicacao({ ...base, horaInicio: "2026-09-12T10:00", horaFim: "2026-09-12T09:00" }),
    ).toMatch(/posterior/);
  });
  it("exige motivo na retificação", () => {
    expect(validarAplicacao({ ...base, rectifyId: "a" })).toMatch(/motivo/);
  });
});
