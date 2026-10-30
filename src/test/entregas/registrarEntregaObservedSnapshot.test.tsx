import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const c: any = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: null, error: null }) }; return c; } } }));
vi.mock("@/lib/entregaDestinatario", async () => ({ ...(await vi.importActual<any>("@/lib/entregaDestinatario")), resolveDestinatarioFromOS: async () => (await vi.importActual<any>("@/lib/entregaDestinatario")).emptyDestinatario() }));
vi.mock("@/components/entregas/SeletorLoteEnvasado", () => ({ SeletorLoteEnvasado: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { RegistrarEntregaDialog } from "@/components/entregas/RegistrarEntregaDialog";

const OS = "10000000-0000-4000-8000-000000000007";
const S = "10000000-0000-4000-8000-000000000013";
const T1 = "2026-10-30T10:00:00Z";
const T2 = "2026-10-30T11:00:00Z";
const item = (updated_at: string) => ({ id: S, status: "reservado", updated_at, reservado_para_os_id: OS, _saldo: 5, _saldo_reserva: 5, quantidade: 5, volume_total: 5, _os_origem_id: OS, lotes: { codigo_lote: "L1" } });
const os = (updated_at: string) => ({ id: OS, numero_os: 1, type: "padrao", updated_at, origem: "agronomica", partner_order_id: null, clientes: { nome: "C" } });

afterEach(cleanup);

describe("RegistrarEntregaDialog observed snapshot (real dialog)", () => {
  it("keeps revisions from first selection even if the lists refresh before confirming", async () => {
    const onSubmit = vi.fn();
    const props = { open: true, onOpenChange: () => {}, osInicial: OS, onSubmit };
    const h = render(<MemoryRouter><RegistrarEntregaDialog {...props} itensSelecionaveis={[item(T1)]} todasOS={[os(T1)]} /></MemoryRouter>);
    const submit = await screen.findByRole("button", { name: /Registrar entrega \(1 item\)/ });
    // Realtime refresh delivers newer revisions while the dialog is open.
    h.rerender(<MemoryRouter><RegistrarEntregaDialog {...props} itensSelecionaveis={[item(T2)]} todasOS={[os(T2)]} /></MemoryRouter>);
    fireEvent.click(submit);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Confirmar e gravar" })); });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].observed).toEqual({
      os: { id: OS, type: "padrao", updated_at: T1, origem: "agronomica", partner_order_id: null },
      itens: { [S]: { updated_at: T1, status: "reservado" } },
    });
  });
});
