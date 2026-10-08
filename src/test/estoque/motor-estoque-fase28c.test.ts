import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chaveIdempotencia,
  mensagemErroEstoque,
  EstoqueMotorError,
} from "@/lib/estoque/motorEstoque";

const MOTOR = resolve(process.cwd(), "src/lib/estoque/motorEstoque.ts");
const motorSrc = readFileSync(MOTOR, "utf8");

/** Extrai o conjunto de literais de uma união de tipo exportada. */
function unionLiterals(source: string, typeName: string): string[] {
  const re = new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?);`);
  const bloco = re.exec(source)?.[1] ?? "";
  return Array.from(bloco.matchAll(/"([a-z_]+)"/g)).map((m) => m[1]);
}

describe("FASE 28C — chaveIdempotencia", () => {
  it("concatena partes com ':'", () => {
    expect(chaveIdempotencia("entrega-expedicao", "abc")).toBe("entrega-expedicao:abc");
    expect(chaveIdempotencia("a", 1, "b")).toBe("a:1:b");
  });

  it("ignora null, undefined e string vazia", () => {
    expect(chaveIdempotencia("a", null, undefined, "", "b")).toBe("a:b");
    expect(chaveIdempotencia(null, undefined, "")).toBe("");
  });

  it("é determinística para os mesmos parâmetros", () => {
    const a = chaveIdempotencia("entrega-estorno", "id-1", 3);
    const b = chaveIdempotencia("entrega-estorno", "id-1", 3);
    expect(a).toBe(b);
  });

  it("preserva o zero como parte significativa", () => {
    expect(chaveIdempotencia("x", 0)).toBe("x:0");
  });
});

describe("FASE 28C — mensagemErroEstoque", () => {
  const casos: Array<[string, RegExp]> = [
    ["ESTQ_NAO_AUTENTICADO", /Entre novamente/i],
    ["ESTQ_IDENTIDADE_INATIVA", /sessão ou empresa/i],
    ["ESTQ_FEATURE_REQUIRED", /plano da sua empresa/i],
    ["ESTQ_TENANT_FORBIDDEN", /sua empresa/i],
    ["ESTQ_REFERENCE_FORBIDDEN", /vínculos informados/i],
    ["ESTQ_REFERENCE_UNSUPPORTED", /ainda não está habilitado/i],
    ["ESTQ_PAYLOAD_INVALIDO", /dados informados/i],
    ["ESTQ_ESTORNO_ORIGEM_INVALIDA", /origem não é válida/i],
    ["ESTQ_SEM_TRILHA", /operação foi revertida/i],
    ["ESTQ_SALDO_INSUFICIENTE", /Saldo insuficiente/i],
    ["ESTQ_IDEMPOTENCY_CONFLITO", /já registrada/i],
    ["ESTQ_UPDATE_DIRETO_BLOQUEADO", /operações oficiais de estoque/i],
    ["ESTQ_MOTIVO_OBRIGATORIO", /Informe o motivo/i],
    ["ESTQ_SEM_PERMISSAO", /permissão/i],
    ["ESTQ_ESCOPO_INVALIDO", /outro cliente, OS ou pedido/i],
    ["ESTQ_ESTORNO_DUPLICADO", /já foi estornada/i],
    ["ESTQ_ESTORNO_DE_ESTORNO", /estornar um estorno/i],
    ["ESTQ_APROVACAO_REQUERIDA", /aprovação/i],
    ["ESTQ_DEVOLUCAO_CQ", /CQ aprovado/i],
    ["ESTQ_DEVOLUCAO_VALIDADE", /vencido/i],
  ];

  it.each(casos)("mapeia %s para mensagem amigável", (codigo, esperado) => {
    const msg = mensagemErroEstoque(new Error(`erro do banco: ${codigo}`));
    expect(msg).toMatch(esperado);
    expect(msg).not.toContain(codigo);
  });

  it("retorna fallback com a mensagem original quando não há código ESTQ_*", () => {
    expect(mensagemErroEstoque(new Error("falha de rede"))).toBe("falha de rede");
  });

  it("aceita valores não-Error convertendo para string", () => {
    expect(mensagemErroEstoque("ESTQ_SALDO_INSUFICIENTE")).toMatch(/Saldo insuficiente/i);
    expect(mensagemErroEstoque("qualquer coisa")).toBe("qualquer coisa");
  });
});

describe("FASE 28C — EstoqueMotorError", () => {
  it("expõe o código extraído da mensagem", () => {
    const err = new EstoqueMotorError("violação: ESTQ_SALDO_INSUFICIENTE detalhe");
    expect(err.name).toBe("EstoqueMotorError");
    expect(err.codigo).toBe("ESTQ_SALDO_INSUFICIENTE");
  });

  it("usa ESTQ_ERRO como código padrão", () => {
    expect(new EstoqueMotorError("erro genérico").codigo).toBe("ESTQ_ERRO");
  });

  it("isConflito reconhece ESTQ_IDEMPOTENCY_CONFLITO", () => {
    expect(new EstoqueMotorError("ESTQ_IDEMPOTENCY_CONFLITO").isConflito).toBe(true);
    expect(new EstoqueMotorError("ESTQ_SALDO_INSUFICIENTE").isConflito).toBe(false);
  });

  it("isPermissao reconhece ESTQ_SEM_PERMISSAO e ESTQ_ESCOPO_INVALIDO", () => {
    expect(new EstoqueMotorError("ESTQ_SEM_PERMISSAO").isPermissao).toBe(true);
    expect(new EstoqueMotorError("ESTQ_ESCOPO_INVALIDO").isPermissao).toBe(true);
    expect(new EstoqueMotorError("ESTQ_SALDO_INSUFICIENTE").isPermissao).toBe(false);
  });

  it("é uma instância de Error", () => {
    expect(new EstoqueMotorError("x")).toBeInstanceOf(Error);
  });
  it.each(["ESTQ_NAO_AUTENTICADO", "ESTQ_IDENTIDADE_INATIVA", "ESTQ_FEATURE_REQUIRED", "ESTQ_TENANT_FORBIDDEN", "ESTQ_REFERENCE_FORBIDDEN"])("classifica %s como restrição de acesso", (codigo) => {
    expect(new EstoqueMotorError(codigo).isPermissao).toBe(true);
  });
});

describe("FASE 28C — conjuntos canônicos congelados", () => {
  it("EstoqueAcao permanece exatamente com as 9 ações canônicas", () => {
    expect(unionLiterals(motorSrc, "EstoqueAcao")).toEqual([
      "reserva",
      "cancelamento_reserva",
      "expedicao",
      "entrega",
      "estorno_expedicao",
      "ajuste",
      "perda",
      "descarte",
      "devolucao",
    ]);
  });

  it("EstoqueReferenciaTipo permanece exatamente com os 8 tipos canônicos", () => {
    expect(unionLiterals(motorSrc, "EstoqueReferenciaTipo")).toEqual([
      "entrega",
      "ordem_servico",
      "ordem_servico_onfarm",
      "partner_order",
      "envase",
      "lote",
      "manual",
      "sistema",
    ]);
  });

  it("contrato da RPC canônica preservado", () => {
    for (const token of [
      "rpc_estoque_operar_v1",
      "p_acao",
      "p_item_id",
      "p_quantidade",
      "p_idempotency_key",
      "p_payload",
    ]) {
      expect(motorSrc).toContain(token);
    }
  });
});
