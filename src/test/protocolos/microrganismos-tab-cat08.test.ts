import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import {
  carregarMicrorganismosCatalogo,
  runExclusive,
} from "@/components/protocolos/MicrorganismosTab";

type Result = { data: any; error: any };

function makeClient(results: Record<string, Result>) {
  const calls: string[] = [];
  const from = (table: string) => {
    calls.push(table);
    const builder: any = {};
    const finish = () => Promise.resolve(results[table] ?? { data: [], error: null });
    builder.select = () => builder;
    builder.order = () => builder;
    builder.then = (res: any, rej: any) => finish().then(res, rej);
    return builder;
  };
  return { client: { from }, calls };
}

const MICROS = [{ id: "m1", nome: "Bacillus" }];
const PROFILES = [{ microrganismo_id: "m1", status_validacao: "aprovado" }];

describe("CAT-08 · carregamento consistente", () => {
  it("aplica dados somente quando as duas consultas passam", async () => {
    const { client, calls } = makeClient({
      microrganismos: { data: MICROS, error: null },
      microorganism_technical_profiles: { data: PROFILES, error: null },
    });

    const out = await carregarMicrorganismosCatalogo(client);

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.items).toEqual(MICROS);
      expect(out.profileStatusMap).toEqual({ m1: "aprovado" });
    }
    expect(calls).toContain("microrganismos");
    expect(calls).toContain("microorganism_technical_profiles");
  });

  it("erro em microorganism_technical_profiles não aplica dados parciais", async () => {
    const { client } = makeClient({
      microrganismos: { data: MICROS, error: null },
      microorganism_technical_profiles: { data: null, error: { message: "perfis falhou" } },
    });

    const out = await carregarMicrorganismosCatalogo(client);

    expect(out.ok).toBe(false);
    expect(out).not.toHaveProperty("items");
    if (!out.ok) expect(out.error.message).toBe("perfis falhou");
  });

  it("erro em microrganismos não aplica dados parciais", async () => {
    const { client } = makeClient({
      microrganismos: { data: null, error: { message: "lista falhou" } },
      microorganism_technical_profiles: { data: PROFILES, error: null },
    });

    const out = await carregarMicrorganismosCatalogo(client);
    expect(out.ok).toBe(false);
  });
});

describe("CAT-08 · proteção contra duplo envio", () => {
  it("submissão duplicada concorrente resulta em uma única escrita", async () => {
    const ref = { current: false };
    let writes = 0;
    const salvar = () =>
      runExclusive(ref, async () => {
        writes += 1;
        await new Promise((r) => setTimeout(r, 10));
        return "ok";
      });

    const [a, b] = await Promise.all([salvar(), salvar()]);

    expect(writes).toBe(1);
    expect(a).toBe("ok");
    expect(b).toBeUndefined();
  });

  it("estado volta ao normal após sucesso", async () => {
    const ref = { current: false };
    await runExclusive(ref, async () => "ok");
    expect(ref.current).toBe(false);
    const again = await runExclusive(ref, async () => "ok2");
    expect(again).toBe("ok2");
  });

  it("estado volta ao normal após falha inesperada", async () => {
    const ref = { current: false };
    await expect(
      runExclusive(ref, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(ref.current).toBe(false);
  });
});
