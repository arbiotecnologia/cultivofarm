/**
 * Fase Fiscal 3.19.1 — Simulação de digitação real no campo CNPJ
 * (FiscalEmpresa). Confirma que letras A–Z são preservadas em uppercase
 * até o valor final normalizado que iria para o payload.
 */
import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { unmaskCnpj, formatCNPJ } from "@/lib/masks";

// Componente mínimo replicando exatamente a normalização usada no input
// CNPJ da FiscalEmpresa após a Fase 3.19.1.
function CnpjInputHarness() {
  const [raw, setRaw] = React.useState("");
  return (
    <div>
      <input
        aria-label="cnpj"
        inputMode="text"
        autoCapitalize="characters"
        maxLength={18}
        value={formatCNPJ(raw)}
        onChange={(e) => setRaw(unmaskCnpj(e.target.value).slice(0, 14))}
      />
      <span data-testid="payload">{raw}</span>
    </div>
  );
}

describe("Fase 3.19.1 — digitação CNPJ alfanumérico end-to-end", () => {
  test("letras minúsculas viram uppercase e são preservadas no payload", () => {
    render(<CnpjInputHarness />);
    const input = screen.getByLabelText("cnpj") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12abc34501de55" } });
    expect(screen.getByTestId("payload").textContent).toBe("12ABC34501DE55");
    expect(input.value).toBe("12.ABC.345/01DE-55");
  });

  test("CNPJ 100% numérico continua funcionando", () => {
    render(<CnpjInputHarness />);
    const input = screen.getByLabelText("cnpj") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "11.222.333/0001-81" } });
    expect(screen.getByTestId("payload").textContent).toBe("11222333000181");
    expect(input.value).toBe("11.222.333/0001-81");
  });

  test("limite de 14 posições respeitado ignorando caracteres extras", () => {
    render(<CnpjInputHarness />);
    const input = screen.getByLabelText("cnpj") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12ABC34501DE5599999" } });
    expect(screen.getByTestId("payload").textContent).toBe("12ABC34501DE55");
  });
});
