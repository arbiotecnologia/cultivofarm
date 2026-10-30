import { describe, expect, it, vi } from "vitest";
import {
  PROOF_PREFLIGHT_RPC,
  PROOF_RPC,
  isDefinitiveRejection,
  isValidPreflight,
  isValidProofAck,
  runProofOperation,
  type ProofAction,
  type ProofClient,
} from "@/lib/entregas/deliveryProofFlow";

const E = "11111111-1111-4111-8111-111111111111";
const F = "22222222-2222-4222-8222-222222222222";
const CID = "33333333-3333-4333-8333-333333333333";

/** Servidor simulado: devolve envelopes EXATOS por padrão (ecoando entrega/ação/caminho). */
function client(over: Partial<{ pre: any; write: any; upload: any }> = {}) {
  const calls: string[] = [];
  const c: ProofClient & { remove?: any } = {
    rpc: vi.fn(async (name: string, args: any) => {
      calls.push(name);
      if (name === PROOF_PREFLIGHT_RPC) {
        const p = over.pre ?? { data: { allowed: true, entrega_id: args.p_entrega_id, action: args.p_action }, error: null };
        if (p instanceof Error) throw p;
        return typeof p === "function" ? p(args) : p;
      }
      const action = (Object.keys(PROOF_RPC) as ProofAction[]).find((k) => PROOF_RPC[k] === name)!;
      const w = over.write ?? {
        data: {
          success: true, action, entrega_id: args.p_entrega_id, comprovante_id: CID,
          object_path: args.p_payload?.arquivo_path ?? args.p_payload?.assinatura_digital_png_path ?? null,
        },
        error: null,
      };
      if (w instanceof Error) throw w;
      return typeof w === "function" ? w(args) : w;
    }),
    upload: vi.fn(async () => over.upload ?? { error: null }),
    remove: vi.fn(async () => ({ error: null })),
  };
  return { c, calls };
}
const base = (c: ProofClient, extra: any = {}) => ({
  client: c, entregaId: E, action: "attach" as const, pending: null,
  blob: new Blob(["x"]), contentType: "application/pdf", extensao: "pdf",
  buildPayload: (path: string) => ({ arquivo_path: path }), isCurrent: () => true, ...extra,
});

describe("pré-verificação: envelope exato antes de qualquer upload", () => {
  it("negada por erro: nenhum upload e nenhuma gravação", async () => {
    const { c, calls } = client({ pre: { data: null, error: { code: "42501" } } });
    expect((await runProofOperation(base(c))).kind).toBe("blocked");
    expect(c.upload).not.toHaveBeenCalled();
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
  });

  for (const [nome, data] of [
    ["data null", null],
    ["allowed false", { allowed: false, entrega_id: E, action: "attach" }],
    ["allowed truthy não booleano", { allowed: "true", entrega_id: E, action: "attach" }],
    ["entrega estrangeira", { allowed: true, entrega_id: F, action: "attach" }],
    ["ação divergente", { allowed: true, entrega_id: E, action: "sign" }],
    ["sem entrega_id", { allowed: true, action: "attach" }],
    ["array", [{ allowed: true, entrega_id: E, action: "attach" }]],
  ] as const) {
    it(`envelope inválido (${nome}) bloqueia sem upload`, async () => {
      const { c, calls } = client({ pre: { data, error: null } });
      const out = await runProofOperation(base(c));
      expect(out).toMatchObject({ kind: "blocked", error: { code: "PROOF_PREFLIGHT_INVALID" } });
      expect(c.upload).not.toHaveBeenCalled();
      expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
    });
  }

  it("exceção de rede na pré-verificação bloqueia sem upload", async () => {
    const { c } = client({ pre: new Error("net") });
    expect((await runProofOperation(base(c))).kind).toBe("blocked");
    expect(c.upload).not.toHaveBeenCalled();
  });

  it("troca de escopo durante a pré-verificação: stale, sem upload", async () => {
    let current = true;
    const { c } = client({ pre: (a: any) => { current = false; return { data: { allowed: true, entrega_id: a.p_entrega_id, action: a.p_action }, error: null }; } });
    expect((await runProofOperation(base(c, { isCurrent: () => current }))).kind).toBe("stale");
    expect(c.upload).not.toHaveBeenCalled();
  });
});

describe("ACK final: só envelope exato é sucesso", () => {
  it("positivo: caminho da própria entrega, sem sobrescrita, chave de requisição", async () => {
    const { c } = client();
    const out = await runProofOperation(base(c));
    expect(out.kind).toBe("ok");
    const path = (c.upload as any).mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^entregas/${E}/comprovantes/[0-9a-f-]{36}\\.pdf$`));
    const args = (c.rpc as any).mock.calls[1][1];
    expect(args.p_payload.arquivo_path).toBe(path);
    expect(args.p_request_key).toMatch(/^proof-/);
  });

  for (const [nome, mk] of [
    ["data null", () => null],
    ["success false", (a: any) => ({ success: false, action: "attach", entrega_id: E, comprovante_id: CID, object_path: a.p_payload.arquivo_path })],
    ["entrega estrangeira", (a: any) => ({ success: true, action: "attach", entrega_id: F, comprovante_id: CID, object_path: a.p_payload.arquivo_path })],
    ["ação divergente", (a: any) => ({ success: true, action: "sign", entrega_id: E, comprovante_id: CID, object_path: a.p_payload.arquivo_path })],
    ["caminho divergente", () => ({ success: true, action: "attach", entrega_id: E, comprovante_id: CID, object_path: `entregas/${E}/comprovantes/outro.pdf` })],
    ["comprovante não uuid", (a: any) => ({ success: true, action: "attach", entrega_id: E, comprovante_id: "x", object_path: a.p_payload.arquivo_path })],
  ] as const) {
    it(`ACK inválido (${nome}) é incerto e retém chave/caminho, sem apagar`, async () => {
      const { c } = client({ write: (a: any) => ({ data: (mk as any)(a), error: null }) });
      const out = await runProofOperation(base(c));
      expect(out.kind).toBe("uncertain");
      if (out.kind !== "uncertain") return;
      expect(out.pending.path).toBe((c.upload as any).mock.calls[0][0]);
      expect(out.pending.requestKey).toMatch(/^proof-/);
      expect((c as any).remove).not.toHaveBeenCalled();
    });
  }

  it("validadores puros", () => {
    expect(isValidPreflight({ allowed: true, entrega_id: E, action: "generate" }, E, "generate")).toBe(true);
    expect(isValidProofAck({ success: true, action: "generate", entrega_id: E, comprovante_id: CID, object_path: null }, E, "generate", null)).toBe(true);
    expect(isValidProofAck({ success: true, action: "generate", entrega_id: E, comprovante_id: CID, object_path: "p" }, E, "generate", null)).toBe(false);
    expect(isValidProofAck({ success: true, action: "attach", entrega_id: E, comprovante_id: CID, object_path: null }, E, "attach", null)).toBe(false);
  });
});

describe("retry, recusas e ausência de limpeza automática", () => {
  it("falha de upload não chama a RPC final", async () => {
    const { c, calls } = client({ upload: { error: new Error("net") } });
    expect((await runProofOperation(base(c))).kind).toBe("upload_failed");
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
  });

  it("exceção no upload é incerta: retém o caminho para não duplicar", async () => {
    const { c } = client();
    (c.upload as any).mockImplementation(async () => { throw new Error("reset"); });
    const out = await runProofOperation(base(c));
    expect(out.kind).toBe("uncertain");
  });

  it("rede na gravação: mantém caminho e chave; retry sem novo upload nem preflight", async () => {
    const { c } = client({ write: new Error("network") });
    const out = await runProofOperation(base(c));
    expect(out.kind).toBe("uncertain");
    if (out.kind !== "uncertain") return;
    const r = client();
    const out2 = await runProofOperation(base(r.c, { pending: out.pending }));
    expect(out2.kind).toBe("ok");
    expect(r.c.upload).not.toHaveBeenCalled();
    expect(r.calls).toEqual([PROOF_RPC.attach]);
    const args = (r.c.rpc as any).mock.calls[0][1];
    expect(args.p_request_key).toBe(out.pending.requestKey);
    expect(args.p_payload.arquivo_path).toBe(out.pending.path);
  });

  it("5xx/sem código/lock/serialização são incertos e retêm pendência", async () => {
    for (const error of [{ code: "PT503" }, { message: "timeout" }, { code: "55P03" }, { code: "40001" }]) {
      const { c } = client({ write: { data: null, error } });
      expect((await runProofOperation(base(c))).kind).toBe("uncertain");
      expect((c as any).remove).not.toHaveBeenCalled();
    }
  });

  for (const code of ["42501", "22023", "PT409", "23514"]) {
    it(`recusa definitiva ${code} NUNCA apaga o objeto (pode ter sido vinculado por chamada concorrente)`, async () => {
      const { c } = client({ write: { data: null, error: { code, message: "DELIVERY_PROOF_OBJECT_ALREADY_LINKED" } } });
      const out = await runProofOperation(base(c));
      expect(out).toMatchObject({ kind: "rejected", retainedPath: (c.upload as any).mock.calls[0][0] });
      expect((c as any).remove).not.toHaveBeenCalled();
    });
  }

  it("recusa com caminho reaproveitado: sem upload e sem caminho retido novo", async () => {
    const { c } = client({ write: { data: null, error: { code: "PT409" } } });
    const pending = { entregaId: E, action: "attach" as const, requestKey: "proof-k", path: `entregas/${E}/comprovantes/x.pdf` };
    const out = await runProofOperation(base(c, { pending }));
    expect(out).toMatchObject({ kind: "rejected", retainedPath: null });
    expect(c.upload).not.toHaveBeenCalled();
  });

  it("escopo trocado DURANTE a RPC final: stale, sem efeitos (mesmo com recusa)", async () => {
    let current = true;
    const { c } = client({ write: () => { current = false; return { data: null, error: { code: "42501" } }; } });
    expect((await runProofOperation(base(c, { isCurrent: () => current }))).kind).toBe("stale");
    expect((c as any).remove).not.toHaveBeenCalled();
  });

  it("pendência de outra entrega ou ação não é reaproveitada", async () => {
    const { c } = client();
    const pending = { entregaId: F, action: "attach" as const, requestKey: "proof-k", path: "entregas/2/x.pdf" };
    await runProofOperation(base(c, { pending }));
    expect(c.upload).toHaveBeenCalledTimes(1);
    expect((c.rpc as any).mock.calls[1][1].p_request_key).not.toBe("proof-k");
  });

  it("obsoleta após o upload não chama a RPC", async () => {
    let current = true;
    const { c, calls } = client();
    (c.upload as any).mockImplementation(async () => { current = false; return { error: null }; });
    expect((await runProofOperation(base(c, { isCurrent: () => current }))).kind).toBe("stale");
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC]);
  });

  it("duplo clique: segunda chamada simultânea da mesma entrega/ação é recusada localmente", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { c } = client();
    (c.upload as any).mockImplementation(async () => { await gate; return { error: null }; });
    const p1 = runProofOperation(base(c));
    const out2 = await runProofOperation(base(c));
    expect(out2.kind).toBe("busy");
    release();
    expect((await p1).kind).toBe("ok");
    expect(c.upload).toHaveBeenCalledTimes(1);
    // Depois de concluída, nova chamada é aceita.
    expect((await runProofOperation(base(c))).kind).toBe("ok");
  });

  it("gerar formulário não envia arquivo e valida ACK sem caminho", async () => {
    const { c, calls } = client();
    const out = await runProofOperation({ client: c, entregaId: E, action: "generate", pending: null, isCurrent: () => true });
    expect(out.kind).toBe("ok");
    expect(c.upload).not.toHaveBeenCalled();
    expect(calls).toEqual([PROOF_PREFLIGHT_RPC, PROOF_RPC.generate]);
    expect((c.rpc as any).mock.calls[1][1]).not.toHaveProperty("p_payload");
  });

  it("classificação", () => {
    for (const code of ["42501", "22023", "PT409", "23514"]) expect(isDefinitiveRejection({ code })).toBe(true);
    for (const code of ["55P03", "PT503", "40001", "57014", "PGRST301", undefined]) expect(isDefinitiveRejection({ code })).toBe(false);
    expect(isDefinitiveRejection(null)).toBe(false);
  });

  it("painel não remove objetos nem chama escritores legados", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/entregas/EntregaComprovantePanel.tsx", "utf8");
    expect(src).not.toMatch(/rpc_(gerar_formulario_entrega|coletar_assinatura_digital_entrega|anexar_comprovante_entrega)/);
    expect(src).not.toMatch(/\.remove\(/);
  });
});
