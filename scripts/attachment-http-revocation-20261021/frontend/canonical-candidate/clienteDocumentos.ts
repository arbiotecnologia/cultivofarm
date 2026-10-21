import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";

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
  nomeCliente: string
): Promise<{ totalDocs: number; baixados: number; falhas: string[] }> {
  const { data: docs, error } = await (supabase as any)
    .from("cliente_documentos")
    .select("*")
    .eq("cliente_id", clienteId);

  if (error) throw error;
  const lista = (docs || []) as unknown as ClienteDocumento[];

  if (lista.length === 0) {
    return { totalDocs: 0, baixados: 0, falhas: [] };
  }

  const zip = new JSZip();
  const falhas: string[] = [];
  let baixados = 0;

  for (const doc of lista) {
    try {
      const blob = await downloadAuthenticatedAttachment("clientes-docs", doc.arquivo_path, new AbortController().signal);
      if (!blob) {
        falhas.push(doc.nome);
        continue;
      }
      const safeTipo = (doc.tipo || "outro").toString();
      zip.file(`${safeTipo}/${doc.nome}`, blob);
      baixados += 1;
    } catch {
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

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeName = (nomeCliente || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  const filename = `backup-documentos-${safeName}-${yyyymmdd}.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
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
