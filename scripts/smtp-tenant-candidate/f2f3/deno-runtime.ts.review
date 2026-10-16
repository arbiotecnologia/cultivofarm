// REVIEW ONLY. Install imports under existing tenant-email-settings after review.
// Deno API docs + upstream source permit connect(literal IP) -> startTls(original host).
// Hosted runtime equivalence MUST be proven by auditor before setting proven:true.
import { pinnedDeps, type PinnedRuntime } from './pinned-transport.ts';
export const TENANT_PINNING_PROVEN = false;
export const tenantRuntime: PinnedRuntime = {
 proven:TENANT_PINNING_PROVEN,
 resolve:async(host,family)=>{
  try {return await Deno.resolveDns(host,family);}
  catch(error){if(error instanceof Deno.errors.NotFound)return [];throw new Error('smtp_dns_blocked');}
 },
 tcp:(ip,port)=>Deno.connect({hostname:ip,port,transport:'tcp'}),
 tls:async(socket,hostname)=>{
  let connection:Deno.TlsConn|undefined;
  try{
   connection=await Deno.startTls(socket as Deno.TcpConn,{hostname});
   await connection.handshake(); // implicit TLS: no plaintext SMTP prior to handshake
   return connection;
  }catch(error){
   try{connection?.close();}catch{/* best effort */}
   const mismatch=error instanceof Error && /certificate.*(?:not valid for name|notvalidforname|name mismatch)/i.test(error.message);
   throw new Error(mismatch?'TLS_HOSTNAME_MISMATCH':'smtp_tls_failed');
  }
 },
};
export const tenantSmtpDeps = pinnedDeps(tenantRuntime);
