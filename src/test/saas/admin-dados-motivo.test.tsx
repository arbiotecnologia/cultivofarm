import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { useEditarAdminEmpresa } from "@/hooks/usePlataformaSaaS";

const input = { inviteId: "invite-test", nome: "Admin Teste", telefone: "", cpf: "", expectedUpdatedAt: "2026-10-07T17:10:00Z" };
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, {
  client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
}, children);

describe("Dados do administrador — motivo opcional no payload canônico", () => {
  beforeEach(() => rpc.mockReset());

  it.each([undefined, null, "", "   ", " ok ", "Correção"])("aceita %j e preserva ausência sem motivo fictício", async (motivo) => {
    rpc.mockResolvedValue({ data: { idempotent: false }, error: null });
    const { result } = renderHook(useEditarAdminEmpresa, { wrapper });
    await act(() => result.current.mutateAsync({ ...input, motivo }));
    expect(rpc).toHaveBeenCalledWith("platform_update_org_admin", expect.objectContaining({
      _invite_id: input.inviteId, _motivo: motivo?.trim() ?? "", _expected_updated_at: input.expectedUpdatedAt,
      _idempotency_key: expect.any(String), _telefone: null, _cpf: null,
    }));
  });

  it("nega um caractere após trim antes da RPC", async () => {
    const { result } = renderHook(useEditarAdminEmpresa, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ ...input, motivo: " x " })).rejects.toThrow(/ao menos 2 caracteres/);
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retry após falha mantém chave para null e vazio equivalentes", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "network", message: "Falha" } })
      .mockResolvedValueOnce({ data: { idempotent: true }, error: null });
    const { result } = renderHook(useEditarAdminEmpresa, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ ...input, motivo: null })).rejects.toThrow(); });
    await act(() => result.current.mutateAsync({ ...input, motivo: "   " }));
    expect(rpc.mock.calls[0][1]._idempotency_key).toBe(rpc.mock.calls[1][1]._idempotency_key);
    expect(rpc.mock.calls[1][1]._motivo).toBe("");
  });
});