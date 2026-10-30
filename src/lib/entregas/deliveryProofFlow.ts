/**
 * Fluxo de comprovação de entrega (formulário, assinatura digital, anexo).
 *
 * Autoridade é exclusivamente do servidor: a pré-verificação antes do upload só
 * evita enviar arquivos que seriam recusados; a RPC final revalida tudo.
 *
 * Regras de retry/limpeza (revisão 69d77e3):
 * - pré-verificação só libera upload com envelope EXATO
 *   `{allowed:true, entrega_id, action}` da mesma entrega/ação;
 * - sucesso só com ACK EXATO `{success:true, action, entrega_id, comprovante_id,
 *   object_path}`; qualquer outro corpo sem erro é INCERTO e retém chave/caminho;
 * - o cliente NUNCA apaga objetos: um código SQLSTATE não prova que o arquivo
 *   não foi vinculado por outra chamada concorrente (ex.: PT409
 *   OBJECT_ALREADY_LINKED). Objeto recusado fica guardado sem vínculo;
 * - troca de escopo após qualquer espera devolve `stale` sem efeitos locais;
 * - chamadas simultâneas da mesma entrega/ação são recusadas localmente (`busy`).
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
/** Sem `remove`: limpeza de objetos não é decidida pelo cliente. */
export interface ProofClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  upload: (path: string, body: Blob, contentType: string) => Promise<{ error: unknown }>;
}

/** Recusas emitidas antes do commit (transação revertida, nada gravado por ESTA chamada). */
const DEFINITIVE_CODES = new Set(["42501", "22023", "PT409", "23514"]);
/** Recusas transitórias: transação revertida, mas a mesma chave/caminho pode ser reenviada. */
const RETRYABLE_CODES = new Set(["55P03", "40001", "40P01", "PT503", "57014"]);
export function isDefinitiveRejection(error: RpcError | null | undefined): boolean {
  return !!error && typeof error.code === "string" && DEFINITIVE_CODES.has(error.code);
}
export function isRetryableRejection(error: RpcError | null | undefined): boolean {
  return !!error && typeof error.code === "string" && RETRYABLE_CODES.has(error.code);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Envelope exato da pré-verificação para esta entrega e ação. */
export function isValidPreflight(data: unknown, entregaId: string, action: ProofAction): boolean {
  return isObj(data) && data.allowed === true && data.entrega_id === entregaId && data.action === action;
}

/** ACK exato da gravação para esta entrega, ação e caminho. */
export function isValidProofAck(data: unknown, entregaId: string, action: ProofAction, path: string | null): boolean {
  if (!isObj(data)) return false;
  if (data.success !== true || data.action !== action || data.entrega_id !== entregaId) return false;
  if (typeof data.comprovante_id !== "string" || !UUID_RE.test(data.comprovante_id)) return false;
  if (action === "generate") return data.object_path === null || data.object_path === undefined;
  return typeof path === "string" && data.object_path === path;
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
  /** Recusa definitiva: nada vinculado por esta chamada; objeto enviado (se houver) é mantido. */
  | { kind: "rejected"; error: RpcError; retainedPath: string | null }
  | { kind: "uncertain"; pending: ProofPending }
  | { kind: "stale" }
  | { kind: "busy" };

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

const inFlight = new Set<string>();

export async function runProofOperation(run: ProofRun): Promise<ProofOutcome> {
  const slot = `${run.entregaId}:${run.action}`;
  if (inFlight.has(slot)) return { kind: "busy" };
  inFlight.add(slot);
  try {
    return await runOnce(run);
  } finally {
    inFlight.delete(slot);
  }
}

async function runOnce(run: ProofRun): Promise<ProofOutcome> {
  const { client, entregaId, action } = run;
  const reuse =
    run.pending && run.pending.entregaId === entregaId && run.pending.action === action ? run.pending : null;
  const requestKey = reuse?.requestKey ?? newRequestKey();
  let path = reuse?.path ?? null;

  if (!reuse) {
    // Pré-verificação autorizada antes de qualquer upload; nunca substitui a final.
    let pre: { data: unknown; error: RpcError | null };
    try {
      pre = await client.rpc(PROOF_PREFLIGHT_RPC, { p_entrega_id: entregaId, p_action: action });
    } catch {
      return run.isCurrent() ? { kind: "blocked", error: null } : { kind: "stale" };
    }
    if (!run.isCurrent()) return { kind: "stale" };
    if (pre.error) return { kind: "blocked", error: pre.error };
    if (!isValidPreflight(pre.data, entregaId, action)) {
      return { kind: "blocked", error: { code: "PROOF_PREFLIGHT_INVALID", message: null } };
    }
  }

  if (action !== "generate" && !path) {
    if (!run.blob || !run.contentType || !run.extensao) throw new Error("PROOF_FILE_REQUIRED");
    const novo = proofObjectPath(entregaId, action, run.extensao);
    let up: { error: unknown };
    try {
      up = await client.upload(novo, run.blob, run.contentType);
    } catch {
      // Upload ambíguo: o objeto pode existir; só reaproveitar o mesmo caminho.
      return run.isCurrent() ? { kind: "uncertain", pending: { entregaId, action, requestKey, path: novo } } : { kind: "stale" };
    }
    if (up.error) return run.isCurrent() ? { kind: "upload_failed" } : { kind: "stale" };
    path = novo;
  }
  const pendingNow: ProofPending = { entregaId, action, requestKey, path };
  // Obsoleta após upload: não chama a RPC (o objeto pertence à entrega antiga).
  if (!run.isCurrent()) return { kind: "stale" };

  const args: Record<string, unknown> = { p_entrega_id: entregaId, p_request_key: requestKey };
  if (action !== "generate") args.p_payload = run.buildPayload ? run.buildPayload(path as string) : {};
  let res: { data: unknown; error: RpcError | null };
  try {
    res = await client.rpc(PROOF_RPC[action], args);
  } catch {
    return run.isCurrent() ? { kind: "uncertain", pending: pendingNow } : { kind: "stale" };
  }
  // Escopo trocado durante a espera: nenhum efeito local.
  if (!run.isCurrent()) return { kind: "stale" };
  if (!res.error) {
    return isValidProofAck(res.data, entregaId, action, path)
      ? { kind: "ok", data: res.data }
      : { kind: "uncertain", pending: pendingNow };
  }
  if (isDefinitiveRejection(res.error)) {
    return { kind: "rejected", error: res.error, retainedPath: reuse ? null : path };
  }
  return { kind: "uncertain", pending: pendingNow };
}
