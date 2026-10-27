import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ calls: [] as { name: string; args: Record<string, unknown> }[], error: null as unknown }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (name: string, args: Record<string, unknown>) => { state.calls.push({ name, args });
    return { abortSignal: () => Promise.resolve({ data: null, error: state.error }) }; } },
}));
import { LABEL_BUSY_MESSAGE, LABEL_CONFLICT_MESSAGE, labelError, setCatalogLabelActive, updateCatalogLabel } from "@/lib/catalogo/platformCatalogLabels";

const L = { id: "00000000-0000-4000-8000-000000000101", rotulo: "fungicida", ativo: true, updated_at: "2026-10-21T10:00:00+00:00" };
const K = "00000000-0000-4000-8000-000000000301";
afterEach(() => { state.calls = []; state.error = null; });

describe("rótulos: conflito negocial PT409", () => {
  it("PT409 e 40001 residual mapeiam para conflito; serialização não vira sucesso", () => {
    expect(labelError({ code: "PT409" })).toBe(LABEL_CONFLICT_MESSAGE);
    expect(labelError({ code: "40001" })).toBe(LABEL_CONFLICT_MESSAGE);
  });
  it("renomear com PT409: uma única chamada, sem retry, revisão antiga enviada intacta", async () => {
    state.error = { code: "PT409", message: "catalog_label_conflict" };
    await expect(updateCatalogLabel(L, "Novo nome", "motivo de teste ok", K, new AbortController().signal)).rejects.toThrow(LABEL_CONFLICT_MESSAGE);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].args.p_expected_updated_at).toBe(L.updated_at);
  });
  it("ativar/inativar com PT409 (confirmação): uma única chamada, sem retry", async () => {
    state.error = { code: "PT409", message: "catalog_label_confirmation_failed" };
    await expect(setCatalogLabelActive(L, false, "motivo de teste ok", K, new AbortController().signal)).rejects.toThrow(LABEL_CONFLICT_MESSAGE);
    expect(state.calls).toHaveLength(1);
  });
  it("lock_timeout 55P03 / gate PT503: mensagem de ocupado, uma única chamada, sem retry", async () => {
    expect(labelError({ code: "55P03" })).toBe(LABEL_BUSY_MESSAGE);
    expect(labelError({ code: "PT503" })).toBe(LABEL_BUSY_MESSAGE);
    state.error = { code: "55P03", message: "canceling statement due to lock timeout" };
    await expect(updateCatalogLabel(L, "Novo nome", "motivo de teste ok", K, new AbortController().signal)).rejects.toThrow(LABEL_BUSY_MESSAGE);
    expect(state.calls).toHaveLength(1);
  });
});
