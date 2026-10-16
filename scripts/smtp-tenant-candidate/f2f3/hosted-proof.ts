import type { ActorClient } from '../handler.ts';
import { publicAddress, type PinnedRuntime } from './pinned-transport.ts';
import type { ProbeConnection } from '../../../supabase/functions/_shared/comunicacao/smtp-provider-probe.ts';
const AR_ORGANIZATION='007bb519-cba0-4704-be2c-cb93ad010048';
const FIXED_HOST='smtpi.kinghost.net';
const WRONG_HOST='smtp-name-mismatch.invalid';
export interface ProofDeps {
 canonicalUrl:string; enabled:boolean; runtime:PinnedRuntime;
 client(authorization:string):ActorClient;
 trustedOrigin(origin:string):boolean;cors(origin:string|null):Record<string,string>;
 now?:()=>number;
}
// Supplemental local cooldown is not distributed authority; SQL actor ACL always applies.
export function createHostedProofHandler(deps:ProofDeps){
 let busy=false;let nextAt=0;
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin');
  const reply=(status:number,code:string,flags:Record<string,boolean>={})=>new Response(JSON.stringify({ok:code==='PINNING_PROOF_PASS',code,...flags}),{status,headers:{...deps.cors(origin),'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(origin && !deps.trustedOrigin(origin))return reply(403,'SMTP_FORBIDDEN');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...deps.cors(origin),'Cache-Control':'no-store'}});
  const url=new URL(req.url);
  if(req.method!=='POST' || url.search!=='?proof=pinning' || req.body!==null)return reply(400,'SMTP_INVALID');
  if(!deps.enabled || deps.canonicalUrl!=='https://swzpzcwiasxmjutrmvkm.supabase.co')return reply(503,'SMTP_UNAVAILABLE');
  const authorization=req.headers.get('Authorization') ?? '';
  if(!/^Bearer [^\s]+$/.test(authorization))return reply(401,'SMTP_UNAUTHORIZED');
  const now=deps.now ?? Date.now;
  let ownsBusy=false;
  try{
   const actor=deps.client(authorization);const user=await actor.auth.getUser();
   if(user.error || !user.data.user)return reply(401,'SMTP_UNAUTHORIZED');
   const scope=await actor.rpc('tenant_smtp_test_context');
   if(scope.error)return reply(scope.error.code==='42501'?403:500,scope.error.code==='42501'?'SMTP_FORBIDDEN':'SMTP_INTERNAL');
   const context=scope.data as {actor?:unknown;organization?:unknown}|null;
   if(!context || context.actor!==user.data.user.id || context.organization!==AR_ORGANIZATION)return reply(403,'SMTP_FORBIDDEN');
   if(busy || now()<nextAt)return reply(429,'SMTP_COOLDOWN');
   busy=true;ownsBusy=true;nextAt=now()+60000;
   let expired=false;let timer:ReturnType<typeof setTimeout>|undefined;
   const sockets=new Set<ProbeConnection>();
   let dns_validated=false,ipv4_tls=false,ipv6_tls=false,hostname_mismatch_rejected=false;
   const close=()=>{for(const s of sockets){try{s.close();}catch{/* best effort */}}};
   const open=async(ip:string,hostname:string)=>{
    if(expired)throw new Error('PROOF_FAILED');
    const tcp=await deps.runtime.tcp(ip,465);sockets.add(tcp);
    if(expired){close();throw new Error('PROOF_FAILED');}
    const tls=await deps.runtime.tls(tcp,hostname);sockets.add(tls);
    if(expired){close();throw new Error('PROOF_FAILED');}
    tls.close();tcp.close();
   };
   const run=async()=>{
    const [a,aaaa]=await Promise.all([deps.runtime.resolve(FIXED_HOST,'A'),deps.runtime.resolve(FIXED_HOST,'AAAA')]);
    if(expired)throw new Error('PROOF_FAILED');
    const addresses=[...a,...aaaa];
    if(!a.length || !aaaa.length || addresses.length>8 || !addresses.every(publicAddress))throw new Error('PROOF_FAILED');
    dns_validated=true;
    for(const ip of a)await open(ip,FIXED_HOST);ipv4_tls=true;
    for(const ip of aaaa)await open(ip,FIXED_HOST);ipv6_tls=true;
    try{await open(a[0],WRONG_HOST);}catch(error){
     hostname_mismatch_rejected=error instanceof Error && error.message==='TLS_HOSTNAME_MISMATCH';
    }
    if(expired || !hostname_mismatch_rejected)throw new Error('PROOF_FAILED');
   };
   let code='PINNING_PROOF_FAILED';
   try{await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;close();reject(new Error('PROOF_FAILED'));},12000);})]);code='PINNING_PROOF_PASS';}
   catch{/* never raw error, AUTH, SMTP envelope or credential access */}
   finally{expired=true;close();if(timer!==undefined)clearTimeout(timer);busy=false;ownsBusy=false;}
   const after=await actor.rpc('tenant_smtp_test_context');
   if(after.error || JSON.stringify(after.data)!==JSON.stringify(scope.data))return reply(403,'SMTP_FORBIDDEN');
   return reply(200,code,{dns_validated,ipv4_tls,ipv6_tls,hostname_mismatch_rejected});
  }catch{if(ownsBusy)busy=false;return reply(500,'SMTP_INTERNAL');}
 };
}