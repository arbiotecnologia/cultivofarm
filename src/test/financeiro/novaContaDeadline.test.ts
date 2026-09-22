import { describe, expect, it, vi } from "vitest";
import {
  ErroCriacaoIncerta,
  ErroNovaContaLocal,
  MSG_NOVA_CONTA_NAO_CONFIRMADA,
  classificarErroNovaConta,
  executarComDeadlineNovaConta,
  mapearErroNovaConta,
} from "@/lib/financeiro/novaContaReceber";

const agendarImediato = (cb: () => void) => {
  const h = setTimeout(cb, 0);
  return h;
};

describe("deadline do cadastro de conta a receber", () => {
  it("promise que nunca resolve rejeita como incerta e aborta o request", async () => {
    let signalRecebido: AbortSignal | undefined;
    const p = executarComDeadlineNovaConta(
      (signal) =>
        new Promise(() => {
          signalRecebido = signal;
        }),
      { agendar: agendarImediato },
    );
    await expect(p).rejects.toBeInstanceOf(ErroCriacaoIncerta);
    expect(signalRecebido?.aborted).toBe(true);
    expect(classificarErroNovaConta(await p.catch((e) => e)).exigeConferencia).toBe(true);
  });

  it("sucesso dentro do prazo resolve e limpa o timer", async () => {
    const cancelar = vi.fn();
    const r = await executarComDeadlineNovaConta(async () => ({ ok: 1 }), {
      timeoutMs: 5_000,
      cancelar,
    });
    expect(r).toEqual({ ok: 1 });
    expect(cancelar).toHaveBeenCalledTimes(1);
  });

  it("erro conhecido dentro do prazo preserva o erro original", async () => {
    const erro = { code: "23514", message: "new row violates check FIN_TITLE_INVALID_SUM" };
    await expect(
      executarComDeadlineNovaConta(async () => {
        throw erro;
      }, { timeoutMs: 5_000 }),
    ).rejects.toBe(erro);
  });

  it("resolução tardia após o prazo não vira sucesso nem unhandled", async () => {
    let resolver: (v: unknown) => void = () => {};
    const p = executarComDeadlineNovaConta(
      () => new Promise((res) => { resolver = res; }),
      { agendar: agendarImediato },
    );
    await expect(p).rejects.toBeInstanceOf(ErroCriacaoIncerta);
    resolver({ success: true });
    await new Promise((r) => setTimeout(r, 5));
    await expect(p).rejects.toBeInstanceOf(ErroCriacaoIncerta);
  });

  it("rejeição tardia após o prazo não substitui o estado incerto", async () => {
    let rejeitar: (e: unknown) => void = () => {};
    const p = executarComDeadlineNovaConta(
      () => new Promise((_res, rej) => { rejeitar = rej; }),
      { agendar: agendarImediato },
    );
    await expect(p).rejects.toBeInstanceOf(ErroCriacaoIncerta);
    rejeitar(new Error("tardio"));
    await new Promise((r) => setTimeout(r, 5));
    await expect(p).rejects.toBeInstanceOf(ErroCriacaoIncerta);
  });
});

describe("classificação de erros do cadastro", () => {
  it("guarda local preserva a edição", () => {
    const c = classificarErroNovaConta(new ErroNovaContaLocal("Descrição é obrigatória."));
    expect(c).toEqual({ mensagem: "Descrição é obrigatória.", exigeConferencia: false });
  });

  it("erro de servidor conhecido preserva a edição", () => {
    const c = classificarErroNovaConta({ code: "23514", message: "FIN_TITLE_INVALID_COUNT" });
    expect(c.exigeConferencia).toBe(false);
    expect(c.mensagem).toMatch(/parcelas inválido/i);
  });

  it("erro de rede exige conferência", () => {
    const c = classificarErroNovaConta(new TypeError("Failed to fetch"));
    expect(c).toEqual({ mensagem: MSG_NOVA_CONTA_NAO_CONFIRMADA, exigeConferencia: true });
  });

  it("erro desconhecido do servidor exige conferência", () => {
    const c = classificarErroNovaConta({ code: "XX000", message: "boom interno" });
    expect(c.exigeConferencia).toBe(true);
    expect(c.mensagem).toBe(MSG_NOVA_CONTA_NAO_CONFIRMADA);
    expect(c.mensagem).not.toMatch(/boom/);
  });

  it("token FIN_TITLE tem prioridade sobre o 23514 genérico", () => {
    expect(
      mapearErroNovaConta({ code: "23514", message: 'violates check "FIN_TITLE_INVALID_CATEGORY"' }),
    ).toMatch(/Categoria inválida ou inativa/);
  });

  it("23514 sem token específico usa a mensagem genérica de regra", () => {
    expect(mapearErroNovaConta({ code: "23514", message: "check violation" })).toMatch(
      /não atendem às regras/i,
    );
  });
});
