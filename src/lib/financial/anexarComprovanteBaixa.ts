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
 * `owner_type / payment_id / idempotency_key-arquivo` + verificação prévia de
 * documento equivalente. Nada é apagado; o bucket `financial-docs` e as RLS
 * exigem o mesmo tenant do registro financeiro.
 */

import { supportsFinancialDocumentOwner } from "@/lib/financeiro/documentStoragePath";

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
  /** Fence captured by useStorageAccessScope; never an authorization source. */
  isCurrent: () => boolean;
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
  if (!supportsFinancialDocumentOwner(input.ownerType, input.paymentId)
    || !["PAYMENT_RECEIVABLE", "PAYMENT_PAYABLE"].includes(input.ownerType)
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.idempotencyKey)
    || !input.fileName.trim() || /\.\.|%|[\/\\\x00-\x1f\x7f]/.test(input.fileName)) {
    throw new Error("Origem do comprovante inválida");
  }
  return `${input.ownerType}/${input.paymentId}/${input.idempotencyKey}-${sanitizeFileName(input.fileName)}`;
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
  { ownerType, paymentId, idempotencyKey, file, uploadedBy, organizationId, isCurrent }: AnexarComprovanteInput,
): Promise<ComprovanteResultado> {
  let expired = false;
  const assertCurrent = () => {
    if (expired || !isCurrent()) throw new Error("Contexto do comprovante expirado");
  };
  assertCurrent();
  if (!organizationId || !uploadedBy) throw new Error("Contexto do comprovante inválido");
  const path = comprovanteStoragePath({
    ownerType,
    paymentId,
    idempotencyKey,
    fileName: file.name,
    organizationId,
  });

  const lookup = () => client
    .from("financial_documents")
    .select("id")
    .eq("owner_type", ownerType)
    .eq("owner_id", paymentId)
    .eq("storage_path", path)
    .eq("organization_id", organizationId)
    .eq("uploaded_by", uploadedBy)
    .is("deleted_at", null)
    .maybeSingle();
  const confirmActor = async () => {
    assertCurrent();
    const { data, error } = await client.auth.getUser();
    assertCurrent();
    if (error || data?.user?.id !== uploadedBy) throw new Error("Sessão do comprovante inválida");
  };
  const work = async (): Promise<ComprovanteResultado> => {
    await confirmActor();
    const existente = await lookup();
    assertCurrent();
    if (existente?.error) throw existente.error;
    if (existente?.data?.id) { await confirmActor(); return "reused"; }

    // Retry preserves the same logical object; no deletion or new payment.
    await confirmActor();
    const up = await client.storage.from("financial-docs").upload(path, file, { upsert: true });
    assertCurrent();
    if (up?.error) throw up.error;
    await confirmActor();

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
    assertCurrent();
    await confirmActor();
    if (ins?.error) {
      if (isUniqueViolation(ins.error)) {
        const existing = await lookup();
        assertCurrent();
        if (!existing?.error && existing?.data?.id) { await confirmActor(); return "reused"; }
      }
      throw ins.error;
    }
    return "created";
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error("Prazo do comprovante expirado")); }, 15_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
