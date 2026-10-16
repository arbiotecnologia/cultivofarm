import { openAuthenticatedSmtpSession, type SmtpProbeDeps, type ProbeConnection } from '../../_shared/comunicacao/smtp-provider-probe.ts';
import { NativeSmtpClient, NativeSmtpAdapterFailure } from '../../_shared/comunicacao/native-smtp-client.ts';
import type { WorkerEnv } from '../../_shared/comunicacao/adapters-types.ts';
import { laneJobSchema, laneSkipSchema, type LaneJob, type LaneOutcome } from './contract.ts';
export type LaneRpc={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>};
export type LaneSend=(job:LaneJob,deps:SmtpProbeDeps)=>Promise<LaneOutcome>;
export type LaneSummary={claimed:number;sent:number;failed:number;ambiguous:number;skipped:number;stopped:'empty'|'busy'|'quota'|'limit'|'claim_error'|'finish_error'};
// Same pinned transport + 15s deadline + post-DATA ambiguity as F2/F3/F4a. Recipient/text come only from the server claim.
export const sendLaneMessage:LaneSend=async(job,deps)=>{
 const env:WorkerEnv={DELIVERY_ENABLED:false,EMAIL_ENABLED:false,WHATSAPP_ENABLED:false,INAPP_ENABLED:false,
  SMTP_HOST:job.config.host,SMTP_PORT:String(job.config.port),SMTP_USER:job.config.username,SMTP_PASSWORD:job.password,SMTP_FROM:job.config.from_email};
 let socket:ProbeConnection|undefined; let dataMayHaveStarted=false; let expired=false; let timer:ReturnType<typeof setTimeout>|undefined;
 const run=async():Promise<LaneOutcome>=>{
  const session=await openAuthenticatedSmtpSession(env,{...deps,connectTls:async(host,port)=>{socket=await deps.connectTls(host,port);if(expired){socket.close();throw new Error('failed');}return socket;}});
  if(expired){session.connection.close();return 'failed';}
  dataMayHaveStarted=true;
  await new NativeSmtpClient(session.connection,3000).send({from:job.config.from_email,to:job.recipient,subject:job.subject,content:job.text});
  return 'sent';
 };
 try{return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;try{socket?.close();}catch{/* sanitized */}reject(new Error('timeout'));},15000);})]);}
 catch(error){
  if(error instanceof NativeSmtpAdapterFailure && error.certainty==='definitive' && error.code!=='email_smtp_protocol')return 'failed';
  return dataMayHaveStarted?'ambiguous':'failed';
 }finally{expired=true;if(timer!==undefined)clearTimeout(timer);try{socket?.close();}catch{/* no exception output */}}
};
// One job per claim; never retries a job; any finish error stops the run (uncertain ledger, no transport retry).
export async function runTenantLane(service:LaneRpc,worker:string,deps:SmtpProbeDeps,send:LaneSend=sendLaneMessage,max=5):Promise<LaneSummary>{
 const s:LaneSummary={claimed:0,sent:0,failed:0,ambiguous:0,skipped:0,stopped:'limit'};
 for(let i=0;i<max;i++){
  const c=await service.rpc('tenant_smtp_lane_claim',{p_worker:worker});
  if(c.error){s.stopped='claim_error';return s;}
  const skip=laneSkipSchema.safeParse(c.data);
  if(skip.success){
   if(skip.data===null){s.stopped='empty';return s;}
   if('busy' in skip.data){s.stopped='busy';return s;}
   if('quota' in skip.data){s.stopped='quota';return s;}
   s.skipped++;continue;
  }
  const parsed=laneJobSchema.safeParse(c.data);
  if(!parsed.success){s.stopped='claim_error';return s;} // forged/unknown shape: no IO; lease expiry makes it terminal
  const job=parsed.data; s.claimed++;
  let outcome:LaneOutcome;
  try{outcome=await send(job,deps);}catch{outcome='ambiguous';}
  finally{job.password='';}
  const f=await service.rpc('tenant_smtp_lane_finish',{p_outbox:job.outbox_id,p_fence:job.fence,p_outcome:outcome});
  if(f.error){s.stopped='finish_error';return s;}
  s[outcome]++;
 }
 return s;
}
