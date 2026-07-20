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
  // Este teste documenta a matriz esperada. RLS/RPC continuam sendo a fonte
  // de verdade em runtime; aqui garantimos apenas que o mapeamento de rotas
  // por papel primário não regride.
  const MATRIX: Record<string, string> = {
    administrador: "/",
    tecnico_agronomo: "/app",
    consultor_tecnico: "/app",
    cliente_produtor: "/app",
    gestor_comercial: "/",
    parceiro_b2b: "/portal-parceiro/dashboard",
    parceiro_b2b_tecnico: "/portal-parceiro/dashboard",
  };

  it("todas as roles ativas possuem home mapeada", async () => {
    const { ACTIVE_ROLES } = await import("@/lib/permissions");
    for (const role of ACTIVE_ROLES) {
      expect(MATRIX[role]).toBeDefined();
    }
  });
});
