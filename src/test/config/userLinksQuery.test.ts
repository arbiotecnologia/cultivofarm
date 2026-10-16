import { describe, it, expect, vi, beforeEach } from "vitest";

const transport = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rest: transport,
    rpc(this: { rest: typeof transport }, fn: string, args: unknown) {
      return this.rest.rpc(fn, args);
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { carregarVinculosUsuarios } from "@/lib/configuracoes/userLinksQuery";

const U = "11111111-1111-4111-8111-111111111111";
const item = { user_id: U, clientes: [], parceiro: null, parceiros_total: 0, fora_do_alcance: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  transport.rpc.mockReturnValue({ abortSignal: transport.abortSignal });
  transport.abortSignal.mockResolvedValue({ data: { items: [item] }, error: null });
});

describe("integração da leitura de vínculos preserva o receiver", () => {
  it("reproduz a falha original quando o método é extraído", () => {
    const detached = supabase.rpc;
    expect(() => detached("tenant_admin_user_links" as never, { p_user_ids: [U] } as never)).toThrow(TypeError);
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it("chama o transporte dependente de this, uma vez por lote, e encaminha o cancelamento", async () => {
    const signal = new AbortController().signal;
    const result = await carregarVinculosUsuarios([U], signal);
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith("tenant_admin_user_links", { p_user_ids: [U] });
    expect(transport.abortSignal).toHaveBeenCalledExactlyOnceWith(signal);
    expect(result.get(U)).toEqual(item);
  });

  it("propaga negação de acesso sem transformar em resposta vazia", async () => {
    transport.abortSignal.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(carregarVinculosUsuarios([U], new AbortController().signal)).rejects.toThrow("Não foi possível carregar os vínculos.");
  });

  it("mantém a validação estrita do retorno da integração", async () => {
    transport.abortSignal.mockResolvedValue({ data: { items: [{ ...item, fora_do_alcance: -1 }] }, error: null });
    await expect(carregarVinculosUsuarios([U], new AbortController().signal)).rejects.toThrow("Resposta de vínculos inválida.");
  });

  it("propaga falha de transporte sem retry próprio", async () => {
    transport.abortSignal.mockRejectedValue(new TypeError("Network failure"));
    await expect(carregarVinculosUsuarios([U], new AbortController().signal)).rejects.toThrow("Network failure");
    expect(transport.rpc).toHaveBeenCalledTimes(1);
  });
});