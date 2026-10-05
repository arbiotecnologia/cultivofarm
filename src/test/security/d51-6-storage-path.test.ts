import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, maybeSingle, eq, select } = vi.hoisted(() => {
  const getUser = vi.fn();
  const maybeSingle = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  eq.mockImplementation(() => ({ eq, maybeSingle }));
  select.mockImplementation(() => ({ eq }));
  return { getUser, maybeSingle, eq, select };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser },
    from: () => ({ select }),
  },
}));

import { buildTenantStoragePath, isTenantScopedStoragePath } from "@/lib/tenantStoragePath";

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("D51.6 tenant storage paths", () => {
  it("prefixa novos objetos com a organização ativa da sessão", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { organization_id: ORG_A, ativo: true }, error: null });
    await expect(buildTenantStoragePath("visita/foto/a.jpg")).resolves.toBe(`${ORG_A}/visita/foto/a.jpg`);
  });

  it("rejeita perfil sem organização ativa", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { organization_id: null, ativo: true }, error: null });
    await expect(buildTenantStoragePath("visita/foto/a.jpg")).rejects.toThrow("Organização ativa não encontrada");
  });

  it("não considera caminho de outra organização como pertencente à sessão", () => {
    expect(isTenantScopedStoragePath(`${ORG_B}/visita/foto/a.jpg`, ORG_A)).toBe(false);
    expect(isTenantScopedStoragePath(`${ORG_A}/visita/foto/a.jpg`, ORG_A)).toBe(true);
  });

  it("rejeita travessia de diretório", async () => {
    await expect(buildTenantStoragePath("../segredo.pdf")).rejects.toThrow("Caminho de arquivo inválido");
  });
});