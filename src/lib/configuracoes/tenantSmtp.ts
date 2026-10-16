import { supabase } from "@/integrations/supabase/client";
import { saveSchema, viewSchema, type SmtpView } from "../../../scripts/smtp-tenant-candidate/_shared/contract";
export * from "../../../scripts/smtp-tenant-candidate/_shared/contract";

// Auditor-only draft activation after ACL/Vault and application-log review.
// HTTPS + Vault accepted by owner; infrastructure log suppression is unverified.
// Keep OFF: no request, credential submission or global fallback in this delivery.
export const TENANT_SMTP_REVIEWED = false;
export interface TenantSmtpTransport {
  load(): Promise<SmtpView>;
  save(input: unknown): Promise<SmtpView>;
}
async function request(method: "GET" | "PUT", input?: unknown): Promise<SmtpView> {
  if (!TENANT_SMTP_REVIEWED) throw new Error("SMTP_UNAVAILABLE");
  const body = method === "PUT" ? saveSchema.parse(input) : undefined;
  const { data, error } = await supabase.functions.invoke("tenant-email-settings", { method, body });
  if (error) {
    // Never expose arbitrary remote body/message; no automatic retry on writes.
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new Error(status === 401 ? "SMTP_UNAUTHORIZED" : status === 403 ? "SMTP_FORBIDDEN" : status === 409 ? "SMTP_CONFLICT" : status === 400 ? "SMTP_INVALID" : "SMTP_INTERNAL");
  }
  const parsed = viewSchema.safeParse(data);
  if (!parsed.success) throw new Error("SMTP_INTERNAL");
  return parsed.data;
}
export const tenantSmtpTransport: TenantSmtpTransport = { load: () => request("GET"), save: input => request("PUT", input) };
