// REVIEW ONLY: complete existing Edge, do not auto-deploy.
import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { createTenantSmtpHandler } from "./handler.ts";
import { createTestHandler } from "./f2f3/handler.ts";
import { createHostedProofHandler } from "./f2f3/hosted-proof.ts";
import { dispatchTest } from "./f2f3/dispatch.ts";
import { tenantRuntime, tenantSmtpDeps, TENANT_PINNING_PROVEN } from "./f2f3/deno-runtime.ts";
import { corsHeadersFor, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";
const url=Deno.env.get("SUPABASE_URL") ?? "";
const anon=Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const client=(authorization:string)=>createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
const common={canonicalUrl:url,client,trustedOrigin:isTrustedOrigin,cors:corsHeadersFor};
const draftHandler=createTenantSmtpHandler({...common,reviewed:true});
const testHandler=createTestHandler({...common,reviewed:true,transportProven:TENANT_PINNING_PROVEN,
 execute:(actor,actorClient,input)=>dispatchTest(actor,actorClient,createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",{auth:{persistSession:false,autoRefreshToken:false}}),input,tenantSmtpDeps),
});
// Temporary, independently restricted proof; never changes runtime flag or any settings.
export const HOSTED_PROOF_ENABLED=true;
const proofHandler=createHostedProofHandler({...common,enabled:HOSTED_PROOF_ENABLED,runtime:tenantRuntime});
Deno.serve(req=>req.method==="POST" && new URL(req.url).searchParams.has("proof")?proofHandler(req):req.method==="POST"?testHandler(req):draftHandler(req));
