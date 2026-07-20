import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  broadcastPortalEvent,
  subscribePortalEvents,
} from "@/lib/portalBroadcast";
import {
  getActivePortalContext,
  setActivePortalContext,
  clearActivePortalContext,
} from "@/lib/activePortalContext";

describe("multiportal.hardening — activePortalContext storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("armazena e recupera contexto ativo", () => {
    setActivePortalContext("technical");
    expect(getActivePortalContext()).toBe("technical");
  });

  it("rejeita valores desconhecidos como null", () => {
    sessionStorage.setItem("active_portal_context", "invalido");
    expect(getActivePortalContext()).toBeNull();
  });

  it("clearActivePortalContext limpa a chave", () => {
    setActivePortalContext("b2b");
    clearActivePortalContext();
    expect(getActivePortalContext()).toBeNull();
  });
});

describe("multiportal.hardening — cross-tab broadcast", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("subscribe recebe eventos disparados via broadcastPortalEvent (fallback storage)", async () => {
    const received: any[] = [];
    const unsub = subscribePortalEvents((e) => received.push(e));

    // Simula fallback via storage event (jsdom não dispara BroadcastChannel entre same-window)
    const ev = { type: "portal_switched", at: 1 } as const;
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "arbio:portal:event",
        newValue: JSON.stringify(ev),
      }),
    );

    expect(received.some((r) => r.type === "portal_switched")).toBe(true);
    unsub();
  });

  it("broadcastPortalEvent não lança quando storage indisponível", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() =>
      broadcastPortalEvent({ type: "signed_out", at: 2 }),
    ).not.toThrow();
    spy.mockRestore();
  });
});

describe("multiportal.hardening — matriz de acesso (contrato)", () => {
  it("getHomeForRole cobre todas as roles ativas com destino não-vazio", async () => {
    const { ACTIVE_ROLES, getHomeForRole } = await import("@/lib/permissions");
    for (const role of ACTIVE_ROLES) {
      const home = getHomeForRole(role);
      expect(typeof home).toBe("string");
      expect(home.length).toBeGreaterThan(0);
    }
  });

  it("papéis B2B são direcionados ao portal-parceiro", async () => {
    const { getHomeForRole } = await import("@/lib/permissions");
    expect(getHomeForRole("parceiro_b2b")).toMatch(/portal-parceiro/);
    expect(getHomeForRole("parceiro_b2b_tecnico")).toMatch(/portal-parceiro/);
  });
});

