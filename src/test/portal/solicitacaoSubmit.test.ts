import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  insertSolicitacaoIdempotente,
  isIdempotentDuplicate,
  SOLICITACAO_IDEMPOTENCY_INDEX,
} from "@/lib/portal/solicitacaoSubmit";

const row = { client_uuid: "11111111-1111-4111-8111-111111111111", user_id: "u1", cliente_id: "c1", tipo_demanda: "Outro" };

describe("solicitação idempotente", () => {
  it("fluxo feliz retorna created e envia client_uuid", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await expect(insertSolicitacaoIdempotente(insert, row)).resolves.toBe("created");
    expect(insert.mock.calls[0][0].client_uuid).toBe(row.client_uuid);
  });

  it("duplicidade no índice do autor vira already_submitted", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: "23505", message: `duplicate key value violates unique constraint "${SOLICITACAO_IDEMPOTENCY_INDEX}"` },
    });
    await expect(insertSolicitacaoIdempotente(insert, row)).resolves.toBe("already_submitted");
  });

  it("23505 em outro índice não é ocultado", async () => {
    const err = { code: "23505", message: 'unique constraint "portal_solicitacoes_numero_solicitacao_key"' };
    expect(isIdempotentDuplicate(err)).toBe(false);
    await expect(insertSolicitacaoIdempotente(vi.fn().mockResolvedValue({ error: err }), row)).rejects.toBe(err);
  });

  it("tenant forjado (RLS/guard 42501) propaga erro", async () => {
    const err = { code: "42501", message: "PRODUCER_REQUEST_SCOPE_DENIED" };
    await expect(insertSolicitacaoIdempotente(vi.fn().mockResolvedValue({ error: err }), row)).rejects.toBe(err);
  });

  it("erro de schema propaga", async () => {
    const err = { code: "PGRST204", message: "Could not find the 'client_uuid' column" };
    await expect(insertSolicitacaoIdempotente(vi.fn().mockResolvedValue({ error: err }), row)).rejects.toBe(err);
  });

  it("formulário reaproveita UUID em retry e não pede representação", () => {
    const src = readFileSync("src/pages/app/MobileSolicitar.tsx", "utf8");
    expect(src).toContain("if (!clientUuidRef.current) clientUuidRef.current = crypto.randomUUID();");
    expect(src).not.toMatch(/const clientUuid = crypto\.randomUUID\(\)/);
    expect(src).not.toMatch(/portal_solicitacoes"\)\.insert\([^)]*\)\.select/);
  });
});
