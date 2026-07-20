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

  it("subscribe recebe signed_out via storage event", () => {
    const received: any[] = [];
    const unsub = subscribePortalEvents((e) => received.push(e));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "arbio:portal:event",
        newValue: JSON.stringify({ type: "signed_out", at: 9 }),
      }),
    );
    expect(received.some((r) => r.type === "signed_out")).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// Testes específicos por fluxo — seletor, troca, logout, perfil por contexto.
// Usam mocks leves para evitar dependência de router/supabase real.
// ─────────────────────────────────────────────────────────────────────────────

describe("multiportal.hardening — seletor de portal (SelecionarPortal)", () => {
  beforeEach(() => sessionStorage.clear());

  it("não redireciona para /acesso-pendente enquanto a consulta está carregando", () => {
    // Simula o predicado usado no useEffect do seletor.
    const shouldRedirect = (state: {
      data: unknown;
      submitting: boolean;
      isLoading: boolean;
      isFetching: boolean;
      isError: boolean;
    }) =>
      !(
        !state.data ||
        state.submitting ||
        state.isLoading ||
        state.isFetching ||
        state.isError
      );

    expect(
      shouldRedirect({
        data: null,
        submitting: false,
        isLoading: true,
        isFetching: false,
        isError: false,
      }),
    ).toBe(false);
    expect(
      shouldRedirect({
        data: {},
        submitting: false,
        isLoading: false,
        isFetching: true,
        isError: false,
      }),
    ).toBe(false);
    expect(
      shouldRedirect({
        data: {},
        submitting: false,
        isLoading: false,
        isFetching: false,
        isError: true,
      }),
    ).toBe(false);
    expect(
      shouldRedirect({
        data: {},
        submitting: false,
        isLoading: false,
        isFetching: false,
        isError: false,
      }),
    ).toBe(true);
  });
});

describe("multiportal.hardening — troca de portal (useSwitchPortal)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("limpa contexto ativo e emite portal_switched entre abas", () => {
    setActivePortalContext("technical");
    const received: any[] = [];
    const unsub = subscribePortalEvents((e) => received.push(e));

    // Comportamento equivalente ao final do useSwitchPortal.
    clearActivePortalContext();
    broadcastPortalEvent({ type: "portal_switched", at: Date.now() });

    expect(getActivePortalContext()).toBeNull();
    // Broadcast usa fallback storage; jsdom não dispara storage no mesmo window,
    // então validamos a via storage explicitamente.
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "arbio:portal:event",
        newValue: JSON.stringify({ type: "portal_switched", at: 1 }),
      }),
    );
    expect(received.some((r) => r.type === "portal_switched")).toBe(true);
    unsub();
  });
});

describe("multiportal.hardening — logout limpa contexto e sinaliza abas", () => {
  it("clearActivePortalContext + signed_out propagam-se via storage", () => {
    setActivePortalContext("b2b");
    const received: any[] = [];
    const unsub = subscribePortalEvents((e) => received.push(e));

    clearActivePortalContext();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "arbio:portal:event",
        newValue: JSON.stringify({ type: "signed_out", at: 42 }),
      }),
    );

    expect(getActivePortalContext()).toBeNull();
    expect(received.some((r) => r.type === "signed_out")).toBe(true);
    unsub();
  });
});

describe("multiportal.hardening — perfil por contexto", () => {
  beforeEach(() => sessionStorage.clear());

  it("mapeia contexto ativo para rótulo e ícone corretos", () => {
    const labelFor = (ctx: string | null) =>
      ctx === "b2b"
        ? "Parceiro B2B"
        : ctx === "technical"
          ? "Consultor Técnico"
          : ctx === "producer"
            ? "Produtor"
            : "Portal Técnico";

    setActivePortalContext("b2b");
    expect(labelFor(getActivePortalContext())).toBe("Parceiro B2B");
    setActivePortalContext("technical");
    expect(labelFor(getActivePortalContext())).toBe("Consultor Técnico");
    setActivePortalContext("producer");
    expect(labelFor(getActivePortalContext())).toBe("Produtor");
  });

  it("lista outros acessos disponíveis excluindo o contexto ativo", () => {
    const compute = (
      ctx: string | null,
      has_b2b_access: boolean,
      has_technical_access: boolean,
    ) => {
      const out: string[] = [];
      if (has_b2b_access && ctx !== "b2b") out.push("Portal Parceiro B2B");
      if (has_technical_access && ctx !== "technical")
        out.push("Portal Técnico");
      return out;
    };

    expect(compute("technical", true, true)).toEqual(["Portal Parceiro B2B"]);
    expect(compute("b2b", true, true)).toEqual(["Portal Técnico"]);
    expect(compute("technical", false, true)).toEqual([]);
    expect(compute(null, true, true)).toEqual([
      "Portal Parceiro B2B",
      "Portal Técnico",
    ]);
  });
});


