/**
 * Testes de deduplicação na sincronização offline.
 * Cobre StrictMode (double-mount), idempotência via `client_uuid` e
 * gating de mídia.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";

// --- Mock do supabase client antes de importar qualquer coisa que o use ---
const insertMock = vi.fn();
const selectMaybeSingleMock = vi.fn();
const fromMock = vi.fn();
const storageUploadMock = vi.fn();
const storageListMock = vi.fn();
const storageGetPublicUrlMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const chain = (overrides: any = {}) => ({
    insert: (...args: any[]) => {
      insertMock(...args);
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: "remote-1" }, error: null }),
          maybeSingle: () => selectMaybeSingleMock(),
        }),
      };
    },
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: () => selectMaybeSingleMock() }),
        maybeSingle: () => selectMaybeSingleMock(),
      }),
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    ...overrides,
  });

  return {
    supabase: {
      from: (table: string) => {
        fromMock(table);
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { organization_id: "11111111-1111-4111-8111-111111111111", ativo: true },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return chain();
      },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      storage: {
        from: () => ({
          upload: (...args: any[]) => storageUploadMock(...args),
          list: (...args: any[]) => storageListMock(...args),
          getPublicUrl: (...args: any[]) => storageGetPublicUrlMock(...args),
        }),
      },
    },
  };
});

import {
  savePendingRegistro,
  claimPendingRegistro,
  getPendingRegistros,
  __resetOfflineDbForTests,
  type PendingRegistro,
} from "@/lib/offlineDb";

beforeEach(async () => {
  insertMock.mockReset();
  selectMaybeSingleMock.mockReset();
  fromMock.mockReset();
  storageUploadMock.mockReset();
  storageListMock.mockReset();
  storageGetPublicUrlMock.mockReset();

  await __resetOfflineDbForTests();
});

const baseReg = (id: string): PendingRegistro => ({
  id,
  clientUuid: `uuid-${id}`,
  payload: {
    objetivo_visita: "T " + id,
    problema_principal: "p",
    observacoes_tecnicas: "o",
    client_uuid: `uuid-${id}`,
  },
  createdAt: new Date().toISOString(),
  synced: false,
});

describe("dedup: claim impede dupla execução (StrictMode)", () => {
  it("dois claims paralelos para o mesmo registro: apenas um vence", async () => {
    await savePendingRegistro(baseReg("a"));

    const results = await Promise.all([
      claimPendingRegistro("a"),
      claimPendingRegistro("a"),
    ]);

    const winners = results.filter(Boolean).length;
    expect(winners).toBeLessThanOrEqual(1);
  });

  it("após claim, getPendingRegistros oculta o item", async () => {
    await savePendingRegistro(baseReg("b"));
    await claimPendingRegistro("b");
    const remaining = await getPendingRegistros();
    expect(remaining.find((r) => r.id === "b")).toBeUndefined();
  });
});

describe("dedup: idempotência via client_uuid (erro 23505)", () => {
  it("não reenvia quando referência existe E objeto está confirmado no storage", async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "existing-arq",
        arquivo_url: null,
        arquivo_path: "remote-1/foto/uuid-foto-1.jpg",
        registro_consultor_id: "remote-1",
      },
      error: null,
    });
    // Storage confirma o objeto.
    storageListMock.mockResolvedValueOnce({
      data: [{ name: "uuid-foto-1.jpg" }],
      error: null,
    });

    const { uploadMediaIdempotent } = await import("@/lib/mediaUpload");
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const res = await uploadMediaIdempotent(
      {
        clientUuid: "uuid-foto-1",
        file: blob,
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        kind: "foto",
      },
      "remote-1"
    );

    expect(res.success).toBe(true);
    expect(res.alreadyUploaded).toBe(true);
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("referência órfã (sem objeto no storage) provoca reenvio", async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "existing-arq",
        arquivo_url: null,
        arquivo_path: "remote-1/foto/uuid-foto-9.jpg",
        registro_consultor_id: "remote-1",
      },
      error: null,
    });
    storageListMock.mockResolvedValueOnce({ data: [], error: null }); // objeto ausente
    storageUploadMock.mockResolvedValueOnce({ error: null });
    storageListMock.mockResolvedValueOnce({
      data: [{ name: "uuid-foto-9.jpg" }],
      error: null,
    }); // confirmado após reenvio

    const { uploadMediaIdempotent } = await import("@/lib/mediaUpload");
    const res = await uploadMediaIdempotent(
      {
        clientUuid: "uuid-foto-9",
        file: new Blob(["x"], { type: "image/jpeg" }),
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        kind: "foto",
      },
      "remote-1"
    );

    expect(storageUploadMock).toHaveBeenCalled();
    expect(res.success).toBe(true);
    // Não insere nova referência: a linha já existia.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("client_uuid pertencente a outro registro vira idempotency_conflict", async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: "existing-arq",
        arquivo_url: null,
        arquivo_path: "outro/foto/uuid-foto-3.jpg",
        registro_consultor_id: "remote-OUTRO",
      },
      error: null,
    });

    const { uploadMediaIdempotent } = await import("@/lib/mediaUpload");
    const res = await uploadMediaIdempotent(
      {
        clientUuid: "uuid-foto-3",
        file: new Blob(["x"], { type: "image/jpeg" }),
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        kind: "foto",
      },
      "remote-1"
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("idempotency_conflict");
    expect(storageUploadMock).not.toHaveBeenCalled();
  });


  it("upload bem-sucedido valida via list e insere referência", async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    storageUploadMock.mockResolvedValueOnce({ error: null });
    storageListMock.mockResolvedValueOnce({
      data: [{ name: "uuid-foto-2.jpg" }],
      error: null,
    });
    storageGetPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://example/x.jpg" },
    });

    const { uploadMediaIdempotent } = await import("@/lib/mediaUpload");
    const res = await uploadMediaIdempotent(
      {
        clientUuid: "uuid-foto-2",
        file: new Blob(["x"], { type: "image/jpeg" }),
        fileName: "x.jpg",
        mimeType: "image/jpeg",
        kind: "foto",
      },
      "remote-1"
    );

    expect(res.success).toBe(true);
    expect(storageUploadMock).toHaveBeenCalledOnce();
    expect(insertMock).toHaveBeenCalled();
  });

  it("retorna falha quando storage não confirma o upload", async () => {
    selectMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    storageUploadMock.mockResolvedValueOnce({ error: null });
    storageListMock.mockResolvedValueOnce({ data: [], error: null });

    const { uploadMediaIdempotent } = await import("@/lib/mediaUpload");
    const res = await uploadMediaIdempotent(
      {
        clientUuid: "uuid-foto-3",
        file: new Blob(["x"], { type: "image/jpeg" }),
        fileName: "x.jpg",
        mimeType: "image/jpeg",
        kind: "foto",
      },
      "remote-1"
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sem confirmação/i);
  });

  it("respeita MAX_UPLOAD_ATTEMPTS", async () => {
    const { uploadMediaIdempotent, MAX_UPLOAD_ATTEMPTS } = await import("@/lib/mediaUpload");
    const res = await uploadMediaIdempotent(
      {
        clientUuid: "uuid-foto-4",
        file: new Blob(["x"], { type: "image/jpeg" }),
        fileName: "x.jpg",
        mimeType: "image/jpeg",
        kind: "foto",
        previousAttempts: MAX_UPLOAD_ATTEMPTS,
      },
      "remote-1"
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/máximo de tentativas/i);
    expect(storageUploadMock).not.toHaveBeenCalled();
  });
});
