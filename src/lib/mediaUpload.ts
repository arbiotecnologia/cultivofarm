/**
 * Upload de mídias com retry idempotente.
 *
 * Path determinístico (`${registroRemoteId}/${kind}/${clientUuid}.${ext}`) +
 * `upsert: true` garantem que reenvios sobrescrevam o mesmo objeto, e o
 * `client_uuid` na tabela `registros_consultor_arquivos` evita duplicar a
 * referência caso a função seja chamada mais de uma vez para o mesmo blob.
 */

import { supabase } from "@/integrations/supabase/client";

export const MAX_UPLOAD_ATTEMPTS = 3;
export const BUCKET = "consultor-arquivos";

export type MediaKind = "foto" | "audio" | "documento";

export interface UploadInput {
  /** UUID gerado no cliente — chave de idempotência */
  clientUuid: string;
  file: Blob;
  fileName: string;
  mimeType: string;
  kind: MediaKind;
  /** Categoria do registro_consultor_arquivos */
  categoria?: string;
  legenda?: string | null;
  isPrincipal?: boolean;
  duracaoSegundos?: number | null;
  /** Tentativas anteriores (para limitar retries) */
  previousAttempts?: number;
  /** Path remoto previamente tentado, se houver */
  previousRemotePath?: string | null;
  /** Geolocalização */
  latitude?: number | null;
  longitude?: number | null;
}

export interface UploadResult {
  success: boolean;
  remotePath?: string;
  attempts: number;
  error?: string;
  /** True quando o upload foi pulado por já existir confirmado */
  alreadyUploaded?: boolean;
  /** Novos campos para conformidade 10.2.1.7.2 */
  arquivo_path?: string;
  bucket?: string;
  nome_arquivo?: string;
  tipo_arquivo?: string;
  tipo_midia?: string;
}

function extFor(input: UploadInput): string {
  const fromName = input.fileName.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (input.kind === "audio") return "webm";
  if (input.kind === "documento") return "pdf";
  return "jpg";
}

export function buildRemotePath(input: UploadInput, registroRemoteId: string): string {
  const ext = extFor(input);
  return `${registroRemoteId}/${input.kind}/${input.clientUuid}.${ext}`;
}

/**
 * Faz upload com upsert + valida via list + insere referência idempotente
 * via `client_uuid`. Retorna sucesso somente quando a mídia está confirmada.
 */
export async function uploadMediaIdempotent(
  input: UploadInput,
  registroRemoteId: string
): Promise<UploadResult> {
  const attempts = (input.previousAttempts || 0) + 1;
  if (attempts > MAX_UPLOAD_ATTEMPTS) {
    console.error(`[Upload] Máximo de tentativas excedido para ${input.fileName}`);
    return {
      success: false,
      attempts,
      error: `máximo de tentativas (${MAX_UPLOAD_ATTEMPTS}) excedido`,
    };
  }


  const remotePath = input.previousRemotePath || buildRemotePath(input, registroRemoteId);

  try {
    // 1) Verifica se a referência já existe (idempotência por client_uuid)
    const { data: existingRow } = await supabase
      .from("registros_consultor_arquivos")
      .select("id, arquivo_url")
      .eq("client_uuid", input.clientUuid)
      .maybeSingle();

    if (existingRow) {
      return { success: true, remotePath, attempts, alreadyUploaded: true };
    }

    // 2) Upload com upsert (sobrescreve o mesmo path em retries)
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(remotePath, input.file, {
        contentType: input.mimeType,
        upsert: true,
      });
    if (upErr) {
      console.error(`[Upload] Erro no storage upload para ${remotePath}:`, upErr);
      return { success: false, attempts, error: upErr.message, remotePath };
    }


    // 3) Validação pós-upload via list
    const folder = remotePath.substring(0, remotePath.lastIndexOf("/"));
    const fileName = remotePath.substring(remotePath.lastIndexOf("/") + 1);
    const { data: listData } = await supabase.storage
      .from(BUCKET)
      .list(folder, { search: fileName });
    const found = (listData || []).some((f) => f.name === fileName);
    if (!found) {
      console.error(`[Upload] Arquivo não encontrado após upload: ${remotePath}`);
      return {
        success: false,
        attempts,
        error: "upload sem confirmação no storage",
        remotePath,
      };
    }


    // 4) Insere referência idempotente — UNIQUE(client_uuid) protege contra corrida
    const { error: insErr } = await supabase.from("registros_consultor_arquivos").insert({
      registro_consultor_id: registroRemoteId,
      arquivo_url: null, // Prioriza arquivo_path para novos registros
      arquivo_path: remotePath,
      nome_arquivo: input.fileName,
      tipo_arquivo: input.mimeType,
      tipo_midia: input.kind === "documento" ? "pdf" : input.kind,
      categoria_arquivo: (input.categoria as any) || "geral",
      legenda: input.legenda || null,
      foto_principal: !!input.isPrincipal,
      duracao_segundos: input.duracaoSegundos ?? null,
      uploaded_by: (await supabase.auth.getUser()).data.user?.id,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      capturado_em: new Date().toISOString(),
      client_uuid: input.clientUuid,
    } as any);

    if (insErr && (insErr as any).code !== "23505") {
      return { success: false, attempts, error: insErr.message, remotePath };
    }

    return { 
      success: true, 
      remotePath, 
      attempts,
      arquivo_path: remotePath,
      bucket: BUCKET,
      nome_arquivo: input.fileName,
      tipo_arquivo: input.mimeType,
      tipo_midia: input.kind === "documento" ? "pdf" : input.kind
    };
  } catch (err: any) {
    return {
      success: false,
      attempts,
      error: err?.message || "erro desconhecido",
      remotePath,
    };
  }
}
