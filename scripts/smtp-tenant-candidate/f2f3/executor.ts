import { openAuthenticatedSmtpSession, type SmtpProbeDeps } from '../../../supabase/functions/_shared/comunicacao/smtp-provider-probe.ts';
import { NativeSmtpClient, NativeSmtpAdapterFailure } from '../../../supabase/functions/_shared/comunicacao/native-smtp-client.ts';
import type { WorkerEnv } from '../../../supabase/functions/_shared/comunicacao/adapters-types.ts';
import { testResultSchema, type TestResult } from './contract.ts';
// Only receives a single server-authorized job from the service-only executor RPC.
export async function executeTest(job: {mode:'connection'|'send'; version:number; recipient:string; env:WorkerEnv}, deps:SmtpProbeDeps): Promise<TestResult> {
  let connection: Awaited<ReturnType<typeof openAuthenticatedSmtpSession>> | undefined;
  let socket: import('../../../supabase/functions/_shared/comunicacao/smtp-provider-probe.ts').ProbeConnection | undefined;
  let dataMayHaveStarted=false;
  let expired=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let code:TestResult['code']='smtp_test_failed';
  const run=async ():Promise<TestResult['code']>=>{
    connection=await openAuthenticatedSmtpSession(job.env,{
      ...deps, connectTls:async(host,port)=>{
        socket=await deps.connectTls(host,port);
        if(expired){socket.close();throw new Error('smtp_test_failed');}
        return socket;
      },
    });
    if(expired){connection.connection.close();return 'smtp_test_failed';}
    if(job.mode==='connection')return 'smtp_connection_ok';
    dataMayHaveStarted=true; // conservative: any send uncertainty requires review
    const client=new NativeSmtpClient(connection.connection,3000);
    await client.send({from:job.env.SMTP_FROM ?? '',to:job.recipient,subject:'Teste controlado SMTP — Cultivo Farm',content:'Teste solicitado pelo administrador. Aceite SMTP não comprova entrega na caixa postal.'});
    return 'smtp_send_accepted';
  };
  try {
    code=await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;try{socket?.close();}catch{/* sanitized */}reject(new Error('timeout'));},15000);})]);
  } catch(error) {
    if(error instanceof NativeSmtpAdapterFailure && error.certainty==='definitive' && error.code!=='email_smtp_protocol')code='smtp_test_failed';
    else code=dataMayHaveStarted ? 'smtp_send_ambiguous':'smtp_test_failed';
  } finally { expired=true; if(timer!==undefined)clearTimeout(timer); try{socket?.close();}catch{ /* no exception output */ } }
  return testResultSchema.parse({mode:job.mode,version:job.version,code,dispatch_enabled:false,sender_verified:false});
}
