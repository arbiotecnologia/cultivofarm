import { describe, it, expect, vi } from "vitest";
import {
  executarComDeadlineEdicao,
  DEADLINE_EDICAO_MS,
  ErroEdicaoUsuario,
  MSG_EDICAO_NAO_CONFIRMADA,
} from "@/lib/configuracoes/edicaoUsuarioRpc";

const fakeTimers = () => {
  const pend: Array<{ cb: () => void; cancelado: boolean }> = [];
  return {
    pend,
    agendar: (cb: () => void) => {
      const e = { cb, cancelado: false };
      pend.push(e);
      return e;
    },
    cancelar: (h: unknown) => {
      (h as any).cancelado = true;
    },
    disparar: () => pend.filter((e) => !e.cancelado).forEach((e) => e.cb()),
  };
};

describe("executarComDeadlineEdicao", () => {
  it("usa prazo padrão de 20s", () => {
    expect(DEADLINE_EDICAO_MS).toBe(20_000);
  });

  it("promise que nunca resolve vira estado ambíguo com exigência de recarga", async () => {
    const t = fakeTimers();
    const p = executarComDeadlineEdicao(() => new Promise<string>(() => {}), {
      agendar: t.agendar,
      cancelar: t.cancelar,
    });
    t.disparar();
    const erro = await p.catch((e) => e);
    expect(erro).toBeInstanceOf(ErroEdicaoUsuario);
    expect(erro.origem).toBe("ambiguo");
    expect(erro.exigeRecarga).toBe(true);
    expect(erro.message).toBe(MSG_EDICAO_NAO_CONFIRMADA);
    // Nenhuma afirmação de rollback; orienta conferir/recarregar.
    expect(erro.message).not.toMatch(/nada foi salvo|revertid/i);
    expect(erro.message).toMatch(/Recarregue/i);
  });

  it("aborta o request no estouro do prazo", async () => {
    const t = fakeTimers();
    let signal: AbortSignal | undefined;
    const p = executarComDeadlineEdicao(
      (s) => {
        signal = s;
        return new Promise<string>(() => {});
      },
      { agendar: t.agendar, cancelar: t.cancelar },
    );
    expect(signal?.aborted).toBe(false);
    t.disparar();
    await p.catch(() => {});
    expect(signal?.aborted).toBe(true);
  });

  it("sucesso dentro do prazo passa direto e cancela o timer", async () => {
    const t = fakeTimers();
    await expect(
      executarComDeadlineEdicao(async () => "ok", { agendar: t.agendar, cancelar: t.cancelar }),
    ).resolves.toBe("ok");
    expect(t.pend.every((e) => e.cancelado)).toBe(true);
  });

  it("erro conhecido dentro do prazo preserva o código específico e cancela o timer", async () => {
    const t = fakeTimers();
    const especifico = new ErroEdicaoUsuario("Telefone inválido", "rpc", "user_edit_invalid_phone", false);
    const erro = await executarComDeadlineEdicao(
      async () => {
        throw especifico;
      },
      { agendar: t.agendar, cancelar: t.cancelar },
    ).catch((e) => e);
    expect(erro).toBe(especifico);
    expect(erro.exigeRecarga).toBe(false);
    expect(t.pend.every((e) => e.cancelado)).toBe(true);
  });

  it("resolução tardia após o prazo não vira sucesso", async () => {
    const t = fakeTimers();
    let resolver!: (v: string) => void;
    const p = executarComDeadlineEdicao(() => new Promise<string>((r) => (resolver = r)), {
      agendar: t.agendar,
      cancelar: t.cancelar,
    });
    t.disparar();
    const ok = vi.fn();
    const erro = await p.then(ok, (e) => e);
    resolver("tarde demais");
    await Promise.resolve();
    expect(ok).not.toHaveBeenCalled();
    expect(erro.origem).toBe("ambiguo");
  });

  it("rejeição tardia após o prazo não gera unhandled rejection", async () => {
    const t = fakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    let rejeitar!: (e: unknown) => void;
    const p = executarComDeadlineEdicao(() => new Promise<string>((_, rj) => (rejeitar = rj)), {
      agendar: t.agendar,
      cancelar: t.cancelar,
    });
    t.disparar();
    await p.catch(() => {});
    rejeitar(new Error("falha tardia"));
    await new Promise((r) => setTimeout(r, 20));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("exceção síncrona do executor é propagada sem virar sucesso", async () => {
    const t = fakeTimers();
    const erro = await executarComDeadlineEdicao<string>(
      () => {
        throw new Error("boom");
      },
      { agendar: t.agendar, cancelar: t.cancelar },
    ).catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(t.pend.every((e) => e.cancelado)).toBe(true);
  });
});
