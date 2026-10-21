/** Local bounded receipt-preparation diagnostics: stage/outcome/elapsed only.
 * Never IDs, paths, tenant, tokens, URLs, payloads or error text; no network/persistence. */
export type ReceiptPrepareStage = "fresh_read" | "issue" | "row_read" | "edge" | "bytes" | "post_read" | "download";
export type ReceiptPrepareOutcome = "ok" | "timeout" | "fence" | "error" | "stale_state" | "busy";
export interface ReceiptPrepareDiagnostic { source: "list" | "button"; stage: ReceiptPrepareStage; outcome: ReceiptPrepareOutcome; elapsedMs: number }
const STAGES: ReceiptPrepareStage[] = ["fresh_read", "issue", "row_read", "edge", "bytes", "post_read", "download"];
const OUTCOMES: ReceiptPrepareOutcome[] = ["ok", "timeout", "fence", "error", "stale_state", "busy"];
const records: ReceiptPrepareDiagnostic[] = [];
export function recordReceiptPrepare(sample: ReceiptPrepareDiagnostic): void {
  const record: ReceiptPrepareDiagnostic = {
    source: sample.source === "button" ? "button" : "list",
    stage: STAGES.includes(sample.stage) ? sample.stage : "fresh_read",
    outcome: OUTCOMES.includes(sample.outcome) ? sample.outcome : "error",
    elapsedMs: Number.isFinite(sample.elapsedMs) ? Math.round(Math.max(0, Math.min(600_000, sample.elapsedMs))) : 0,
  };
  records.push(record);
  if (records.length > 40) records.shift();
  if (record.outcome !== "ok") { try { console.info("cultivo-receipt-prepare", JSON.stringify(record)); } catch { /* observer only */ } }
}
export const readReceiptPrepareDiagnostics = () => records.map(r => ({ ...r }));
export const clearReceiptPrepareDiagnostics = () => { records.length = 0; };
