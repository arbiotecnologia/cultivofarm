/**
 * Upload de mídias com retry idempotente.
 *
 * Path determinístico (`${registroRemoteId}/${kind}/${clientUuid}.${ext}`) +
 * `upsert: true` garantem que reenvios sobrescrevam o mesmo objeto.
 *
 * A idempotência NÃO se apoia apenas na existência de `client_uuid`: a
 * referência encontrada precisa apontar para o MESMO registro, o MESMO path e
 * o objeto precisa existir de fato no Storage. Divergências viram
 * `idempotency_conflict`; referência órfã (sem objeto) provoca reenvio; objeto
 * sem referência provoca criação da referência.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath, getCurrentOrganizationId, isTenantScopedStoragePath } from "@/lib/tenantStoragePath";

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
  /** Momento da captura (preservado no retry) */
  capturadoEm?: string | null;
}

export interface UploadResult {
  success: boolean;
  remotePath?: string;
  attempts: number;
  error?: string;
  /** Código estável de erro (ex.: idempotency_conflict) */
  errorCode?: "idempotency_conflict" | "storage_unconfirmed" | "max_attempts" | "unknown";
  /** True quando o upload foi pulado por já existir confirmado */
  alreadyUploaded?: boolean;
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

/** Confirma que o objeto existe no Storage no path informado. */
async function objectExists(remotePath: string): Promise<boolean> {
  const folder = remotePath.substring(0, remotePath.lastIndexOf("/"));
  const fileName = remotePath.substring(remotePath.lastIndexOf("/") + 1);
  const { data } = await supabase.storage.from(BUCKET).list(folder, { search: fileName });
  return (data || []).some((f: { name: string }) => f.name === fileName);
}

/** Busca a referência existente por client_uuid. */
async function fetchReference(clientUuid: string) {
  const { data } = await supabase
    .from("registros_consultor_arquivos")
    .select("id, arquivo_url, arquivo_path, registro_consultor_id")
    .eq("client_uuid", clientUuid)
    .maybeSingle();
  return (data as any) ?? null;
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
    return {
      success: false,
      attempts,
      errorCode: "max_attempts",
      error: `máximo de tentativas (${MAX_UPLOAD_ATTEMPTS}) excedido`,
    };
  }

  const organizationId = await getCurrentOrganizationId();
  const previousPath = input.previousRemotePath;
  const remotePath = previousPath && isTenantScopedStoragePath(previousPath, organizationId)
    ? previousPath
    : await buildTenantStoragePath(buildRemotePath(input, registroRemoteId));
  const tipoMidia = input.kind === "documento" ? "pdf" : input.kind;

  const okResult = (alreadyUploaded = false): UploadResult => ({
    success: true,
    remotePath,
    attempts,
    alreadyUploaded,
    arquivo_path: remotePath,
    bucket: BUCKET,
    nome_arquivo: input.fileName,
    tipo_arquivo: input.mimeType,
    tipo_midia: tipoMidia,
  });

  const buildRow = () => ({
    registro_consultor_id: registroRemoteId,
    arquivo_url: null,
    arquivo_path: remotePath,
    nome_arquivo: input.fileName,
    tipo_arquivo: input.mimeType,
    tipo_midia: tipoMidia,
    categoria_arquivo: (input.categoria as any) || "geral",
    legenda: input.legenda || null,
    foto_principal: !!input.isPrincipal,
    duracao_segundos: input.duracaoSegundos ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    capturado_em: input.capturadoEm || new Date().toISOString(),
    client_uuid: input.clientUuid,
  });

  try {
    // 1) Referência existente — validar registro, path e objeto no Storage
    const existingRow = await fetchReference(input.clientUuid);
    if (existingRow) {
      if (
        existingRow.registro_consultor_id !== registroRemoteId ||
        (existingRow.arquivo_path && existingRow.arquivo_path !== remotePath)
      ) {
        return {
          success: false,
          attempts,
          remotePath,
          errorCode: "idempotency_conflict",
          error: "client_uuid já usado por outro registro/arquivo",
        };
      }
      const path = existingRow.arquivo_path || remotePath;
      if (await objectExists(path)) {
        return okResult(true);
      }
      // Referência sem objeto no Storage → segue para reenvio.
    }

    // 2) Upload com upsert (sobrescreve o mesmo path em retries)
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(remotePath, input.file, { contentType: input.mimeType, upsert: true });
    if (upErr) {
      return { success: false, attempts, error: upErr.message, errorCode: "unknown", remotePath };
    }

    // 3) Validação pós-upload
    if (!(await objectExists(remotePath))) {
      return {
        success: false,
        attempts,
        remotePath,
        errorCode: "storage_unconfirmed",
        error: "upload sem confirmação no storage",
      };
    }

    // 4) Objeto confirmado. Se a referência já existia (órfã), nada a inserir.
    if (existingRow) return okResult(true);

    const { error: insErr } = await supabase
      .from("registros_consultor_arquivos")
      .insert({
        ...buildRow(),
        uploaded_by: (await supabase.auth.getUser()).data.user?.id,
      } as any);

    if (insErr) {
      // 5) Corrida: outro processo inseriu a mesma referência. Buscar e validar
      //    o vencedor — só é sucesso se apontar para o mesmo registro/path.
      if ((insErr as any).code === "23505") {
        const winner = await fetchReference(input.clientUuid);
        if (
          winner &&
          winner.registro_consultor_id === registroRemoteId &&
          (!winner.arquivo_path || winner.arquivo_path === remotePath)
        ) {
          return okResult(true);
        }
        return {
          success: false,
          attempts,
          remotePath,
          errorCode: "idempotency_conflict",
          error: "corrida resolvida para outro registro/arquivo",
        };
      }
      return { success: false, attempts, error: insErr.message, errorCode: "unknown", remotePath };
    }

    return okResult(false);
  } catch (err: any) {
    return {
      success: false,
      attempts,
      errorCode: "unknown",
      error: err?.message || "erro desconhecido",
      remotePath,
    };
  }
}
