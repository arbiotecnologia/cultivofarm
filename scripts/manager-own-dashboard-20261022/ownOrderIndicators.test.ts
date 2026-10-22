import { describe, expect, it } from "vitest";
import { ownOrderIndicators } from "./ownOrderIndicators";
describe("observed own rows only", () => {
  it("counts exact statuses without inferring pending, money or delivery", () => {
    expect(ownOrderIndicators([{ status: "aguardando_ajuste_comercial" }, { status: "entregue" }, { status: "entregue" }, { status: "future_status" }])).toEqual({
      observed: 4, atLimit: false, byStatus: [{ status: "aguardando_ajuste_comercial", count: 1 }, { status: "entregue", count: 2 }, { status: "future_status", count: 1 }],
    });
  });
  it("marks a full capped slice, not a global total", () => {
    expect(ownOrderIndicators(Array.from({ length: 100 }, () => ({ status: "solicitado" })))).toEqual({ observed: 100, atLimit: true, byStatus: [{ status: "solicitado", count: 100 }] });
    expect(ownOrderIndicators(Array.from({ length: 99 }, () => ({ status: "solicitado" }))).atLimit).toBe(false);
  });
  it("empty slice has no synthetic statuses", () => expect(ownOrderIndicators([])).toEqual({ observed: 0, atLimit: false, byStatus: [] }));
});