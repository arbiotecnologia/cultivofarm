import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { PreservedNavigate } from "@/components/PreservedNavigate";

function Destination() {
  const location = useLocation();
  return <div data-testid="destination">{location.pathname}{location.search}{location.hash}</div>;
}

describe("Aliases canônicos", () => {
  it("mescla query/hash sem produzir dois pontos de interrogação", async () => {
    render(<MemoryRouter initialEntries={["/legacy?tab=old&cliente=123#detalhe"]}><Routes>
      <Route path="/legacy" element={<PreservedNavigate to="/auditoria?tab=sync" />} />
      <Route path="/auditoria" element={<Destination />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByTestId("destination")).toHaveTextContent("/auditoria?tab=sync&cliente=123#detalhe");
  });
});