import { describe, expect, it } from "vitest";
import {
  commercialDraftFingerprint,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  motivoComercialNormalizado,
} from "@/components/plataforma/commercialDraftState";

describe("estado canônico do DRAFT comercial", () => {
  it("faz round-trip de datetime-local no fuso do usuário sem deslocar o horário civil", () => {
    const local = "2026-10-07T00:13";
    const iso = datetimeLocalToIso(local);
    expect(iso).not.toBeNull();
    expect(isoToDatetimeLocal(iso)).toBe(local);
  });

  it("ignora ordem de features e chaves de limites no fingerprint lógico", () => {
    const base = {
      planKey: "base", priceCents: 5990, currency: "BRL" as const, billingCycle: "monthly",
      trialDays: "14", effectiveFromLocal: "2026-10-07T00:13",
    };
    expect(commercialDraftFingerprint({
      ...base, limits: { usuarios: 3, unidades: 2 }, featureKeys: ["visitas", "agenda"],
    })).toBe(commercialDraftFingerprint({
      ...base, limits: { unidades: 2, usuarios: 3 }, featureKeys: ["agenda", "visitas"],
    }));
  });

  it.each([
    ["", null],
    [" ", null],
    ["a", null],
    ["  a  ", null],
    ["ab", "ab"],
    ["  ab  ", "ab"],
    ["á🌱", "á🌱"],
  ])("normaliza o motivo %j com mínimo de dois caracteres", (input, expected) => {
    expect(motivoComercialNormalizado(input)).toBe(expected);
  });
});