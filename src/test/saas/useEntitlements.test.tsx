import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "administrador",
  context: "legacy_unversioned",
  features: [] as string[],
  contextError: false,
  calls: [] as string[],
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-a" }, roles: [state.role] }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string) => {
      state.calls.push(name);
      if (name === "get_my_entitlement_context") {
        return state.contextError
          ? { data: null, error: { message: "indisponível" } }
          : { data: state.context, error: null };
      }
      if (name === "get_my_entitlements") {
        return { data: state.features.map((feature_key) => ({ feature_key })), error: null };
      }
      return { data: null, error: { message: "rpc inesperada" } };
    },
  },
}));

import { useEntitlements } from "@/hooks/useEntitlements";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("D52 P0 — decisão server-side de entitlements", () => {
  beforeEach(() => {
    state.role = "administrador";
    state.context = "legacy_unversioned";
    state.features = [];
    state.contextError = false;
    state.calls = [];
  });

  it("não concede bypass ao papel superadmin quando o servidor retorna legado", async () => {
    state.role = "superadmin";
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("legacy_unversioned"));
    expect(state.calls).toEqual(["get_my_entitlement_context"]);
  });

  it("concede bypass somente quando o servidor confirma Platform Superadmin", async () => {
    state.context = "platform_superadmin";
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("platform_superadmin"));
    expect(state.calls).toEqual(["get_my_entitlement_context"]);
  });

  it.each(["active", "trial_active"])("carrega somente features retornadas em contexto %s", async (context) => {
    state.context = context;
    state.features = ["contas_receber"];
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status === "ready" ? [...result.current.features] : []).toEqual(["contas_receber"]);
    expect(state.calls).toEqual(["get_my_entitlement_context", "get_my_entitlements"]);
  });

  it("mantém erro fail-closed sem consultar features", async () => {
    state.contextError = true;
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(state.calls).toEqual(["get_my_entitlement_context"]);
  });
});