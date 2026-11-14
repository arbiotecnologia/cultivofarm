/**
 * Contenção regulatória global (migration 20261014195911 global_catalog_regulatory_write_containment).
 * Prova comportamental: as 12 mutações de useRegulatoryActions falham ANTES de supabase.rpc;
 * leituras overview/detail continuam chegando à RPC; dossiê vazio/preenchido renderiza sem controles de escrita.
 * Dados abaixo são mocks sintéticos de teste (nada persiste, nenhum valor regulatório real).
 */
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalCatalogWriteBlockedError } from "@/lib/catalogo/globalCatalogWriteContainment";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({useAuth:()=>({user:{id:'00000000-0000-4000-8000-000000000001'},profile:{user_id:'00000000-0000-4000-8000-000000000001',organization_id:'00000000-0000-4000-8000-000000000002',ativo:true},roles:['administrador'],loading:false})}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: vi.fn() } }));

import {
  useMicroorganismRegulatoryOverview, useRegulatoryActions, useRegulatoryDossierDetail,
} from "@/hooks/useMicroorganismRegulatory";
import { RegulatorioMicrorganismosSecao } from "@/components/fiscal/RegulatorioMicrorganismosSecao";

const MID = "00000000-0000-4000-8000-000000000201";
const DID = "00000000-0000-4000-8000-000000000202";
const row = {
  microorganism_id: MID, codigo: "T-1", nome: "Micro teste", tipo: null, ativo: true, concentracao_label: null, facts: null,
  checklist_total: 12, checklist_confirmed: 0, checklist_pending: 12, progress_pct: 0, dossier_status: "DRAFT",
  profile_status: null, fiscally_ready: false, technical_ready: false, regulatory_ready: false, quarantined: false,
  pendencies: [], not_applicable: [],
};
const filled = {
  dossier: { id: DID, microorganism_id: MID, version: 1, status: "DRAFT", regulatory_category: null, strain_code: null,
    strain_name: "Cepa teste", formulation: null, label_guarantee: null, mapa_status: null, mapa_registration_number: null,
    mapa_holder: null, mapa_valid_until: null, mapa_not_applicable_reason: null, notes: null },
  presentations: [], ncm_candidates: [], documents: [], history: [], snapshots: [], gate: null,
  checklist: [{ id: "00000000-0000-4000-8000-000000000203", item_key: "CEPA", state: "PENDING", justification: null }],
};

let detail: unknown = null;
beforeEach(() => {
  mocks.rpc.mockReset().mockImplementation(async (fn: string) =>
    fn === "rpc_microorganism_regulatory_overview" ? { data: [row], error: null }
      : fn === "rpc_regulatory_dossier_detail" ? { data: detail, error: null }
        : { data: [], error: null });
});
afterEach(cleanup);
const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useRegulatoryActions — 12 mutações bloqueadas antes da RPC", () => {
  const calls: Array<[string, unknown]> = [
    ["ensureDraft", undefined],
    ["updateDraft", { dossierId: DID, patch: { notes: "x" } }],
    ["upsertPresentation", { dossierId: DID, volumeMl: 1000, patch: {} }],
    ["addNcmCandidate", { dossierId: DID, ncm: "00000000", justification: "x", sourceKey: "x" }],
    ["decideNcmCandidate", { candidateId: DID, approve: true, reason: "x" }],
    ["setChecklist", { dossierId: DID, itemKey: "CEPA", state: "CONFIRMED" }],
    ["registerDocument", { dossierId: DID, docType: "x", title: "x", storagePath: "x", contentSha256: "x" }],
    ["submit", DID],
    ["reviewDecide", { dossierId: DID, layer: "TECHNICAL", decision: "APPROVED", justification: "x" }],
    ["publish", DID],
    ["block", { dossierId: DID, reason: "x" }],
    ["newVersion", "motivo"],
  ];
  it("são exatamente 12", () => expect(calls).toHaveLength(12));
  it.each(calls)("%s lança GlobalCatalogWriteBlockedError sem chamar supabase.rpc", async (name, input) => {
    const { result } = renderHook(() => useRegulatoryActions(MID), { wrapper: wrapper() });
    const m = (result.current as Record<string, { mutateAsync(i: unknown): Promise<unknown> }>)[name];
    await expect(m.mutateAsync(input)).rejects.toBeInstanceOf(GlobalCatalogWriteBlockedError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("leituras preservadas", () => {
  it("overview chega à RPC e devolve [] quando vazio", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useMicroorganismRegulatoryOverview(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("rpc_microorganism_regulatory_overview", {});
  });
  it("detail chega à RPC e devolve null sem dossiê", async () => {
    detail = null;
    const { result } = renderHook(() => useRegulatoryDossierDetail(MID), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("rpc_regulatory_dossier_detail", { p_microorganism_id: MID });
  });
});

const WRITE_LABELS = /criar|salvar|registrar|aprovar|rejeitar|publicar|bloquear|enviar|nova versão|adicionar|confirmar/i;
async function openSheet() {
  const W = wrapper();
  render(<W><RegulatorioMicrorganismosSecao /></W>);
  fireEvent.click(await screen.findByRole("button", { name: "Abrir dossiê regulatório de Micro teste" }));
  return screen.findByTestId("regulatorio-produtos-sheet");
}

describe("entrada fiscal por produto", () => {
  it("não consulta o contrato legado mesmo com dossiê antigo", async () => {
    detail = filled;
    await openSheet();
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('rpc_regulatory_microorganism_products',{p_microorganism_id:MID}));
    expect(mocks.rpc.mock.calls.some(([name])=>name==='rpc_regulatory_dossier_detail')).toBe(false);
  });
  it("falha de produtos não monta leitores de detalhe", async () => {
    mocks.rpc.mockImplementation(async fn=>fn==='rpc_microorganism_regulatory_overview'?{data:[row],error:null}:{data:null,error:{code:'42501'}});
    const sheet=await openSheet();
    await within(sheet).findByRole('alert');
    expect(mocks.rpc.mock.calls.some(([name])=>name==='tenant_product_dossier_management_context'||name==='rpc_regulatory_dossier_detail')).toBe(false);
  });
});
