import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { table?: string; column?: string; ids?: string[] } = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      state.table = table;
      return {
        select: () => ({
          in: (column: string, ids: string[]) => {
            state.column = column;
            state.ids = ids;
            return Promise.resolve({
              data: ids.map((id) => ({ user_id: id, nome: `Nome ${id}`, email: `${id}@x.com` })),
              error: null,
            });
          },
        }),
      };
    },
  },
}));

import {
  fetchProfilesByUserIds,
  displayPartnerUserName,
  PROFILE_USER_ID_COLUMN,
  MISSING_PROFILE_LABEL,
} from "@/lib/partnerUserProfiles";

describe("partner_users -> profiles mapping", () => {
  beforeEach(() => {
    state.table = undefined;
    state.column = undefined;
    state.ids = undefined;
  });

  it("usa a coluna user_id (nunca profiles.id) para casar ids de autenticação", async () => {
    expect(PROFILE_USER_ID_COLUMN).toBe("user_id");
    await fetchProfilesByUserIds(["u1", "u2"]);
    expect(state.table).toBe("profiles");
    expect(state.column).toBe("user_id");
  });

  it("deduplica ids e devolve mapa indexado por user_id", async () => {
    const map = await fetchProfilesByUserIds(["u1", "u1", "u2", ""]);
    expect(state.ids).toEqual(["u1", "u2"]);
    expect(map.get("u1")?.nome).toBe("Nome u1");
    expect(map.size).toBe(2);
  });

  it("não consulta o banco quando não há ids", async () => {
    const map = await fetchProfilesByUserIds([]);
    expect(map.size).toBe(0);
    expect(state.table).toBeUndefined();
  });

  it("expõe fallback explícito quando não existe profile", () => {
    expect(displayPartnerUserName(undefined, "79cdba52-f388-4f03-a919-8b6eaee2c552")).toContain(
      MISSING_PROFILE_LABEL,
    );
    expect(
      displayPartnerUserName({ user_id: "u1", nome: "Fagner Furtado", email: "f@x.com" }, "u1"),
    ).toBe("Fagner Furtado");
  });
});
