import { openAuthenticatedSmtpSession, type SmtpProbeDeps, type ProbeConnection } from '../../_shared/comunicacao/smtp-provider-probe.ts';
import { NativeSmtpClient, NativeSmtpAdapterFailure } from '../../_shared/comunicacao/native-smtp-client.ts';
import type { WorkerEnv } from '../../_shared/comunicacao/adapters-types.ts';
export type ChallengeOutcome='challenge_sent'|'challenge_ambiguous'|'challenge_failed';
// Same pinned transport + deadline/ambiguity semantics as F2/F3 executeTest. Recipient = configured sender.
export async function sendChallenge(job:{recipient:string;code:string;env:WorkerEnv},deps:SmtpProbeDeps):Promise<ChallengeOutcome>{
 let socket:ProbeConnection|undefined; let dataMayHaveStarted=false; let expired=false; let timer:ReturnType<typeof setTimeout>|undefined;
 const run=async():Promise<ChallengeOutcome>=>{
  const session=await openAuthenticatedSmtpSession(job.env,{...deps,connectTls:async(host,port)=>{socket=await deps.connectTls(host,port);if(expired){socket.close();throw new Error('challenge_failed');}return socket;}});
  if(expired){session.connection.close();return 'challenge_failed';}
  dataMayHaveStarted=true;
  await new NativeSmtpClient(session.connection,3000).send({from:job.env.SMTP_FROM ?? '',to:job.recipient,subject:'Código de verificação do remetente — Cultivo Farm',
   content:`Código de verificação: ${job.code}\nVálido por 15 minutos. Digite-o somente no painel da sua empresa. Não compartilhe.`});
  return 'challenge_sent';
 };
 try{return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;try{socket?.close();}catch{/* sanitized */}reject(new Error('timeout'));},15000);})]);}
 catch(error){
  if(error instanceof NativeSmtpAdapterFailure && error.certainty==='definitive' && error.code!=='email_smtp_protocol')return 'challenge_failed';
  return dataMayHaveStarted?'challenge_ambiguous':'challenge_failed';
 }finally{expired=true;if(timer!==undefined)clearTimeout(timer);try{socket?.close();}catch{/* no exception output */}}
}
