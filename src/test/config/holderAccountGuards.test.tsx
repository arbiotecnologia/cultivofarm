import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const rpc = vi.fn(); const updateUser = vi.fn(); const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), auth: { updateUser: (...a: unknown[]) => updateUser(...a), refreshSession: () => refreshSession() } } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
import { HolderAccountGuards, HolderAccountGuardsInner } from "@/components/configuracoes/HolderAccountGuards";

const OP = "44444444-4444-4444-8444-444444444444";
function server(over: Record<string, unknown> = {}) {
  rpc.mockImplementation(async (n: string) => ({
    my_session_authz_state_v1: { data: { stale: false }, error: null },
    user_email_change_sync_self_v1: { data: { status: "awaiting_holder" }, error: null },
    user_email_change_my_pending_v1: { data: { status: "pending", op_id: OP, new_email: "novo@ex.test" }, error: null },
    user_email_change_accept_v1: { data: { ok: true, op_id: OP, new_email: "novo@ex.test" }, error: null },
    user_email_change_decline_v1: { data: { ok: true, status: "cancelled" }, error: null },
    ...over,
  } as Record<string, unknown>)[n]);
}
beforeEach(() => { rpc.mockReset(); updateUser.mockReset(); refreshSession.mockReset(); });

describe("HolderAccountGuards", () => {
  it("fechado pelo gate", () => { server(); const { container } = render(<HolderAccountGuards />); expect(container.innerHTML).toBe(""); expect(rpc).not.toHaveBeenCalled(); });
  it("sincroniza no retorno e mostra o pedido do titular", async () => {
    server(); render(<HolderAccountGuardsInner userId="u1" />);
    await screen.findByText(/novo@ex.test/);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["my_session_authz_state_v1", "user_email_change_sync_self_v1", "user_email_change_my_pending_v1"]);
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("aceitar usa updateUser com o endereço canônico do servidor, sem confirmar", async () => {
    server(); updateUser.mockResolvedValue({ error: null });
    render(<HolderAccountGuardsInner userId="u1" />);
    fireEvent.click(await screen.findByText("Aceitar e enviar confirmação"));
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(updateUser.mock.calls[0][0]).toEqual({ email: "novo@ex.test" });
    await screen.findByText(/só vale depois que você confirmar/);
  });
  it("endereço divergente do servidor não chama updateUser", async () => {
    server({ user_email_change_accept_v1: { data: { ok: true, new_email: "outro@ex.test" }, error: null } });
    render(<HolderAccountGuardsInner userId="u1" />);
    fireEvent.click(await screen.findByText("Aceitar e enviar confirmação"));
    await screen.findByText(/não está mais pendente/);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("sessão desatualizada é renovada", async () => {
    server({ my_session_authz_state_v1: { data: { stale: true }, error: null }, user_email_change_my_pending_v1: { data: { status: "none" }, error: null } });
    render(<HolderAccountGuardsInner userId="u1" />);
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
  });
  it("recusar fecha o aviso", async () => {
    server(); render(<HolderAccountGuardsInner userId="u1" />);
    fireEvent.click(await screen.findByText("Recusar"));
    await waitFor(() => expect(screen.queryByText(/novo@ex.test/)).toBeNull());
  });
});
