import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PreservedNavigate } from "@/components/PreservedNavigate";

function Destino() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="destino">{`${pathname}${search}${hash}`}</div>;
}

function Harness({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/base-tecnica" element={<Destino />} />
        <Route path="/protocolos" element={<PreservedNavigate to="/base-tecnica" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Redirect /protocolos -> /base-tecnica (roteador real)", () => {
  it("preserva query string e hash", () => {
    render(<Harness initial="/protocolos?tab=culturas&busca=abc#secao-1" />);
    expect(screen.getByTestId("destino").textContent).toBe(
      "/base-tecnica?tab=culturas&busca=abc#secao-1",
    );
  });

  it("redireciona a rota legada sem parâmetros", () => {
    render(<Harness initial="/protocolos" />);
    expect(screen.getByTestId("destino").textContent).toBe("/base-tecnica");
  });

  it("a rota canônica renderiza diretamente", () => {
    render(<Harness initial="/base-tecnica?tab=produtos" />);
    expect(screen.getByTestId("destino").textContent).toBe("/base-tecnica?tab=produtos");
  });
});
