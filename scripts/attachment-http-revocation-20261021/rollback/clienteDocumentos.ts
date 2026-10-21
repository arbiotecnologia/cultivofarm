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
  throw new Error("Documentos indisponíveis");
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
