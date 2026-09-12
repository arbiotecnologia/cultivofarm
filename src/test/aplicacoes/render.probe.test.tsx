import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Aplicacoes from "@/pages/Aplicacoes";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, role: "admin", roles: ["administrador"] }) }));

describe("probe", () => {
  it("renderiza", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><MemoryRouter><Aplicacoes /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText(/Aplicações em Campo/i)).toBeTruthy();
  });
});
