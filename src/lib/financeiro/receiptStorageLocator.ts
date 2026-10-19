/** Locator validation only. Receipt RLS and authenticated Storage authorize access. */
export function financialReceiptLocator(receipt: {
  organization_id: string; receipt_year: number; receipt_number: string;
  storage_path: string | null; storage_bucket?: string | null;
}, tenant: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant) ||
      receipt.organization_id !== tenant || !Number.isInteger(receipt.receipt_year) ||
      !/^REC-\d{4}-\d{6,}$/.test(receipt.receipt_number) ||
      receipt.receipt_number.split("-")[1] !== String(receipt.receipt_year) ||
      (receipt.storage_bucket != null && receipt.storage_bucket !== "financial-receipts")) {
    throw new Error("Recibo indisponível");
  }
  const path = `${tenant}/${receipt.receipt_year}/${receipt.receipt_number}.pdf`;
  if (receipt.storage_path != null && receipt.storage_path !== path) throw new Error("Recibo indisponível");
  return path;
}