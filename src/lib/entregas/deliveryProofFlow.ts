/**
 * Fluxo de comprovação de entrega (formulário, assinatura digital, anexo).
 *
 * Autoridade é exclusivamente do servidor: a pré-verificação antes do upload só
 * evita enviar arquivos que seriam recusados; a RPC final revalida tudo.
 *
 * Regras de retry/limpeza:
 * - cada operação tem uma chave de requisição; um retry da mesma operação reusa
 *   a MESMA chave e o MESMO caminho (o servidor responde com replay idempotente);
 * - um objeto só é removido quando foi enviado NESTA tentativa e o servidor
 *   recusou de forma definitiva (transação revertida, nada vinculado);
 * - resposta ambígua (rede, tempo esgotado, 5xx, sem código) nunca apaga nada:
 *   o caminho e a chave ficam pendentes para nova tentativa.
 */

export type ProofAction = "generate" | "sign" | "attach";

export const PROOF_RPC: Record<ProofAction, string> = {
  generate: "rpc_entrega_formulario_gerar_v1",
  sign: "rpc_entrega_assinatura_coletar_v1",
  attach: "rpc_entrega_comprovante_anexar_v1",
};
export const PROOF_PREFLIGHT_RPC = "rpc_entrega_comprovacao_preflight_v1";

export interface RpcError {
  code?: string | null;
  message?: string | null;
}
export interface ProofClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  upload: (path: string, body: Blob, contentType: string) => Promise<{ error: unknown }>;
  remove: (path: string) => Promise<{ error: unknown }>;
}

/** Recusas que o servidor emite ANTES do commit; a transação foi revertida. */
const DEFINITIVE_CODES = new Set(["42501", "22023", "PT409", "23514", "55P03"]);
export function isDefinitiveRejection(error: RpcError | null | undefined): boolean {
  return !!error && typeof error.code === "string" && DEFINITIVE_CODES.has(error.code);
}

export function newRequestKey(): string {
  return `proof-${crypto.randomUUID()}`;
}

export function proofObjectPath(entregaId: string, action: "sign" | "attach", extensao: string): string {
  const pasta = action === "sign" ? "assinaturas" : "comprovantes";
  return `entregas/${entregaId}/${pasta}/${crypto.randomUUID()}.${extensao}`;
}

/** Operação pendente: mesmo caminho e mesma chave em qualquer retry. */
export interface ProofPending {
  entregaId: string;
  action: ProofAction;
  requestKey: string;
  path: string | null;
}

export type ProofOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "blocked"; error: RpcError | null }
  | { kind: "upload_failed" }
  | { kind: "rejected"; error: RpcError; cleaned: boolean }
  | { kind: "uncertain"; pending: ProofPending }
  | { kind: "stale" };

export interface ProofRun {
  client: ProofClient;
  entregaId: string;
  action: ProofAction;
  /** Operação pendente reaproveitável (mesma entrega/ação/arquivo) ou null. */
  pending: ProofPending | null;
  /** Arquivo a enviar quando não há caminho pendente. */
  blob?: Blob;
  contentType?: string;
  extensao?: string;
  buildPayload?: (path: string) => Record<string, unknown>;
  /** Retorna false se a operação ficou obsoleta (troca de entrega/desmontagem). */
  isCurrent: () => boolean;
}

export async function runProofOperation(run: ProofRun): Promise<ProofOutcome> {
  const { client, entregaId, action } = run;
  const reuse =
    run.pending && run.pending.entregaId === entregaId && run.pending.action === action ? run.pending : null;
  const requestKey = reuse?.requestKey ?? newRequestKey();
  let path = reuse?.path ?? null;
  let uploadedNow = false;

  if (!reuse) {
    // Pré-verificação autorizada antes de qualquer upload; nunca substitui a final.
    const pre = await client.rpc(PROOF_PREFLIGHT_RPC, { p_entrega_id: entregaId, p_action: action });
    if (!run.isCurrent()) return { kind: "stale" };
    if (pre.error) return { kind: "blocked", error: pre.error };
  }

  if (action !== "generate" && !path) {
    if (!run.blob || !run.contentType || !run.extensao) throw new Error("PROOF_FILE_REQUIRED");
    const novo = proofObjectPath(entregaId, action, run.extensao);
    const up = await client.upload(novo, run.blob, run.contentType);
    if (up.error) return run.isCurrent() ? { kind: "upload_failed" } : { kind: "stale" };
    path = novo;
    uploadedNow = true;
  }
  const pendingNow: ProofPending = { entregaId, action, requestKey, path };
  // Obsoleta após upload: não chama a RPC e não apaga (o objeto pertence à entrega antiga).
  if (!run.isCurrent()) return { kind: "stale" };

  const args: Record<string, unknown> = { p_entrega_id: entregaId, p_request_key: requestKey };
  if (action !== "generate") args.p_payload = run.buildPayload ? run.buildPayload(path as string) : {};
  let res: { data: unknown; error: RpcError | null };
  try {
    res = await client.rpc(PROOF_RPC[action], args);
  } catch {
    return { kind: "uncertain", pending: pendingNow };
  }
  if (!res.error) return { kind: "ok", data: res.data };

  if (isDefinitiveRejection(res.error)) {
    let cleaned = false;
    // Só o objeto recém-criado nesta tentativa, nunca um caminho reaproveitado/compartilhado.
    if (uploadedNow && path) {
      try {
        const rm = await client.remove(path);
        cleaned = !rm.error;
      } catch {
        cleaned = false;
      }
    }
    return { kind: "rejected", error: res.error, cleaned };
  }
  return { kind: "uncertain", pending: pendingNow };
}
