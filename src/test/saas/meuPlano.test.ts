import { describe, it, expect } from "vitest";
import {
  comporModulos,
  formatarLimite,
  STATUS_ASSINATURA_LABEL,
  assinaturaLiberaNovosUsos,
  totalIncluidas,
  type CatalogoFeature,
  type CatalogoModulo,
  type EntitlementEfetivo,
} from "@/lib/saas/meuPlano";

const modulos: CatalogoModulo[] = [
  { id: "m1", key: "fiscal", name: "Fiscal", active: true },
  { id: "m2", key: "comunicacao", name: "Comunicação", active: true },
  { id: "m3", key: "inativo", name: "Inativo", active: false },
];

const features: CatalogoFeature[] = [
  { id: "f1", module_id: "m1", key: "emissao_nfe_nfse", name: "Emissão NF-e/NFS-e", active: true },
  { id: "f2", module_id: "m1", key: "envio_sefaz", name: "Envio SEFAZ", active: true },
  { id: "f3", module_id: "m2", key: "envios_automaticos", name: "Envios automáticos", active: true },
  { id: "f4", module_id: "m1", key: "feature_inativa", name: "Inativa", active: false },
  { id: "f5", module_id: "m3", key: "de_modulo_inativo", name: "Órfã", active: true },
];

const entitlements: EntitlementEfetivo[] = [
  { module_key: "fiscal", feature_key: "emissao_nfe_nfse", limit_value: null },
  { module_key: "fiscal", feature_key: "envio_sefaz", limit_value: 50 },
  { module_key: "comunicacao", feature_key: "envios_automaticos", limit_value: null },
  { module_key: "fantasma", feature_key: "feature_orfa", limit_value: null },
];

describe("comporModulos", () => {
  it("agrupa por módulo e marca o que está incluído", () => {
    const res = comporModulos(modulos, features, entitlements);
    expect(res).toHaveLength(2); // módulo inativo some
    const fiscal = res.find((m) => m.key === "fiscal")!;
    expect(fiscal.features).toHaveLength(2); // feature inativa some
    expect(fiscal.features.find((f) => f.key === "emissao_nfe_nfse")?.incluida).toBe(true);
    expect(fiscal.features.find((f) => f.key === "envio_sefaz")?.limitValue).toBe(50);
  });

  it("ignora entitlement órfão (feature fora do catálogo)", () => {
    const res = comporModulos(modulos, features, entitlements);
    const todas = res.flatMap((m) => m.features);
    expect(todas.some((f) => f.key === "feature_orfa")).toBe(false);
  });

  it("sem entitlements, tudo fica não contratado", () => {
    const res = comporModulos(modulos, features, []);
    expect(res.flatMap((m) => m.features).every((f) => !f.incluida)).toBe(true);
  });
});

describe("totalIncluidas", () => {
  it("conta apenas funcionalidades incluídas", () => {
    const res = comporModulos(modulos, features, entitlements);
    expect(totalIncluidas(res)).toBe(3);
  });
});

describe("formatarLimite", () => {
  it("retorna null para ausência de limite", () => {
    expect(formatarLimite(null)).toBeNull();
  });
  it("formata número em pt-BR", () => {
    expect(formatarLimite(1500)).toBe("1.500");
  });
});

describe("STATUS_ASSINATURA_LABEL", () => {
  it("cobre os status canônicos da S1", () => {
    expect(Object.keys(STATUS_ASSINATURA_LABEL).sort()).toEqual(
      ["ACTIVE", "CANCELLED", "EXPIRED", "PAST_DUE", "SUSPENDED", "TRIAL"].sort(),
    );
  });
});

describe("assinaturaLiberaNovosUsos", () => {
  it("libera apenas ativa ou trial versionados", () => {
    expect(assinaturaLiberaNovosUsos("ACTIVE", true)).toBe(true);
    expect(assinaturaLiberaNovosUsos("TRIAL", true)).toBe(true);
    expect(assinaturaLiberaNovosUsos("PAST_DUE", true)).toBe(false);
    expect(assinaturaLiberaNovosUsos("ACTIVE", false)).toBe(false);
  });
});
