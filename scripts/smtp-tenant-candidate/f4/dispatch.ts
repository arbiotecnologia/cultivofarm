import { z } from 'zod';
import { draftSchema } from '../_shared/contract.ts';
import type { ActorClient } from '../handler.ts';
import type { SmtpProbeDeps } from '../../../supabase/functions/_shared/comunicacao/smtp-provider-probe.ts';
import { f4ResultSchema, f4StatusSchema, mapRpcError, type F4Request, type F4Result } from './contract.ts';
import { generateCode, generateSalt, hashCode } from './challenge-code.ts';
import { sendChallenge, type ChallengeOutcome } from './sender-executor.ts';
const preparedSchema=z.object({version:z.number().int().positive(),recipient:z.string().email(),config:draftSchema,password:z.string().min(1).max(4096)}).strict();
type Send=typeof sendChallenge;
export async function dispatchF4(actor:string,client:ActorClient,service:ActorClient,input:F4Request,deps:SmtpProbeDeps,send:Send=sendChallenge):Promise<F4Result>{
 if(input.op==='status'){const r=await client.rpc('tenant_smtp_f4_status');if(r.error)return {code:mapRpcError(r.error)};return f4ResultSchema.parse({code:'F4_STATUS',status:f4StatusSchema.parse(r.data)});}
 if(input.op==='activation'){
  const r=await client.rpc('tenant_smtp_activation_set',{p_version:input.expected_version,p_active:false});
  if(r.error)return {code:mapRpcError(r.error)};
  return f4ResultSchema.parse({code:'F4_STATUS',status:f4StatusSchema.parse(r.data)});
 }
 if(input.op==='confirm'){
  // Code travels only in this POST body → RPC arg; never URL/query/log. Attempts persisted server-side.
  const r=await client.rpc('tenant_smtp_sender_challenge_confirm',{p_challenge:input.challenge_id,p_version:input.expected_version,p_code:input.code});
  if(r.error)return {code:mapRpcError(r.error)};
  return f4ResultSchema.parse(z.object({code:z.string(),attempts_left:z.number().optional()}).strict().parse(r.data));
 }
 const claim=await client.rpc('tenant_smtp_sender_challenge_claim',{p_version:input.expected_version,p_key:input.idempotency_key});
 if(claim.error)return {code:mapRpcError(claim.error)};
 const replay=z.object({replay:z.literal(true),challenge_id:z.string().uuid(),state:z.string(),version:z.number()}).strict().safeParse(claim.data);
 if(replay.success){
  // Replay never re-sends; maps persisted state only.
  const s=replay.data.state;return {code:s==='sent'||s==='verified'?'challenge_sent':s==='ambiguous'?'challenge_ambiguous':s==='failed'?'challenge_failed':'SMTP_BUSY'};
 }
 const claimed=z.object({replay:z.literal(false),challenge_id:z.string().uuid(),fence:z.string().uuid()}).strict().parse(claim.data);
 let code=generateCode(); const salt=generateSalt(); const hash=await hashCode(salt,claimed.challenge_id,code);
 const args={p_challenge:claimed.challenge_id,p_fence:claimed.fence,p_actor:actor};
 const prepared=await service.rpc('tenant_smtp_sender_challenge_prepare',{...args,p_salt:salt,p_hash:hash});
 if(prepared.error){code='';return {code:mapRpcError(prepared.error)==='SMTP_CONFLICT'?'SMTP_CONFLICT':'SMTP_INTERNAL'};}
 const job=preparedSchema.parse(prepared.data);
 let outcome:ChallengeOutcome;
 try{outcome=await send({recipient:job.recipient,code,env:{DELIVERY_ENABLED:false,EMAIL_ENABLED:false,WHATSAPP_ENABLED:false,INAPP_ENABLED:false,
  SMTP_HOST:job.config.host,SMTP_PORT:String(job.config.port),SMTP_USER:job.config.username,SMTP_PASSWORD:job.password,SMTP_FROM:job.config.from_email}},deps);}
 catch{outcome='challenge_ambiguous';}
 finally{job.password='';code='';}
 const finished=await service.rpc('tenant_smtp_sender_challenge_finish',{...args,p_code:outcome});
 if(finished.error)throw new Error('SMTP_INTERNAL'); // uncertain ledger: never retry transport
 return {code:outcome};
}
