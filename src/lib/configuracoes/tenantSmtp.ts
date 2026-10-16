import { supabase } from "@/integrations/supabase/client";
import { saveSchema, viewSchema, type SmtpView } from "../../../scripts/smtp-tenant-candidate/_shared/contract";
import { testRequestSchema, testResultSchema, runtimeProofResultSchema, type RuntimeProofResult, type TestRequest, type TestResult } from "../../../scripts/smtp-tenant-candidate/f2f3/contract";
export { testMessage, type TestRequest, type TestResult } from "../../../scripts/smtp-tenant-candidate/f2f3/contract";
export * from "../../../scripts/smtp-tenant-candidate/_shared/contract";
import { f4RequestSchema, f4ResultSchema, type F4Request, type F4Result } from "../../../scripts/smtp-tenant-candidate/f4/contract";
export { f4Message, type F4Request, type F4Result, type F4Status } from "../../../scripts/smtp-tenant-candidate/f4/contract";
// F4 candidate (sender possession + activation). Closed until review + Edge/SQL gates. Dispatch stays false.
export const TENANT_SMTP_F4_PHASE = false;

// Draft-only promotion authorized by owner; auditor deploys after focused review.
// HTTPS + Vault accepted by owner; infrastructure log suppression is unverified.
// Enables draft requests only; server ACL/Vault/review gate remain independent. No global fallback.
export const TENANT_SMTP_REVIEWED = true;
// Hosted proof collected by auditor; temporary UI closed alongside HOSTED_PROOF_ENABLED.
export const TENANT_SMTP_PROOF_PHASE = false;
export function canRunTenantSmtpProof(context:{ready:boolean;userId?:string;organizationId?:string|null;roles:readonly string[]}):boolean {
 return TENANT_SMTP_PROOF_PHASE && context.ready && !!context.userId && context.organizationId==='007bb519-cba0-4704-be2c-cb93ad010048' && context.roles.includes('administrador') && !context.roles.includes('superadmin');
}
export interface TenantSmtpTransport {
  load(): Promise<SmtpView>;
  save(input: unknown): Promise<SmtpView>;
  test?(input: TestRequest): Promise<TestResult>;
  proof?(): Promise<RuntimeProofResult>;
  sender?(input: F4Request): Promise<F4Result>;
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
async function senderRequest(input: F4Request): Promise<F4Result> {
 if (!TENANT_SMTP_F4_PHASE) throw new Error("SMTP_UNAVAILABLE");
 // Code only in POST body; `op=sender` is a non-secret route marker.
 const { data, error } = await supabase.functions.invoke("tenant-email-settings?op=sender", { method: "POST", body: f4RequestSchema.parse(input) });
 if (error) throw new Error("SMTP_UNAVAILABLE");
 return f4ResultSchema.parse(data);
}
export const tenantSmtpTransport: TenantSmtpTransport = {
 ...(TENANT_SMTP_F4_PHASE ? { sender: senderRequest } : {}),
 proof:async()=>{
  if(!TENANT_SMTP_PROOF_PHASE)throw new Error('SMTP_UNAVAILABLE');
  const {data,error}=await supabase.functions.invoke('tenant-email-settings?proof=pinning',{method:'POST',body:{mode:'runtime_proof'}});
  if(error)throw new Error('SMTP_UNAVAILABLE');
  const parsed=runtimeProofResultSchema.safeParse(data);if(!parsed.success)throw new Error('SMTP_INTERNAL');
  return parsed.data;
 },
 load: () => request("GET"), save: input => request("PUT", input),
 test:async input=>{
  const body=testRequestSchema.parse(input);
  const {data,error}=await supabase.functions.invoke("tenant-email-settings",{method:"POST",body});
  if(error)throw new Error("SMTP_UNAVAILABLE");
  return testResultSchema.parse(data);
 },
};
