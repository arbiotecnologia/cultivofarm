import { z } from 'zod';
import { draftSchema } from '../_shared/contract.ts';
import { testResultSchema, type TestRequest, type TestResult } from './contract.ts';
import { executeTest } from './executor.ts';
import type { ActorClient } from '../handler.ts';
import type { SmtpProbeDeps } from '../../../supabase/functions/_shared/comunicacao/smtp-provider-probe.ts';
const preparedSchema=z.object({mode:z.enum(['connection','send']),version:z.number().int().positive(),recipient:z.string().email(),config:draftSchema,password:z.string().min(1).max(4096)}).strict();
export async function dispatchTest(actor:string,client:ActorClient,service:ActorClient,input:TestRequest,deps:SmtpProbeDeps):Promise<TestResult> {
 const claim=await client.rpc('tenant_smtp_test_claim',{p_mode:input.mode,p_version:input.expected_version,p_key:input.idempotency_key,p_confirm:input.confirm_send===true});
 if(claim.error){
  const code=['SMTP_FORBIDDEN','SMTP_CONFLICT','SMTP_COOLDOWN','SMTP_BUSY','SMTP_NOT_READY','SMTP_UNAVAILABLE','SMTP_INVALID'].includes(claim.error.message ?? '') ? claim.error.message : 'SMTP_INTERNAL';
  return testResultSchema.parse({code,version:input.expected_version,mode:input.mode,dispatch_enabled:false,sender_verified:false});
 }
 const replay=z.object({replay:z.literal(true),...testResultSchema.shape}).strict().safeParse(claim.data);
 if(replay.success){const {replay:ignored,...result}=replay.data;return testResultSchema.parse(result);}
 const claimed=z.object({replay:z.literal(false),job_id:z.string().uuid(),fence:z.string().uuid()}).strict().parse(claim.data);
 const args={p_job:claimed.job_id,p_fence:claimed.fence,p_actor:actor};
 const prepared=await service.rpc('tenant_smtp_test_prepare',args);if(prepared.error)throw new Error('SMTP_INTERNAL');
 const job=preparedSchema.parse(prepared.data);
 // No cache/global runtime/fallback. Secret only in invocation memory.
 const result=await executeTest({mode:job.mode,version:job.version,recipient:job.recipient,env:{
  DELIVERY_ENABLED:false,EMAIL_ENABLED:false,WHATSAPP_ENABLED:false,INAPP_ENABLED:false,
  SMTP_HOST:job.config.host,SMTP_PORT:String(job.config.port),SMTP_USER:job.config.username,SMTP_PASSWORD:job.password,SMTP_FROM:job.config.from_email,
 }},deps);
 job.password='';
 const finished=await service.rpc('tenant_smtp_test_finish',{...args,p_code:result.code});
 if(finished.error)throw new Error('SMTP_INTERNAL'); // uncertain ledger: never retry transport
 return testResultSchema.parse(finished.data);
}
