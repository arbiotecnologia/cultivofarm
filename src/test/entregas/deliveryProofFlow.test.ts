import { describe, expect, it, vi } from "vitest";
import {
  PROOF_PREFLIGHT_RPC,
  PROOF_RPC,
  isDefinitiveRejection,
  runProofOperation,
  type ProofClient,
} from "@/lib/entregas/deliveryProofFlow";

const E = "11111111-1111-4111-8111-111111111111";
function client(over: Partial<{ pre: any; write: any; upload: any; remove: any }> = {}) {
  const calls: string[] = [];
  const c: ProofClient = {
    rpc: vi.fn(async (name: string) => {
      calls.push(name);
      if (name === PROOF_PREFLIGHT_RPC) return over.pre ?? { data: { allowed: true }, error: null };
      const w = over.write ?? { data: { success: true }, error: null };
      if (w instanceof Error) throw w;
      return w;
    }),
    upload: vi.fn(async () => over.upload ?? { error: null }),
    remove: vi.fn(async () => over.remove ?? { error: null }),
  };
  return { c, calls };
}
const base = (c: ProofClient, extra: any = {}) => ({
  client: c, entregaId: E, action: "attach" as const, pending: null,
  blob: new Blob(["x"]), contentType: "application/pdf", extensao: "pdf",
  buildPayload: (path: string) => ({ arquivo_path: path }), isCurrent: () => true, ...extra,
});

describe("fluxo de comprovação: pré-verificação, upload, vínculo, retry e limpeza", () => {
  it("pré-verificação negada: nenhum upload e nenhuma gravação", async () => {
    const { c, calls } = client({ pre: { data: null, error: { code: "42501" } } });
    const out = await runProofOperation(base(c));
    expect(out.kind).toBe("blocked");
    expect(c.upload).not.toHaveBeenCalled();
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
  });

  it("caminho do objeto é vinculado à própria entrega e enviado sem sobrescrita", async () => {
    const { c } = client();
    const out = await runProofOperation(base(c));
    expect(out.kind).toBe("ok");
    const path = (c.upload as any).mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^entregas/${E}/comprovantes/[0-9a-f-]{36}\\.pdf$`));
    const args = (c.rpc as any).mock.calls[1][1];
    expect(args.p_payload.arquivo_path).toBe(path);
    expect(args.p_request_key).toMatch(/^proof-/);
  });

  it("falha de upload não chama a RPC final", async () => {
    const { c, calls } = client({ upload: { error: new Error("net") } });
    expect((await runProofOperation(base(c))).kind).toBe("upload_failed");
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
  });

  it("resposta ambígua (rede) mantém caminho e chave e nunca apaga", async () => {
    const { c } = client({ write: new Error("network") });
    const out = await runProofOperation(base(c));
    expect(out.kind).toBe("uncertain");
    expect(c.remove).not.toHaveBeenCalled();
    if (out.kind !== "uncertain") return;
    // Retry: mesmo caminho, mesma chave, sem novo upload e sem nova pré-verificação.
    const r = client();
    const out2 = await runProofOperation(base(r.c, { pending: out.pending }));
    expect(out2.kind).toBe("ok");
    expect(r.c.upload).not.toHaveBeenCalled();
    expect(r.calls).toEqual([PROOF_RPC.attach]);
    const args = (r.c.rpc as any).mock.calls[0][1];
    expect(args.p_request_key).toBe(out.pending.requestKey);
    expect(args.p_payload.arquivo_path).toBe(out.pending.path);
  });

  it("erro 5xx/sem código é ambíguo: não apaga", async () => {
    const { c } = client({ write: { data: null, error: { code: "PT503", message: "x" } } });
    expect((await runProofOperation(base(c))).kind).toBe("uncertain");
    const { c: c2 } = client({ write: { data: null, error: { message: "timeout" } } });
    expect((await runProofOperation(base(c2))).kind).toBe("uncertain");
    expect(c.remove).not.toHaveBeenCalled();
    expect(c2.remove).not.toHaveBeenCalled();
  });

  it("recusa definitiva remove SOMENTE o objeto recém-enviado nesta tentativa", async () => {
    const { c } = client({ write: { data: null, error: { code: "42501" } } });
    const out = await runProofOperation(base(c));
    expect(out).toMatchObject({ kind: "rejected", cleaned: true });
    expect(c.remove).toHaveBeenCalledWith((c.upload as any).mock.calls[0][0]);
  });

  it("recusa definitiva num retry com caminho reaproveitado nunca apaga", async () => {
    const { c } = client({ write: { data: null, error: { code: "PT409" } } });
    const pending = { entregaId: E, action: "attach" as const, requestKey: "proof-k", path: `entregas/${E}/comprovantes/x.pdf` };
    const out = await runProofOperation(base(c, { pending }));
    expect(out).toMatchObject({ kind: "rejected", cleaned: false });
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.upload).not.toHaveBeenCalled();
  });

  it("pendência de outra entrega ou ação não é reaproveitada", async () => {
    const { c } = client();
    const pending = { entregaId: "22222222-2222-4222-8222-222222222222", action: "attach" as const, requestKey: "proof-k", path: "entregas/2/x.pdf" };
    await runProofOperation(base(c, { pending }));
    expect(c.upload).toHaveBeenCalledTimes(1);
    expect((c.rpc as any).mock.calls[1][1].p_request_key).not.toBe("proof-k");
  });

  it("operação obsoleta após o upload não chama a RPC e não apaga", async () => {
    let current = true;
    const { c, calls } = client();
    (c.upload as any).mockImplementation(async () => { current = false; return { error: null }; });
    const out = await runProofOperation(base(c, { isCurrent: () => current }));
    expect(out.kind).toBe("stale");
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
    expect(c.remove).not.toHaveBeenCalled();
  });

  it("gerar formulário não envia arquivo e usa chave de requisição", async () => {
    const { c, calls } = client();
    const out = await runProofOperation({ client: c, entregaId: E, action: "generate", pending: null, isCurrent: () => true });
    expect(out.kind).toBe("ok");
    expect(c.upload).not.toHaveBeenCalled();
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC, PROOF_RPC.generate]);
    expect((c.rpc as any).mock.calls[1][1]).not.toHaveProperty("p_payload");
  });

  it("classificação de recusas definitivas", () => {
    for (const code of ["42501", "22023", "PT409", "23514", "55P03"]) expect(isDefinitiveRejection({ code })).toBe(true);
    for (const code of ["PT503", "40001", "57014", "PGRST301", undefined]) expect(isDefinitiveRejection({ code })).toBe(false);
    expect(isDefinitiveRejection(null)).toBe(false);
  });

  it("nenhum caller usa os escritores legados", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/entregas/EntregaComprovantePanel.tsx", "utf8");
    expect(src).not.toMatch(/rpc_(gerar_formulario_entrega|coletar_assinatura_digital_entrega|anexar_comprovante_entrega)/);
  });
});
