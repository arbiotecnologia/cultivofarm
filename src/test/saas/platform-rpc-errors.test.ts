import { describe, expect, it } from "vitest";
import { diagnosticoSeguro, ErroRpcPlataforma, mensagemErroPlataforma } from "@/hooks/usePlataformaSaaS";

describe("erros das RPCs de Plataforma", () => {
  it("mantém o código técnico e apresenta mensagem acionável sem SQL", () => {
    const error = new ErroRpcPlataforma({
      code: "42501",
      message: "permission denied for table saas_plans",
      details: "SQL statement SELECT * FROM saas_plans",
      hint: null,
    });

    expect(error.code).toBe("42501");
    expect(error.details).toContain("saas_plans");
    expect(mensagemErroPlataforma(error)).toBe("Seu acesso não permite concluir esta operação.");
    expect(mensagemErroPlataforma(error)).not.toContain("SQL");
  });

  it("remove identificadores, e-mails e tokens do diagnóstico registrado", () => {
    const raw = "ator 123e4567-e89b-12d3-a456-426614174000 contato pessoa@example.com token eyJhbGciOiJIUzI1NiJ9.abc.def";

    expect(diagnosticoSeguro(raw)).toBe("ator [identificador] contato [email] token [token]");
  });
});