const OWNER_TYPES = new Set(["RECEIVABLE", "PAYABLE", "PAYMENT_RECEIVABLE", "PAYMENT_PAYABLE", "FISCAL_INVOICE"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path contract only; ownership/tenant/authorization are resolved by Storage RLS. */
export function supportsFinancialDocumentOwner(ownerType: string, ownerId: string | null | undefined) {
  return OWNER_TYPES.has(ownerType) && typeof ownerId === "string" && UUID.test(ownerId);
}

export function financialDocumentStoragePath(ownerType: string, ownerId: string, filename: string) {
  if (!supportsFinancialDocumentOwner(ownerType, ownerId)) throw new Error("Origem do documento inválida");
  if (!filename.trim() || filename.length > 180 || /[\/\\\x00-\x1f\x7f]|\.\.|%/u.test(filename)) {
    throw new Error("Nome de arquivo inválido");
  }
  const basename = filename.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!/[a-zA-Z0-9]/.test(basename)) throw new Error("Nome de arquivo inválido");
  return `${ownerType}/${ownerId}/${crypto.randomUUID()}-${basename}`;
}