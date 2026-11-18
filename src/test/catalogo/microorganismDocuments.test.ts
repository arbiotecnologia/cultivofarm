import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { beforeAll, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } },
}));
import {
  MICRO_DOCUMENT_LIMITS,
  parseMicroDocuments,
  verifyMicroDocument,
  uploadMicroDocument,
  type DocumentAttempt,
} from "@/lib/catalogo/microorganismDocuments";
import { supabase } from "@/integrations/supabase/client";
beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
});
const micro = "00000000-0000-4000-8000-000000000001",
  org = "00000000-0000-4000-8000-000000000011",
  doc = "00000000-0000-4000-8000-000000000021";
const row = {
  id: doc,
  document_id: doc,
  version: 1,
  micro_id: micro,
  organization_id: org,
  title: "Laudo documental sem aprovação",
  file_name: "laudo.pdf",
  mime: "application/pdf",
  size_bytes: 8,
  sha256: "a".repeat(64),
  created_at: "2026-11-18T00:00:00Z",
};
it("limite individual é 10 MiB", () =>
  expect(MICRO_DOCUMENT_LIMITS.fileBytes).toBe(10485760));
it("limite microrganismo inclui 50 versões", () =>
  expect(MICRO_DOCUMENT_LIMITS.versionsPerMicro).toBe(50));
it("limite tenant é 500 MiB", () =>
  expect(MICRO_DOCUMENT_LIMITS.tenantBytes).toBe(524288000));
it("limite por ator é 20/h", () =>
  expect(MICRO_DOCUMENT_LIMITS.uploadsPerHour).toBe(20));
it("limite pendentes é 2", () =>
  expect(MICRO_DOCUMENT_LIMITS.concurrent).toBe(2));
it("aceita metadados do próprio microrganismo", () =>
  expect(parseMicroDocuments([row], micro, org)[0].title).toBe(row.title));
it("rejeita tenant estrangeiro", () =>
  expect(() =>
    parseMicroDocuments([{ ...row, organization_id: doc }], micro, org),
  ).toThrow("escopo"));
it("rejeita microrganismo estrangeiro", () =>
  expect(() =>
    parseMicroDocuments([{ ...row, micro_id: doc }], micro, org),
  ).toThrow("escopo"));
it("rejeita documento duplicado", () =>
  expect(() => parseMicroDocuments([row, row], micro, org)).toThrow("escopo"));
it("rejeita aprovação inventada", () =>
  expect(() =>
    parseMicroDocuments([{ ...row, approved: true }], micro, org),
  ).toThrow());
it("mede hash PDF pelos bytes reais", async () => {
  const result = await verifyMicroDocument(
    new Blob(["%PDF-1.7"], { type: "application/pdf" }),
  );
  expect(result.sha256).toBe(
    "86edbaa24831badfa0a8b04bb410141e2ee4182b6d0014493fe262a7a331c20b",
  );
});
it("rejeita arquivo vazio", async () =>
  await expect(verifyMicroDocument(new Blob([]))).rejects.toThrow("vazio"));
it("rejeita arquivo acima do limite", async () =>
  await expect(
    verifyMicroDocument(new Blob([new Uint8Array(10485761)])),
  ).rejects.toThrow("10 MiB"));
it("rejeita MIME incompatível", async () =>
  await expect(
    verifyMicroDocument(new Blob(["%PDF-1.7"], { type: "image/png" })),
  ).rejects.toThrow("compatível"));
it("rejeita conteúdo não autorizado", async () =>
  await expect(verifyMicroDocument(new Blob(["<html>"]))).rejects.toThrow(
    "compatível",
  ));
it("rejeita hash diferente ao consultar", async () =>
  await expect(
    verifyMicroDocument(
      new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      row as any,
    ),
  ).rejects.toThrow("Integridade"));
function attempt(): DocumentAttempt {
  return {
    key: doc,
    micro,
    organization: org,
    expectedRoot: "2026-11-18T00:00:00Z",
    document: null,
    previousVersion: 0,
    metadata: {
      title: "Laudo",
      file_name: "laudo.pdf",
      mime: "application/pdf",
      size_bytes: 8,
      sha256: "a".repeat(64),
    },
    file: new Blob(["%PDF-1.7"]),
  };
}
it("nega dispatch sem contexto vigente", async () => {
  vi.mocked(supabase.rpc).mockClear();
  await expect(
    uploadMicroDocument(attempt(), new AbortController().signal, () => false),
  ).rejects.toThrow("Contexto");
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it("reserva estrangeira não dispara upload", async () => {
  vi.mocked(supabase.functions.invoke).mockClear();
  vi.mocked(supabase.rpc).mockReturnValue({
    abortSignal: () =>
      Promise.resolve({
        data: {
          upload_id: doc,
          document_id: doc,
          micro_id: micro,
          organization_id: doc,
          committed: false,
          expires_at: "2026-11-18T00:15:00Z",
        },
        error: null,
      }),
  } as any);
  await expect(
    uploadMicroDocument(attempt(), new AbortController().signal, () => true),
  ).rejects.toThrow("escopo");
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});
it("conflito não dispara retry automático", async () => {
  vi.mocked(supabase.rpc).mockClear();
  vi.mocked(supabase.rpc).mockReturnValue({
    abortSignal: () =>
      Promise.resolve({ data: null, error: { code: "PT409" } }),
  } as any);
  await expect(
    uploadMicroDocument(attempt(), new AbortController().signal, () => true),
  ).rejects.toThrow("mudou");
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
