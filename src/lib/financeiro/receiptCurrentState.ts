import { supabase } from "@/integrations/supabase/client";
import { financialReceiptLocator } from "./receiptStorageLocator";

export type ReceiptStatus = "ISSUED" | "CANCELED";
export interface ReceiptCurrentState { status: ReceiptStatus; path: string; receipt_number: string }

/**
 * Status-bound locator. ISSUED keeps the historical deterministic object; a
 * CANCELED receipt is only ever served from its own watermark render, so the
 * previous ISSUED bytes can never be offered as the current document.
 */
export function financialReceiptCurrentLocator(receipt: {
  organization_id: string; receipt_year: number; receipt_number: string;
  storage_path: string | null; storage_bucket?: string | null; status: string;
}, tenant: string): ReceiptCurrentState {
  const issued = financialReceiptLocator(receipt, tenant);
  if (receipt.status === "ISSUED") return { status: "ISSUED", path: issued, receipt_number: receipt.receipt_number };
  if (receipt.status === "CANCELED") return { status: "CANCELED", path: issued.replace(/\.pdf$/, ".canceled.pdf"), receipt_number: receipt.receipt_number };
  throw new Error("Recibo indisponível");
}

/** Fresh actor-authenticated RLS read; never trusts list snapshots or URLs. */
export async function readReceiptCurrentState(id: string, tenant: string, signal: AbortSignal): Promise<ReceiptCurrentState & { generated: boolean }> {
  const { data, error } = await (supabase as any).from("financial_receipts")
    .select("id,organization_id,receipt_year,receipt_number,storage_bucket,storage_path,status")
    .eq("id", id).eq("organization_id", tenant).limit(2).abortSignal(signal);
  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];
  if (error || rows.length !== 1 || row?.id !== id || typeof row.status !== "string") throw new Error("Recibo indisponível");
  return { ...financialReceiptCurrentLocator(row, tenant), generated: typeof row.storage_path === "string" && row.storage_path.length > 0 };
}
