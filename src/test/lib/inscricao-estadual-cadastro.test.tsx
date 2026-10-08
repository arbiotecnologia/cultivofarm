import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InscricaoEstadualCadastroInput } from "@/components/clientes/InscricaoEstadualCadastroInput";
import { inscricaoEstadualCadastroSchema, normalizeInscricaoEstadualCadastro, inscricaoEstadualCadastroWarning } from "@/lib/schemas/inscricaoEstadualCadastro";
import { clienteSchema } from "@/lib/schemas/cliente";
import { validateIE } from "@/lib/fiscal/ie";

afterEach(cleanup);

describe("Inscrição estadual de cadastro sem bloqueio por UF", () => {
  it.each(["510.193.600/89", "51019360089", "062.307.904/0081", "123.456.789-0", "P-01100424.3/002", "ISENTO", "", "0012345678"])("aceita %s no cadastro", (value) => {
    expect(inscricaoEstadualCadastroSchema.safeParse(value).success).toBe(true);
    expect(clienteSchema.safeParse({ tipo_pessoa: "juridica", nome_fantasia: "Empresa", status_cliente: "ativo", endereco_estado: "MG", inscricao_estadual: value }).success).toBe(true);
  });
  it("o exemplo de 11 dígitos em MG é aceito com aviso sem modificar a validação fiscal", () => {
    expect(normalizeInscricaoEstadualCadastro("510.193.600/89")).toBe("51019360089");
    expect(inscricaoEstadualCadastroWarning("MG", "510.193.600/89")).not.toBeNull();
    expect(validateIE("MG", "510.193.600/89", { allowIsento: true }).ok).toBe(false);
  });
  it("não depende da UF para preservar prefixo e zeros", () => {
    expect(normalizeInscricaoEstadualCadastro("p-0012.345/6")).toBe("P00123456");
    expect(normalizeInscricaoEstadualCadastro("001.234-5")).toBe("0012345");
  });
  it.each([null, undefined, "", "   "])("campo opcional %s vira null", (value) => {
    expect(normalizeInscricaoEstadualCadastro(value)).toBeNull();
  });
  it("aceita ISENTO sem exigir UF", () => {
    expect(normalizeInscricaoEstadualCadastro(" isento ")).toBe("ISENTO");
    expect(inscricaoEstadualCadastroWarning(null, "ISENTO")).toBeNull();
  });
  it.each(["<script>", "123\n456", ".../--", "1".repeat(21)])("rejeita conteúdo fora dos limites sintáticos: %s", (value) => {
    expect(inscricaoEstadualCadastroSchema.safeParse(value).success).toBe(false);
  });
  it("digitação/paste e mudança de UF não truncam nem remascaram o valor", () => {
    function Harness({ uf }: { uf: string }) {
      const [value, setValue] = useState("");
      return <InscricaoEstadualCadastroInput uf={uf} value={value} onChange={(event) => setValue(event.target.value)} />;
    }
    const { rerender } = render(<Harness uf="MG" />);
    const input = screen.getByRole("textbox", { name: "Inscrição Estadual" });
    fireEvent.change(input, { target: { value: "510.193.600/89" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("510.193.600/89");
    expect(inscricaoEstadualCadastroSchema.safeParse((input as HTMLInputElement).value).success).toBe(true);
    rerender(<Harness uf="SP" />);
    expect((input as HTMLInputElement).value).toBe("510.193.600/89");
    fireEvent.change(input, { target: { value: "P-01100424.3/002" } });
    expect((input as HTMLInputElement).value).toBe("P-01100424.3/002");
  });
});