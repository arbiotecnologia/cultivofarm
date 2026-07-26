import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { MaskedInput } from "@/components/ui/masked-input";

function Controlled({ onValue, initial = "" }: { onValue?: (v: string) => void; initial?: string }) {
  const [v, setV] = React.useState(initial);
  return (
    <MaskedInput
      mask="telefone"
      aria-label="telefone"
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        onValue?.(e.target.value);
      }}
    />
  );
}

function typeSequence(input: HTMLInputElement, digits: string) {
  // simula digitação caractere a caractere setando o value acumulado (comportamento
  // que os handlers do react-input/mask normalizam via onChange).
  let current = input.value;
  for (const d of digits) {
    current = current + d;
    fireEvent.change(input, { target: { value: current } });
    current = input.value;
  }
}

describe("MaskedInput mask=telefone", () => {
  it("formata número fixo com 10 dígitos como (00) 0000-0000", () => {
    render(<Controlled initial="1133224455" />);
    const input = screen.getByLabelText("telefone") as HTMLInputElement;
    expect(input.value).toBe("(11) 3322-4455");
  });

  it("formata celular com 11 dígitos como (00) 00000-0000", () => {
    render(<Controlled initial="11987654321" />);
    const input = screen.getByLabelText("telefone") as HTMLInputElement;
    expect(input.value).toBe("(11) 98765-4321");
  });

  it("aceita digitação completa de celular sem travar no 11º dígito", () => {
    const spy = vi.fn();
    render(<Controlled onValue={spy} />);
    const input = screen.getByLabelText("telefone") as HTMLInputElement;
    typeSequence(input, "11987654321");
    // extrai só dígitos do valor final
    expect(input.value.replace(/\D/g, "")).toBe("11987654321");
    expect(input.value).toBe("(11) 98765-4321");
  });

  it("faz a transição de máscara fixo → celular ao atingir 10 dígitos", () => {
    render(<Controlled />);
    const input = screen.getByLabelText("telefone") as HTMLInputElement;
    typeSequence(input, "1133224455");
    expect(input.value).toBe("(11) 3322-4455");
    // ao adicionar o 11º dígito, deve virar celular
    typeSequence(input, "6");
    expect(input.value.replace(/\D/g, "")).toBe("11332244556");
  });

  it("limita a no máximo 11 dígitos numéricos", () => {
    render(<Controlled />);
    const input = screen.getByLabelText("telefone") as HTMLInputElement;
    typeSequence(input, "1198765432199");
    expect(input.value.replace(/\D/g, "").length).toBeLessThanOrEqual(11);
  });

  it("ignora caracteres não numéricos digitados", () => {
    render(<Controlled />);
    const input = screen.getByLabelText("telefone") as HTMLInputElement;
    typeSequence(input, "11a9b8c7d6e5f4g3h2i1");
    expect(input.value.replace(/\D/g, "")).toBe("11987654321");
  });

  it("modo não controlado exibe defaultValue formatado", () => {
    render(<MaskedInput mask="telefone" aria-label="tel2" defaultValue="11987654321" />);
    const input = screen.getByLabelText("tel2") as HTMLInputElement;
    expect(input.value).toBe("(11) 98765-4321");
  });
});
