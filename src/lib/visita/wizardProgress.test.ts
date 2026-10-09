import { describe, expect, it } from "vitest";
import { wizardUnlockedUpTo } from "./wizardProgress";

describe("pré-requisitos persistidos do wizard", () => {
  const complete = { identificacao: true, checkin: true, campo: true, diagnostico: true, recomendacao: true };
  it("libera revisão 7 e acompanhamento 8 sem qualquer anexo", () => {
    expect(wizardUnlockedUpTo(complete)).toBe(8);
  });
  it.each([
    ["identificacao", 1], ["checkin", 2], ["campo", 3], ["diagnostico", 4], ["recomendacao", 5],
  ] as const)("não avança sem %s persistido", (key, expected) => {
    expect(wizardUnlockedUpTo({ ...complete, [key]: false })).toBe(expected);
  });
});