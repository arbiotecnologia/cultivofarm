import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  labels: { data: undefined as unknown, isSuccess: false, isError: false },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { abortSignal: () => {
        const data = state.rpcResult.data && typeof state.rpcResult.data === "object" && args.p_idempotency_key
          ? { ...(state.rpcResult.data as Record<string, unknown>), idempotency_key: args.p_idempotency_key }
          : state.rpcResult.data;
        return Promise.resolve({ data, error: state.rpcResult.error });
      } };
    },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" }, session: { user: { id: "u1" }, expires_at: 9999999999 },
    profile: { id: "p1", user_id: "u1", ativo: true, senha_provisoria: false, organization_id: null },
    roles: ["superadmin"], loading: false, error: null,
  }),
}));
vi.mock("@/lib/catalogo/platformCatalogLabels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/catalogo/platformCatalogLabels")>();
  return { ...actual, usePlatformCatalogLabels: () => state.labels };
});
vi.mock("@/lib/catalogo/platformCatalogRead", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/catalogo/platformCatalogRead")>();
  return { ...actual, platformCatalogAccess: () => ({ ready: true, scope: "scope-A" }) };
});

import { createCatalogLabel, labelError, listCatalogLabels, setCatalogLabelActive,
  updateCatalogLabel } from "@/lib/catalogo/platformCatalogLabels";
import { isClassAllowed } from "@/lib/catalogo/platformCatalogFamily";
import { platformCatalogPageSchema } from "@/lib/catalogo/platformCatalogRead";
import { PlatformCatalogFamilyDialog } from "@/components/plataforma/PlatformCatalogFamilyDialog";

const LABELS = [
  { id: "00000000-0000-4000-8000-000000000101", familia: "quimico", rotulo: "fungicida", rotulo_exibicao: "Fungicida", ativo: false, updated_at: "2026-10-21T10:00:00+00:00" },
  { id: "00000000-0000-4000-8000-000000000102", familia: "quimico", rotulo: "inseticida", rotulo_exibicao: "Inseticida", ativo: true, updated_at: "2026-10-21T10:00:00+00:00" },
  { id: "00000000-0000-4000-8000-000000000103", familia: "quimico", rotulo: "herbicida", rotulo_exibicao: "Herbicida", ativo: true, updated_at: "2026-10-21T10:00:00+00:00" },
];
const PRODUCT = { id: "00000000-0000-4000-8000-000000000201", updated_at: "2026-10-21T11:00:00+00:00",
  familia_catalogo: "quimico" as const, classe_catalogo: "fungicida", nome: "Produto P" };
const RECEIPT = { id: PRODUCT.id, familia_catalogo: "quimico", classe_catalogo: "herbicida",
  updated_at: "2026-10-21T12:00:00+00:00", idempotency_key: "00000000-0000-4000-8000-000000000301",
  audit_id: "00000000-0000-4000-8000-000000000302", idempotent: false };

afterEach(() => { cleanup(); state.rpcCalls = []; state.rpcResult = { data: null, error: null }; });

describe("fonte canônica de rótulos — lib", () => {
  it("mapeia códigos de erro do servidor", () => {
    expect(labelError({ code: "42501" })).toContain("Sem permissão");
    expect(labelError({ code: "40001" })).toContain("mudou");
    expect(labelError({ code: "23505" })).toContain("Já existe");
    expect(labelError({ code: "22023" })).toContain("Dados inválidos");
    expect(labelError(null)).toContain("Não foi possível");
  });
  it("lista rótulos validados e rejeita payload malformado", async () => {
    state.rpcResult = { data: LABELS, error: null };
    const list = await listCatalogLabels("quimico", new AbortController().signal);
    expect(list).toHaveLength(3);
    expect(state.rpcCalls[0]).toEqual({ name: "platform_list_catalog_labels", args: { p_familia: "quimico" } });
    state.rpcResult = { data: [{ rotulo: "x" }], error: null };
    await expect(listCatalogLabels("quimico", new AbortController().signal)).rejects.toThrow("Não foi possível");
  });
  it("cria rótulo com recibo ecoado e mapeia duplicidade", async () => {
    const receipt = { id: LABELS[1].id, familia: "fertilizante_adubo", rotulo: "npk", rotulo_exibicao: "NPK",
      ativo: true, idempotency_key: RECEIPT.idempotency_key, audit_id: RECEIPT.audit_id, idempotent: false };
    state.rpcResult = { data: receipt, error: null };
    const r = await createCatalogLabel({ familia: "fertilizante_adubo", rotulo: "NPK ", rotulo_exibicao: "NPK" },
      "motivo válido dez", RECEIPT.idempotency_key, new AbortController().signal);
    expect(r.rotulo).toBe("npk");
    expect(state.rpcCalls[0].args.p_rotulo).toBe("npk");
    state.rpcResult = { data: null, error: { code: "23505" } };
    await expect(createCatalogLabel({ familia: "fertilizante_adubo", rotulo: "npk", rotulo_exibicao: "NPK" },
      "motivo válido dez", RECEIPT.idempotency_key, new AbortController().signal)).rejects.toThrow("Já existe");
  });
  it("renomeação exige versão nova no recibo (CAS)", async () => {
    const target = { id: LABELS[1].id, updated_at: LABELS[1].updated_at, rotulo: "inseticida" };
    state.rpcResult = { data: { id: target.id, familia: "quimico", rotulo: "inseticida", rotulo_exibicao: "Inseticida X",
      updated_at: target.updated_at, idempotency_key: RECEIPT.idempotency_key, audit_id: RECEIPT.audit_id, idempotent: false }, error: null };
    await expect(updateCatalogLabel(target, "Inseticida X", "motivo válido dez", RECEIPT.idempotency_key,
      new AbortController().signal)).rejects.toThrow("Não foi possível");
    state.rpcResult = { data: null, error: { code: "40001" } };
    await expect(updateCatalogLabel(target, "Inseticida X", "motivo válido dez", RECEIPT.idempotency_key,
      new AbortController().signal)).rejects.toThrow("mudou");
  });
  it("inativação ecoa alvo e rejeita recibo de outro rótulo", async () => {
    const target = { id: LABELS[2].id, updated_at: LABELS[2].updated_at, rotulo: "herbicida", ativo: true };
    state.rpcResult = { data: { id: target.id, familia: "quimico", rotulo: "outro", ativo: false,
      updated_at: "2026-10-21T12:00:00+00:00", idempotency_key: RECEIPT.idempotency_key, audit_id: RECEIPT.audit_id, idempotent: false }, error: null };
    await expect(setCatalogLabelActive(target, false, "motivo válido dez", RECEIPT.idempotency_key,
      new AbortController().signal)).rejects.toThrow("Não foi possível");
    await expect(setCatalogLabelActive({ ...target, ativo: false }, false, "motivo válido dez", RECEIPT.idempotency_key,
      new AbortController().signal)).rejects.toThrow("Nenhuma alteração");
  });
  it("isClassAllowed falha fechado sem fonte canônica e exige rótulo ativo", () => {
    expect(isClassAllowed("quimico", null)).toBe(true);
    expect(isClassAllowed("quimico", "herbicida")).toBe(false);
    expect(isClassAllowed("quimico", "herbicida", LABELS)).toBe(true);
    expect(isClassAllowed("quimico", "fungicida", LABELS)).toBe(false);
    expect(isClassAllowed("quimico", "inventado", LABELS)).toBe(false);
  });
  it("leitor do catálogo aceita rótulo novo ainda desconhecido do frontend", () => {
    const page = { items: [{ id: PRODUCT.id, codigo: null, nome: "P", tipo: null, ativo: true, b2b_enabled: true,
      updated_at: null, familia_catalogo: "fertilizante_adubo", classe_catalogo: "npk_organomineral" }], has_more: false };
    const parsed = platformCatalogPageSchema.safeParse(page);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.items[0].classe_catalogo).toBe("npk_organomineral");
  });
});

describe("diálogo de classificar com rótulos do servidor", () => {
  const renderDialog = () => render(<PlatformCatalogFamilyDialog product={PRODUCT} scope="scope-A"
    onClose={() => {}} onSaved={() => {}} />);

  it("carregando rótulos desabilita a seleção", () => {
    state.labels = { data: undefined, isSuccess: false, isError: false };
    renderDialog();
    expect((screen.getByLabelText("Rótulo (opcional)") as HTMLSelectElement).disabled).toBe(true);
  });
  it("erro ao carregar rótulos falha fechado", () => {
    state.labels = { data: undefined, isSuccess: false, isError: true };
    renderDialog();
    expect(screen.getByText(/Não foi possível carregar os rótulos autorizados/)).toBeTruthy();
    expect((screen.getByLabelText("Rótulo (opcional)") as HTMLSelectElement).disabled).toBe(true);
  });
  it("rótulo atual inativo é exibido desabilitado e não oferecido", () => {
    state.labels = { data: LABELS, isSuccess: true, isError: false };
    renderDialog();
    const select = screen.getByLabelText("Rótulo (opcional)") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => ({ text: o.text, disabled: o.disabled }));
    expect(options.some((o) => o.text === "Fungicida (inativo)" && o.disabled)).toBe(true);
    expect(options.some((o) => o.text === "Fungicida" && !o.disabled)).toBe(false);
    expect(options.some((o) => o.text === "Herbicida" && !o.disabled)).toBe(true);
  });
  it("envia somente rótulo ativo da fonte canônica", async () => {
    state.labels = { data: LABELS, isSuccess: true, isError: false };
    state.rpcResult = { data: RECEIPT, error: null };
    let saved = 0;
    render(<PlatformCatalogFamilyDialog product={PRODUCT} scope="scope-A" onClose={() => {}} onSaved={() => { saved += 1; }} />);
    fireEvent.change(screen.getByLabelText("Rótulo (opcional)"), { target: { value: "herbicida" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "motivo válido dez" } });
    fireEvent.click(screen.getByLabelText(/Confirmo a classificação/));
    fireEvent.click(screen.getByRole("button", { name: "Salvar classificação" }));
    await waitFor(() => expect(saved).toBe(1));
    expect(state.rpcCalls[0].name).toBe("platform_set_global_product_family");
    expect(state.rpcCalls[0].args.p_classe).toBe("herbicida");
  });
});
