// Envio idempotente de portal_solicitacoes pelo Produtor.
// - client_uuid estável por tentativa lógica (o chamador reaproveita em retries).
// - Unicidade (user_id, client_uuid) no banco; 23505 nesse índice = já enviado.
// - Não pede representação (sem SELECT extra); outras falhas são propagadas.
export const SOLICITACAO_IDEMPOTENCY_INDEX = "portal_solicitacoes_author_client_uuid_uniq";

export type SolicitacaoInsertResult = "created" | "already_submitted";

type InsertError = { code?: string; message?: string; details?: string | null } | null;
export type SolicitacaoInserter = (row: Record<string, unknown>) => Promise<{ error: InsertError }>;

export function isIdempotentDuplicate(error: InsertError): boolean {
  if (!error || error.code !== "23505") return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  return text.includes(SOLICITACAO_IDEMPOTENCY_INDEX);
}

export async function insertSolicitacaoIdempotente(
  insert: SolicitacaoInserter,
  row: Record<string, unknown> & { client_uuid: string; user_id: string },
): Promise<SolicitacaoInsertResult> {
  const { error } = await insert(row);
  if (!error) return "created";
  if (isIdempotentDuplicate(error)) return "already_submitted";
  throw error;
}
