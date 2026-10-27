import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

// Reproduz a falha real pós-troca de ator: aba já aberta em /selecionar-portal,
// ator passa a ser Superadmin de plataforma (profile.organization_id NULL).
// O resolver de contextos exige tenant, então `ready` nunca vira true e a tela
// ficava presa em "Validando seus acessos…" indefinidamente.
const auth = vi.hoisted(() => ({
  roles: ["superadmin"] as string[],
  profile: { nome: "Superadmin", organization_id: null as string | null, ativo: true, senha_provisoria: false, user_id: "SA" },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "SA" }, profile: auth.profile, roles: auth.roles, signOut: vi.fn() }) }));
// Estado observado em produção: hook nunca fica pronto para ator sem tenant.
vi.mock("@/hooks/useAvailableContexts", () => ({
  useAvailableContexts: () => ({ data: undefined, ready: false, scope: "SA", refetch: vi.fn(), isLoading: true, isError: false, isFetching: false }),
  registerLoginRedirect: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import Selector from "@/pages/SelecionarPortal";

function Location() { return <div data-testid="location">{useLocation().pathname}{useLocation().search}</div>; }
function selector() {
  return render(
    <MemoryRouter initialEntries={["/selecionar-portal"]}>
      <Location />
      <Routes>
        <Route path="/selecionar-portal" element={<Selector />} />
        <Route path="*" element={<div>Destino</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.roles = ["superadmin"];
  auth.profile = { nome: "Superadmin", organization_id: null, ativo: true, senha_provisoria: false, user_id: "SA" };
});

it("superadmin sem tenant sai do seletor para a home canônica /plataforma", async () => {
  selector();
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/plataforma"));
  expect(screen.queryByText("Validando seus acessos…")).toBeNull();
});

it("superadmin sem tenant não fica preso na validação infinita", () => {
  selector();
  // Enquanto navega, exibe "Abrindo o portal…" — nunca o estado travado.
  expect(screen.queryByText("Validando seus acessos…")).toBeNull();
});

it("ator multipapel com papel de portal NÃO é desviado pelo ramo superadmin", () => {
  auth.roles = ["superadmin", "consultor_tecnico"];
  selector();
  // hasPortalRole=true: mantém o fluxo do seletor (aqui, validando).
  expect(screen.getByText("Validando seus acessos…")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("/selecionar-portal");
});
