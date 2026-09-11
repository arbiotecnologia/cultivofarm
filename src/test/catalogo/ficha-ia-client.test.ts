import { describe, expect, it, vi } from "vitest";
import { FichaIaError, gerarFichaCampo, mapearStatus } from "@/lib/fichaIaClient";
import { SUPABASE_URL } from "@/integrations/supabase/client";

const base = {
  entidadeTipo: "microrganismo" as const,
  entidadeId: "00000000-0000-4000-8000-000000000001",
  campo: "explicacao_b2b",
  token: "jwt-fake",
};

const respostaOk = () =>
  Promise.resolve(
    new Response(JSON.stringify({ texto: "rascunho", justificativa: "j", versao_id: "v1" }), { status: 200 }),
  );

describe("cliente do fluxo Gerar com IA", () => {
  it("usa exclusivamente o Supabase canônico CultivoFarm", async () => {
    const fetchImpl = vi.fn(respostaOk);
    await gerarFichaCampo({ ...base, fetchImpl: fetchImpl as any });
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/ai-generate-ficha-campo`);
    expect(url).toContain("swzpzcwiasxmjutrmvkm");
  });

  it("retorna o rascunho em caso de sucesso", async () => {
    const r = await gerarFichaCampo({ ...base, fetchImpl: (() => respostaOk()) as any });
    expect(r).toEqual({ texto: "rascunho", justificativa: "j", versaoId: "v1" });
  });

  it("não envia segredo nem service_role no corpo/headers", async () => {
    const fetchImpl = vi.fn(respostaOk);
    await gerarFichaCampo({ ...base, fetchImpl: fetchImpl as any });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const serializado = JSON.stringify({ headers: init.headers, body: init.body });
    expect(serializado).not.toMatch(/service_role|LOVABLE_API_KEY|sb_secret/i);
    expect(JSON.parse(String(init.body))).toEqual({
      entidade_tipo: "microrganismo",
      entidade_id: base.entidadeId,
      campo: "explicacao_b2b",
      origem: "ia_manual",
    });
  });

  it.each([
    [401, "nao_autenticado", false],
    [403, "sem_permissao", false],
    [404, "nao_disponivel", false],
    [429, "limite", true],
    [500, "servico", true],
    [502, "servico", true],
    [504, "timeout", true],
  ])("mapeia HTTP %i", (status, causa, retry) => {
    const e = mapearStatus(status as number);
    expect(e.causa).toBe(causa);
    expect(e.podeTentarNovamente).toBe(retry);
    expect(e.message).not.toMatch(/service_role|stack|Deno/i);
  });

  it("propaga erro acionável para função não implantada (404)", async () => {
    await expect(
      gerarFichaCampo({ ...base, fetchImpl: (() => Promise.resolve(new Response("", { status: 404 }))) as any }),
    ).rejects.toMatchObject({ causa: "nao_disponivel" });
  });

  it("trata JSON inválido do servidor", async () => {
    await expect(
      gerarFichaCampo({ ...base, fetchImpl: (() => Promise.resolve(new Response("não json", { status: 200 }))) as any }),
    ).rejects.toMatchObject({ causa: "resposta_invalida" });
  });

  it("aplica timeout finito", async () => {
    const fetchImpl = (_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          rej(err);
        });
      });
    await expect(
      gerarFichaCampo({ ...base, timeoutMs: 5, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ causa: "timeout" });
  });

  it("suporta cancelamento externo", async () => {
    const ctrl = new AbortController();
    const fetchImpl = (_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          rej(err);
        });
      });
    const p = gerarFichaCampo({ ...base, signal: ctrl.signal, fetchImpl: fetchImpl as any });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ causa: "cancelado" });
  });

  it("classifica falha de rede", async () => {
    await expect(
      gerarFichaCampo({ ...base, fetchImpl: (() => Promise.reject(new TypeError("failed"))) as any }),
    ).rejects.toMatchObject({ causa: "rede" });
  });

  it("retry após falha transitória funciona", async () => {
    let n = 0;
    const fetchImpl = () => {
      n += 1;
      return n === 1 ? Promise.resolve(new Response("", { status: 500 })) : respostaOk();
    };
    await expect(gerarFichaCampo({ ...base, fetchImpl: fetchImpl as any })).rejects.toBeInstanceOf(FichaIaError);
    await expect(gerarFichaCampo({ ...base, fetchImpl: fetchImpl as any })).resolves.toMatchObject({ texto: "rascunho" });
  });
});
