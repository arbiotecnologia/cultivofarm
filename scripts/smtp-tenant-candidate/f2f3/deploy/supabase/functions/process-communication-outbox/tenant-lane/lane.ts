import { openAuthenticatedSmtpSession, type SmtpProbeDeps, type ProbeConnection } from '../../_shared/comunicacao/smtp-provider-probe.ts';
import { NativeSmtpClient, NativeSmtpAdapterFailure } from '../../_shared/comunicacao/native-smtp-client.ts';
import type { WorkerEnv } from '../../_shared/comunicacao/adapters-types.ts';
import { laneJobSchema, laneFinishSchema, laneAuthorizeSchema, type LaneJob, type LaneOutcome } from './contract.ts';
export type LaneRpc={rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>};
export type LaneAuthorize=()=>Promise<boolean>;
export type LaneSendResult=LaneOutcome|'withheld';
export type LaneSend=(job:LaneJob,deps:SmtpProbeDeps,authorize:LaneAuthorize)=>Promise<LaneSendResult>;
export type LaneSummary={claimed:number;sent:number;failed:number;ambiguous:number;withheld:number;lost:number;stopped:'empty'|'limit'|'budget'|'claim_error'|'finish_error'};
// Same pinned transport + 15s deadline + post-DATA ambiguity as F2/F3/F4a. Recipient/text come only from the server claim.
// Server authorization happens AFTER AUTH and BEFORE MAIL FROM; refusal closes the session without any envelope.
export const sendLaneMessage:LaneSend=async(job,deps,authorize)=>{
 const env:WorkerEnv={DELIVERY_ENABLED:false,EMAIL_ENABLED:false,WHATSAPP_ENABLED:false,INAPP_ENABLED:false,
  SMTP_HOST:job.config.host,SMTP_PORT:String(job.config.port),SMTP_USER:job.config.username,SMTP_PASSWORD:job.password,SMTP_FROM:job.config.from_email};
 let socket:ProbeConnection|undefined; let dataMayHaveStarted=false; let expired=false; let timer:ReturnType<typeof setTimeout>|undefined;
 const run=async():Promise<LaneSendResult>=>{
  const session=await openAuthenticatedSmtpSession(env,{...deps,connectTls:async(host,port)=>{socket=await deps.connectTls(host,port);if(expired){socket.close();throw new Error('failed');}return socket;}});
  if(expired){session.connection.close();return 'failed';}
  let allowed=false; try{allowed=await authorize();}catch{allowed=false;}
  if(!allowed || expired){try{session.connection.close();}catch{/* best effort */}return 'withheld';}
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
// Run bounds aligned with the invoker HTTP timeout (55s): at most LANE_MAX_JOBS x 15s transport deadline, and no new
// claim when less than one full transport deadline (+1s margin) remains in LANE_BUDGET_MS.
export const LANE_MAX_JOBS=3; export const LANE_BUDGET_MS=50000; export const LANE_JOB_DEADLINE_MS=15000;
// One job per claim; never retries a job. Busy/over-quota tenants are skipped server-side (fairness).
// Any finish error stops the run (uncertain ledger, no transport retry). 'withheld' needs no finish: the server already cancelled.
export async function runTenantLane(service:LaneRpc,worker:string,deps:SmtpProbeDeps,send:LaneSend=sendLaneMessage,max=LANE_MAX_JOBS,clock:()=>number=Date.now,budgetMs=LANE_BUDGET_MS):Promise<LaneSummary>{
 const s:LaneSummary={claimed:0,sent:0,failed:0,ambiguous:0,withheld:0,lost:0,stopped:'limit'};
 const start=clock();
 for(let i=0;i<Math.min(max,LANE_MAX_JOBS);i++){
  if(clock()-start>budgetMs-LANE_JOB_DEADLINE_MS-1000){s.stopped='budget';return s;}
  const c=await service.rpc('tenant_smtp_lane_claim',{p_worker:worker});
  if(c.error){s.stopped='claim_error';return s;}
  if(c.data===null){s.stopped='empty';return s;}
  const parsed=laneJobSchema.safeParse(c.data);
  if(!parsed.success){s.stopped='claim_error';return s;} // forged/unknown shape: no IO; lease expiry reconciles it before-auth
  const job=parsed.data; s.claimed++;
  const authorize:LaneAuthorize=async()=>{
   const a=await service.rpc('tenant_smtp_lane_authorize',{p_outbox:job.outbox_id,p_fence:job.fence});
   if(a.error)return false;
   const r=laneAuthorizeSchema.safeParse(a.data); return r.success && r.data.ok===true;
  };
  let outcome:LaneSendResult;
  try{outcome=await send(job,deps,authorize);}catch{outcome='ambiguous';}
  finally{job.password='';}
  if(outcome==='withheld'){s.withheld++;continue;}
  const f=await service.rpc('tenant_smtp_lane_finish',{p_outbox:job.outbox_id,p_fence:job.fence,p_outcome:outcome});
  if(f.error){s.stopped='finish_error';return s;}
  const fin=laneFinishSchema.safeParse(f.data);
  if(!fin.success){s.stopped='finish_error';return s;}
  if(fin.data.state===outcome && !fin.data.lost)s[outcome]++; else s.lost++;
 }
 return s;
}
