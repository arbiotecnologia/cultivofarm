import { describe, it, expect } from "vitest";
import {
  anexarComprovanteBaixa,
  comprovanteStoragePath,
  sanitizeFileName,
} from "@/lib/financial/anexarComprovanteBaixa";

type Doc = { id: string; owner_type: string; owner_id: string; storage_path: string; deleted_at: string | null };

/** Cliente fake mínimo: tabela em memória + storage em memória. */
function makeClient(opts: { failInsert?: boolean } = {}) {
  const docs: Doc[] = [];
  const uploads: string[] = [];
  let seq = 0;
  const client = {
    docs,
    uploads,
    from() {
      const filtros: Record<string, unknown> = {};
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { filtros[col] = val; return api; },
        is: (col: string, val: unknown) => { filtros[col] = val; return api; },
        maybeSingle: async () => {
          const found = docs.find((d) =>
            d.owner_type === filtros.owner_type &&
            d.owner_id === filtros.owner_id &&
            d.storage_path === filtros.storage_path &&
            d.deleted_at === null);
          return { data: found ?? null, error: null };
        },
        insert: async (row: any) => {
          if (opts.failInsert) return { error: { message: "rls", code: "42501" } };
          if (docs.some((d) => d.storage_path === row.storage_path && d.deleted_at === null)) {
            return { error: { message: "duplicate", code: "23505" } };
          }
          docs.push({ id: `doc-${++seq}`, deleted_at: null, ...row });
          return { error: null };
        },
      };
      return api;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => { uploads.push(path); return { error: null }; },
      }),
    },
  };
  return client;
}

const file = { name: "Comprovante Pix 18/08.pdf", type: "application/pdf", size: 1234 };
const base = {
  ownerType: "PAYMENT_RECEIVABLE" as const,
  paymentId: "pay-1",
  idempotencyKey: "idem-abc",
  file,
  uploadedBy: "user-1",
  organizationId: "org-1",
};

describe("H6c-004 — comprovante de baixa idempotente", () => {
  it("caminho é determinístico e sanitizado (sem Date.now)", () => {
    const p1 = comprovanteStoragePath({ ...base, fileName: file.name });
    const p2 = comprovanteStoragePath({ ...base, fileName: file.name });
    expect(p1).toBe(p2);
    expect(p1).toBe("org-1/PAYMENT_RECEIVABLE/pay-1/idem-abc-Comprovante-Pix-18-08.pdf");
    expect(sanitizeFileName("nota fiscal ção.pdf")).toBe("nota-fiscal-cao.pdf");
  });

  it("primeiro anexo cria documento único", async () => {
    const c = makeClient();
    await expect(anexarComprovanteBaixa(c, base)).resolves.toBe("created");
    expect(c.docs).toHaveLength(1);
    expect(c.uploads).toHaveLength(1);
  });

  it("retry da mesma tentativa lógica não duplica documento nem arquivo", async () => {
    const c = makeClient();
    await anexarComprovanteBaixa(c, base);
    const r = await anexarComprovanteBaixa(c, base);
    expect(r).toBe("reused");
    expect(c.docs).toHaveLength(1);
    expect(c.uploads).toHaveLength(1); // nem sequer reenvia o arquivo
  });

  it("falha parcial (upload ok / insert falha) e retry resulta em um único documento", async () => {
    const falho = makeClient({ failInsert: true });
    await expect(anexarComprovanteBaixa(falho, base)).rejects.toBeTruthy();
    expect(falho.docs).toHaveLength(0);
    expect(falho.uploads).toHaveLength(1);

    // retry com o cliente saudável, mesma chave lógica => 1 documento, mesmo path
    const ok = makeClient();
    ok.uploads.push(...falho.uploads);
    await expect(anexarComprovanteBaixa(ok, base)).resolves.toBe("created");
    expect(ok.docs).toHaveLength(1);
    expect(new Set(ok.uploads).size).toBe(1);
  });

  it("corrida no mesmo path é tratada como reuso (unique violation)", async () => {
    const c = makeClient();
    const path = comprovanteStoragePath({ ...base, fileName: file.name });
    c.docs.push({ id: "pre", owner_type: "PAYMENT_PAYABLE", owner_id: "outro", storage_path: path, deleted_at: null });
    await expect(anexarComprovanteBaixa(c, base)).resolves.toBe("reused");
    expect(c.docs).toHaveLength(1);
  });

  it("tentativa lógica diferente (nova chave) gera documento próprio", async () => {
    const c = makeClient();
    await anexarComprovanteBaixa(c, base);
    await anexarComprovanteBaixa(c, { ...base, idempotencyKey: "idem-xyz" });
    expect(c.docs).toHaveLength(2);
  });
});
