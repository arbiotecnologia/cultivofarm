import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const MICRO_DOCUMENT_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  versionsPerMicro: 50,
  tenantBytes: 500 * 1024 * 1024,
  uploadsPerHour: 20,
  concurrent: 2,
});
export const microDocumentSchema = z
  .object({
    id: z.string().uuid(),
    document_id: z.string().uuid(),
    version: z.number().int().positive(),
    micro_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    title: z.string().min(1).max(200),
    file_name: z.string().min(1).max(200),
    mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    size_bytes: z
      .number()
      .int()
      .positive()
      .max(MICRO_DOCUMENT_LIMITS.fileBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type MicroDocument = z.infer<typeof microDocumentSchema>;
const reservationSchema = z.object({
  upload_id: z.string().uuid(),
  document_id: z.string().uuid(),
  micro_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  committed: z.boolean(),
  expires_at: z.string().datetime({ offset: true }),
});
const ackSchema = z
  .object({
    ok: z.literal(true),
    id: z.string().uuid(),
    micro_id: z.string().uuid(),
    organization_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
    document_id: z.string().uuid(),
    version_id: z.string().uuid(),
    version: z.number().int().positive(),
  })
  .passthrough();
export function documentError(error: { code?: string; message?: string }) {
  const messages: Record<string, string> = {
    PT409:
      "A ficha ou a versão mudou. O anexo não foi confirmado; preserve a tentativa para consultar novamente.",
    PT429:
      "Limite de anexos atingido. Aguarde ou solicite revisão do armazenamento.",
    "42501": "Sem autorização vigente para este documento.",
    PGRST202:
      "O contrato dos anexos próprios ainda não está instalado neste ambiente.",
    "22023": "Metadados ou integridade do arquivo inválidos.",
  };
  return Object.assign(
    new Error(
      messages[error.code ?? ""] ??
        "Documento indisponível; a tentativa foi preservada.",
    ),
    { serverCode: error.code },
  );
}
export function parseMicroDocuments(data: unknown, micro: string, org: string) {
  const rows = z.array(microDocumentSchema).max(50).parse(data);
  if (
    rows.some((row) => row.micro_id !== micro || row.organization_id !== org) ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw new Error("Documentos fora do escopo da ficha.");
  return rows;
}
export async function verifyMicroDocument(
  blob: Blob,
  expected?: Pick<MicroDocument, "sha256" | "size_bytes" | "mime">,
) {
  if (blob.size < 1 || blob.size > MICRO_DOCUMENT_LIMITS.fileBytes)
    throw new Error("Arquivo deve ter até 10 MiB e não pode estar vazio.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const starts = (signature: number[]) =>
    signature.every((byte, i) => bytes[i] === byte);
  const mime = starts([37, 80, 68, 70, 45])
    ? "application/pdf"
    : starts([137, 80, 78, 71, 13, 10, 26, 10])
      ? "image/png"
      : starts([255, 216, 255])
        ? "image/jpeg"
        : null;
  if (!mime || (blob.type && blob.type !== mime))
    throw new Error("Use PDF, PNG ou JPEG com formato compatível.");
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (
    expected &&
    (expected.sha256 !== sha256 ||
      expected.mime !== mime ||
      expected.size_bytes !== blob.size)
  )
    throw new Error("Integridade do documento não confirmada.");
  return {
    mime,
    sha256,
    size_bytes: blob.size,
    blob: new Blob([bytes], { type: mime }),
  };
}
export type DocumentAttempt = {
  key: string;
  micro: string;
  organization: string;
  expectedRoot: string;
  document: string | null;
  previousVersion: number;
  metadata: {
    title: string;
    file_name: string;
    mime: string;
    size_bytes: number;
    sha256: string;
  };
  file: Blob;
  uploadId?: string;
};
export async function listMicroDocuments(
  micro: string,
  organization: string,
  signal: AbortSignal,
) {
  const result = await supabase
    .rpc("tenant_micro_document_list_v1" as any, { p_micro: micro } as any)
    .abortSignal(signal);
  if (result.error) throw documentError(result.error);
  if (signal.aborted) throw new Error("Consulta encerrada.");
  return parseMicroDocuments(result.data, micro, organization);
}
export async function microDocumentBytes(
  action: "open" | "upload",
  micro: string,
  id: string,
  signal: AbortSignal,
  file?: Blob,
) {
  const result = await supabase.functions.invoke("microorganism-documents", {
    body: file ?? {},
    signal,
    headers: {
      "x-micro-id": micro,
      "x-document-id": id,
      "x-document-action": action,
    },
  });
  if (signal.aborted)
    throw new Error("Operação encerrada; consulte antes de tentar novamente.");
  if (result.error) {
    const response = (result.error as { context?: Response }).context;
    const status = response?.status;
    const messages: Record<number, string> = {
      401: "Sessão expirada.",
      403: "Acesso ao anexo negado.",
      413: "Arquivo acima do limite de 10 MiB.",
      415: "Formato de arquivo não permitido.",
      422: "Integridade do documento não confirmada.",
      429: "Limite de anexos atingido.",
      503: "Serviço de anexos próprios indisponível neste ambiente.",
      504: "Tempo limite; consulte a tentativa antes de repetir.",
    };
    throw new Error(
      messages[status ?? 0] ??
        "Falha no transporte privado; tentativa preservada.",
    );
  }
  if (action === "open") {
    if (!(result.data instanceof Blob))
      throw new Error("Resposta de arquivo inválida; links não são aceitos.");
    return result.data;
  }
  if (
    result.data?.verified !== true ||
    result.data.upload_id !== id ||
    result.data.micro_id !== micro
  )
    throw new Error("Verificação do upload não confirmada.");
  return null;
}
export async function uploadMicroDocument(
  attempt: DocumentAttempt,
  signal: AbortSignal,
  current: () => boolean,
) {
  const guard = () => {
    if (signal.aborted || !current())
      throw new Error("Contexto encerrado; resposta descartada.");
  };
  guard();
  const prepared = await supabase
    .rpc(
      "tenant_micro_document_prepare_v1" as any,
      {
        p_micro: attempt.micro,
        p_expected_root: attempt.expectedRoot,
        p_document: attempt.document,
        p_previous_version: attempt.previousVersion,
        p_metadata: attempt.metadata,
        p_key: attempt.key,
      } as any,
    )
    .abortSignal(signal);
  guard();
  if (prepared.error) throw documentError(prepared.error);
  const reservation = reservationSchema.parse(prepared.data);
  if (
    reservation.micro_id !== attempt.micro ||
    reservation.organization_id !== attempt.organization ||
    (attempt.document && reservation.document_id !== attempt.document)
  )
    throw new Error("Reserva fora do escopo.");
  attempt.uploadId = reservation.upload_id;
  if (!reservation.committed) {
    await microDocumentBytes(
      "upload",
      attempt.micro,
      reservation.upload_id,
      signal,
      attempt.file,
    );
    guard();
  }
  const committed = await supabase
    .rpc(
      "tenant_micro_document_commit_v1" as any,
      { p_micro: attempt.micro, p_upload: reservation.upload_id } as any,
    )
    .abortSignal(signal);
  guard();
  if (committed.error) throw documentError(committed.error);
  const ack = ackSchema.parse(committed.data);
  if (
    ack.id !== attempt.micro ||
    ack.micro_id !== attempt.micro ||
    ack.organization_id !== attempt.organization ||
    ack.document_id !== reservation.document_id ||
    ack.version !== attempt.previousVersion + 1
  )
    throw new Error("Confirmação fora do escopo.");
  return ack;
}
