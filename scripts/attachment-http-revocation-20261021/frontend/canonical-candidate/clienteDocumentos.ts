import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";
import { fencedStep, type BackupFence } from "@/lib/authz/backupFence";

export interface ClienteDocumento {
  id: string;
  cliente_id: string;
  nome: string;
  tipo: string | null;
  descricao?: string | null;
  arquivo_path: string;
  tamanho_bytes: number | null;
  mime: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
}

export const CLIENT_BACKUP_LIMITS = { files: 24, totalBytes: 60 * 1024 * 1024 } as const;

/**
 * Baixa todos os documentos do cliente, monta um ZIP com manifest.json e
 * dispara o download no navegador. Retorna a quantidade de arquivos
 * efetivamente baixados.
 */
export async function gerarBackupDocumentosCliente(
  clienteId: string,
  nomeCliente: string,
  fence: BackupFence
): Promise<{ totalDocs: number; baixados: number; falhas: string[] }> {
  const read = async (signal: AbortSignal) => {
    const { data, error } = await supabase.rpc("client_documents_backup_snapshot" as never,
      { _client: clienteId } as never).abortSignal(signal);
    if (error || !Array.isArray(data)) throw new Error("Documentos indisponíveis");
    const rows = data as unknown as Array<{ doc: ClienteDocumento; proof: unknown }>;
    if (rows.some(row => !row.doc || row.doc.cliente_id !== clienteId || !row.proof)) throw new Error("Documentos indisponíveis");
    return rows;
  };
  const initial = await fencedStep(fence, read);
  const snapshot = JSON.stringify(initial);
  const lista = initial.map(row => row.doc);
  if (lista.length > CLIENT_BACKUP_LIMITS.files || lista.reduce((sum, doc) =>
    sum + (typeof doc.tamanho_bytes === 'number' && Number.isFinite(doc.tamanho_bytes) && doc.tamanho_bytes > 0 ? doc.tamanho_bytes : 0), 0)
    > CLIENT_BACKUP_LIMITS.totalBytes) throw new Error("Backup excede o limite de 24 arquivos ou 60 MiB");

  if (lista.length === 0) {
    return { totalDocs: 0, baixados: 0, falhas: [] };
  }

  const zip = new JSZip();
  const falhas: string[] = [];
  let baixados = 0;
  let totalBytes = 0;

  for (const doc of lista) {
    try {
      const blob = await fencedStep(fence, signal => downloadAuthenticatedAttachment("clientes-docs", doc.arquivo_path, signal));
      if (!blob) {
        falhas.push(doc.nome);
        continue;
      }
      totalBytes += blob.size;
      if (totalBytes > CLIENT_BACKUP_LIMITS.totalBytes) throw new Error("Backup excede o limite de 60 MiB");
      const safeTipo = (doc.tipo || "outro").toString();
      zip.file(`${safeTipo}/${doc.nome}`, blob);
      baixados += 1;
    } catch {
      if (totalBytes > CLIENT_BACKUP_LIMITS.totalBytes) throw new Error("Backup excede o limite de 60 MiB");
      if (fence.signal.aborted || !fence.current()) throw new Error("Documentos indisponíveis");
      falhas.push(doc.nome);
    }
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        cliente_id: clienteId,
        nome_cliente: nomeCliente,
        gerado_em: new Date().toISOString(),
        total_documentos: lista.length,
        baixados,
        falhas,
        documentos: lista.map((d) => ({
          id: d.id,
          nome_original: d.nome,
          tipo: d.tipo,
          descricao: d.descricao,
          arquivo_path: d.arquivo_path,
          tamanho_bytes: d.tamanho_bytes,
          mime: d.mime,
          uploaded_at: d.uploaded_at,
          uploaded_by: d.uploaded_by,
        })),
      },
      null,
      2
    )
  );

  const zipBlob = await fencedStep(fence, () => zip.generateAsync({ type: "blob" }));
  const fresh = await fencedStep(fence, read);
  if (JSON.stringify(fresh) !== snapshot) throw new Error("Documentos indisponíveis");
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeName = (nomeCliente || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  const filename = `backup-documentos-${safeName}-${yyyymmdd}.zip`;

  if (fence.signal.aborted || !fence.current()) throw new Error("Documentos indisponíveis");
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  if (fence.signal.aborted || !fence.current()) { a.remove(); URL.revokeObjectURL(url); throw new Error("Documentos indisponíveis"); }
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { totalDocs: lista.length, baixados, falhas };
}

/**
 * Remove todos os documentos do cliente (arquivos do bucket + linhas da tabela).
 */
export async function removerTodosDocumentosCliente(clienteId: string): Promise<void> {
  const { data: docs, error } = await (supabase as any)
    .from("cliente_documentos")
    .select("id, arquivo_path")
    .eq("cliente_id", clienteId);
  if (error) throw error;
  const lista = (docs || []) as Array<{ id: string; arquivo_path: string }>;
  if (lista.length === 0) return;
  const paths = lista.map((d) => d.arquivo_path).filter(Boolean);
  if (paths.length > 0) {
    await (supabase as any).storage.from("clientes-docs").remove(paths);
  }
  await (supabase as any)
    .from("cliente_documentos")
    .delete()
    .eq("cliente_id", clienteId);
}
