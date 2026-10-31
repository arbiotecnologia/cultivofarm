import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";

const SNAP = {
  destinatario_nome: "Fazenda Boa Vista", destinatario_telefone: "(38) 3671-1234", destinatario_whatsapp: "",
  endereco_logradouro: "Rodovia MG-188", endereco_numero: "km 12", endereco_complemento: "", endereco_bairro: "Zona Rural",
  endereco_cidade: "Paracatu", endereco_uf: "MG", endereco_cep: "38.600-000", endereco_referencia: "Portão azul",
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const c: any = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: null, error: null }) }; return c; } } }));
vi.mock("@/lib/entregaDestinatario", async () => ({ ...(await vi.importActual<any>("@/lib/entregaDestinatario")), resolveDestinatarioFromOS: async () => ({ ...SNAP }) }));
vi.mock("@/components/entregas/SeletorLoteEnvasado", () => ({ SeletorLoteEnvasado: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { RegistrarEntregaDialog } from "@/components/entregas/RegistrarEntregaDialog";
import { CAPABILITY_RPC, DATA_KEYS, GROUP_RPC, runAtomicGroup, type Rpc } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "10000000-0000-4000-8000-000000000001";
const OS = "10000000-0000-4000-8000-000000000007";
const S = "10000000-0000-4000-8000-000000000013";
const E1 = "10000000-0000-4000-8000-000000000101";
const M1 = "10000000-0000-4000-8000-000000000201";
const T1 = "2026-10-30T10:00:00Z";
const item = { id: S, status: "reservado", updated_at: T1, reservado_para_os_id: OS, _saldo: 5, _saldo_reserva: 5, quantidade: 5, quantidade_reservada: 5, volume_total: 5, _os_origem_id: OS, lotes: { codigo_lote: "L1" } };
const os = { id: OS, numero_os: 1, type: "padrao", updated_at: T1, origem: "agronomica", partner_order_id: null, clientes: { nome: "C" } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RegistrarEntregaDialog -> atomic group with auto-filled recipient/address (real dialog)", () => {
  it("submits successfully with every auto-filled field preserved, no clearing", async () => {
    const onSubmit = vi.fn();
    render(<MemoryRouter><RegistrarEntregaDialog open onOpenChange={() => {}} osInicial={OS} onSubmit={onSubmit} itensSelecionaveis={[item]} todasOS={[os]} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByDisplayValue("Fazenda Boa Vista")).toBeTruthy());
    fireEvent.click(await screen.findByRole("button", { name: /Registrar entrega \(1 item\)/ }));
    const confirm = await screen.findByRole("button", { name: "Confirmar e gravar" });
    await act(async () => { fireEvent.click(confirm); });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const { grupoId, itens, osId, osTipo, observed, ...dados } = onSubmit.mock.calls[0][0];
    // Same destructuring as Entregas.tsx: every remaining key must be in the server allowlist.
    expect(Object.keys(dados).filter(k => !(DATA_KEYS as readonly string[]).includes(k))).toEqual([]);
    const rpc = vi.fn(async (fn: string, args: any) => fn === CAPABILITY_RPC ? { data: { capability: "delivery_operations_v1", group: true, cancel: true }, error: null }
      : fn === GROUP_RPC ? { data: { success: true, replay: false, organization_id: ORG, os_id: OS, itens: [{ entrega_id: E1, estoque_produto_id: S, movimentacao_id: M1 }] }, error: null } : { data: null, error: { code: "X" } });
    const outcome = await runAtomicGroup(rpc as unknown as Rpc, {
      requestKey: grupoId, expectedOrg: ORG, osId, osTipo, osOrigem: observed.os.origem, osPartnerOrderId: observed.os.partner_order_id, osObservedUpdatedAt: observed.os.updated_at,
      itens: itens.map(({ item: i, quantidade }: any) => ({ itemId: i.id, quantidade, observedUpdatedAt: observed.itens[i.id].updated_at, status: observed.itens[i.id].status, reservadoParaOsId: i.reservado_para_os_id, quantidadeReservada: i.quantidade_reservada, quantidadeTotal: i.quantidade })),
      dados,
    }, () => {});
    expect(outcome.status).toBe("confirmed");
    const sent = rpc.mock.calls.find(c => c[0] === GROUP_RPC)![1].p_dados;
    for (const [k, v] of Object.entries(SNAP)) expect(sent[k]).toBe(v === "" ? null : v);
    expect(sent.endereco_origem).toBe("cadastro");
    // Exact emitted payload is consumed by the disposable-PG v2 test against the generated SQL (no hand copy).
    writeFileSync("scripts/stock-envase-recovery-20261027/frontend-autofill-payload.json", JSON.stringify(sent, null, 2) + "\n");
  });
});
