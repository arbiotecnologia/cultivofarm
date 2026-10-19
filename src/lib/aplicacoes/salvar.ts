import { supabase } from "@/integrations/supabase/client";
import { caminhoEvidencia, validarArquivoEvidencia } from "./evidencias";
import type { PendingEvidencia, EvidenciaEnviada } from "@/components/aplicacao/EvidenciasUploader";

export interface ApplicationAttempt {
  id: string;
  fingerprint: string;
  evidence: EvidenciaEnviada[];
  uploaded: Set<string>;
  payload: Record<string, unknown>;
}
export function applicationAttempt(payload: Record<string, unknown>, rectifyId: string | null, pending: PendingEvidencia[], keep: string[], clientId: string, previous?: ApplicationAttempt): ApplicationAttempt {
  const fingerprint = JSON.stringify([payload, rectifyId, clientId, keep, pending.map(p => [p.id, p.file.size, p.file.type, p.legenda])]);
  if (previous?.fingerprint === fingerprint) return previous;
  if (pending.length + keep.length > 20) throw new Error("Máximo de 20 evidências");
  const id = crypto.randomUUID();
  const evidence = pending.map(item => {
    const error = validarArquivoEvidencia(item.file);
    if (error) throw new Error(error);
    return { tipo: item.tipo, storage_path: caminhoEvidencia(clientId, id, crypto.randomUUID(), item.file.type),
      legenda: item.legenda || null, mime: item.file.type, tamanho_bytes: item.file.size };
  });
  return { id, fingerprint, evidence, uploaded: new Set(), payload: { ...payload } };
}

/** Same RPC, two phases. SDK attaches the current authenticated caller; no keys/tokens or URL fallbacks. */
export async function salvarAplicacao(attempt: ApplicationAttempt, payload: Record<string, unknown>, rectifyId: string | null,
  pending: PendingEvidencia[], keep: string[], current: () => boolean, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const bounded = <T,>(request: PromiseLike<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Operação interrompida; confirme o acesso antes de tentar novamente."));
    if (controller.signal.aborted) { abort(); return; }
    controller.signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(request).then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
  });
  const assert = () => { if (!current() || controller.signal.aborted) throw new Error("Acesso expirado ou operação interrompida. Confirme o acesso antes de tentar novamente."); };
  const args = { p_aplicacao_id: attempt.id, p_rectify_id: rectifyId, p_evidencias: attempt.evidence, p_evidencias_manter: keep };
  // Generated database types currently omit this existing hosted signature.
  // Narrow only that method; keep the canonical client's authentication and transport.
  const rpcClient = supabase as unknown as { rpc(name: "rpc_salvar_aplicacao_v1", args: Record<string, unknown>):
    { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: Error | null }> } };
  const call = async (phase: "prepare" | "finalize") => {
    assert();
    const { data, error } = await bounded(rpcClient.rpc("rpc_salvar_aplicacao_v1", { ...args, p_payload: { ...attempt.payload, _phase: phase } }).abortSignal(controller.signal));
    assert();
    if (error) throw error;
    const receipt = data as { success?: boolean; id?: string; phase?: string } | null;
    if (!receipt?.success || receipt.id !== attempt.id || !["prepared", "finalized"].includes(receipt.phase || "")) throw new Error("Resposta de salvamento inválida");
    return receipt;
  };
  try {
    const prepared = await call("prepare");
    if (prepared.phase === "finalized") return prepared;
    for (let index = 0; index < pending.length; index++) {
      assert();
      const metadata = attempt.evidence[index];
      const item = pending[index];
      if (!metadata || !item) throw new Error("Evidência inválida");
      if (attempt.uploaded.has(metadata.storage_path)) continue;
      // Storage upload cannot reliably be aborted by this SDK version. Fence late completion;
      // retain a locator for retry and never automatically delete an unknown committed object.
      const { error } = await bounded(supabase.storage.from("aplicacao-evidencias").upload(metadata.storage_path, item.file,
        { contentType: metadata.mime, upsert: false }));
      assert();
      if (error && !["409", "Duplicate"].includes(String((error as { statusCode?: string }).statusCode || ""))) throw error;
      attempt.uploaded.add(metadata.storage_path);
    }
    const finalized = await call("finalize");
    if (finalized.phase !== "finalized") throw new Error("Aplicação ainda não finalizada");
    assert();
    return finalized;
  } finally { clearTimeout(timer); }
}