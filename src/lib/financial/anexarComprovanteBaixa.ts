/**
 * H6c-004 — anexo idempotente do comprovante de baixa.
 *
 * Problema: a RPC financeira pode ter persistido a baixa e o upload/insert do
 * comprovante falhar. No retry, a mesma `idempotency_key` devolve o mesmo
 * `payment_id`; se o caminho do arquivo usasse `Date.now()`, o retry criaria um
 * segundo arquivo e um segundo `financial_documents` para a MESMA tentativa
 * lógica.
 *
 * Correção (sem fluxo paralelo): caminho determinístico por
 * `organization_id / owner_type / payment_id / idempotency_key-arquivo` + verificação prévia de
 * documento equivalente. Nada é apagado; o bucket `financial-docs` e as RLS
 * exigem o mesmo tenant do registro financeiro.
 */

export type ComprovanteOwnerType = "PAYMENT_RECEIVABLE" | "PAYMENT_PAYABLE";

export type ComprovanteResultado = "created" | "reused";

export interface AnexarComprovanteInput {
  ownerType: ComprovanteOwnerType;
  paymentId: string;
  /** Chave de idempotência da MESMA tentativa lógica de baixa. */
  idempotencyKey: string;
  file: { name: string; type?: string; size?: number };
  uploadedBy: string;
  organizationId: string;
}

/** Normaliza o nome do arquivo para um caminho estável e seguro. */
export function sanitizeFileName(name: string): string {
  return (name || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "arquivo";
}

/** Caminho determinístico: o mesmo retry lógico sempre resolve no mesmo objeto. */
export function comprovanteStoragePath(input: {
  ownerType: ComprovanteOwnerType;
  paymentId: string;
  idempotencyKey: string;
  fileName: string;
  organizationId: string;
}): string {
  return `${input.organizationId}/${input.ownerType}/${input.paymentId}/${input.idempotencyKey}-${sanitizeFileName(input.fileName)}`;
}

const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
};

/**
 * Anexa o comprovante de forma idempotente. Retorna `reused` quando o documento
 * equivalente da mesma tentativa lógica já existia (retry após falha parcial).
 */
export async function anexarComprovanteBaixa(
  client: any,
  { ownerType, paymentId, idempotencyKey, file, uploadedBy, organizationId }: AnexarComprovanteInput,
): Promise<ComprovanteResultado> {
  const path = comprovanteStoragePath({
    ownerType,
    paymentId,
    idempotencyKey,
    fileName: file.name,
    organizationId,
  });

  // 1) documento equivalente já registrado nesta tentativa lógica?
  const existente = await client
    .from("financial_documents")
    .select("id")
    .eq("owner_type", ownerType)
    .eq("owner_id", paymentId)
    .eq("storage_path", path)
    .is("deleted_at", null)
    .maybeSingle();
  if (existente?.error) throw existente.error;
  if (existente?.data?.id) return "reused";

  // 2) upload no caminho determinístico. `upsert` evita erro "já existe" quando
  //    o arquivo subiu e apenas o insert falhou — não apaga outro comprovante,
  //    pois o caminho é exclusivo desta tentativa lógica.
  const up = await client.storage.from("financial-docs").upload(path, file, { upsert: true });
  if (up?.error) throw up.error;

  // 3) registro do documento; corrida no mesmo path é tratada como reuso.
  const ins = await client.from("financial_documents").insert({
    owner_type: ownerType,
    owner_id: paymentId,
    document_type: "RECEIPT",
    file_name: file.name,
    storage_path: path,
    mime_type: file.type ?? null,
    file_size: file.size ?? null,
    uploaded_by: uploadedBy,
  });
  if (ins?.error) {
    if (isUniqueViolation(ins.error)) return "reused";
    throw ins.error;
  }
  return "created";
}
