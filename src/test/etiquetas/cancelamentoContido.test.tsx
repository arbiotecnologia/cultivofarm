import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const t = vi.hoisted(() => ({ rpc: vi.fn(), open: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc } }));
import { EtiquetaProdutoActions } from "@/components/etiquetas/EtiquetaProdutoActions";
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, "open").mockImplementation(t.open); });
describe("Cancelamento de etiqueta contido independentemente da página", () => {
  it.each([false, true])("não disponibiliza writer com readOnly=%s, preserva consulta/impressão", readOnly => {
    render(<EtiquetaProdutoActions etiquetaId="local-label" status="gerada" readOnly={readOnly} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(t.open).toHaveBeenCalledTimes(2);
    expect(t.open).toHaveBeenCalledWith("/etiquetas/local-label/imprimir", "_blank");
    expect(t.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });
  it("histórico cancelado mantém consulta sem writer", () => {
    render(<EtiquetaProdutoActions etiquetaId="local-history" status="cancelada" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(t.open).toHaveBeenCalledWith("/etiquetas/local-history/imprimir", "_blank");
    expect(t.rpc).not.toHaveBeenCalled();
  });
});