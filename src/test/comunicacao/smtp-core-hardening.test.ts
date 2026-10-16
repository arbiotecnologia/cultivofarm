import {describe,it,expect,vi} from 'vitest';
import {readSmtpResponse,writeSmtpCommand,openAuthenticatedSmtpSession,type ProbeConnection} from '../../../supabase/functions/_shared/comunicacao/smtp-provider-probe';
import {NativeSmtpClient} from '../../../supabase/functions/_shared/comunicacao/native-smtp-client';
import {publicAddress,parseIpv6,pinnedDeps} from '../../../scripts/smtp-tenant-candidate/f2f3/pinned-transport';
import {createHostedProofHandler} from '../../../scripts/smtp-tenant-candidate/f2f3/hosted-proof';
const socket=(chunks:string[]):ProbeConnection=>({read:async b=>{const s=chunks.shift();if(s===undefined)return null;const v=new TextEncoder().encode(s);b.set(v);return v.length;},write:async b=>b.length,close:vi.fn()});
describe('numeric IP parser and special ranges',()=>{
 it.each(['2804:10:8016::216:80','2001:4860:4860::8888','192.5.6.30','192.0.3.1','192.2.1.1','198.41.0.4','203.1.1.1','191.6.216.80'])('accepts actual public %s',ip=>expect(publicAddress(ip)).toBe(true));
 it('expands KingHost IPv6 exactly',()=>expect(parseIpv6('2804:10:8016::216:80')).toEqual([0x2804,0x10,0x8016,0,0,0,0x216,0x80]));
 it.each(['::ffff:191.6.216.80','::ffff:0:bf06:d850','::ffff:bf06:d850','64:ff9b::bf06:d850','64:ff9b:1::1','2001::1','2001:20::1','2002:bf06:d850::1','2001:db8::1','3fff::1','fc00::1','fe80::1','ff02::1','::','::1','1::2::3','2804:10:8016::216:80%eth0','2804:10:8016:::216:80','192.0.0.9','198.19.0.1','203.0.113.1'])('rejects special/malformed %s',ip=>expect(publicAddress(ip)).toBe(false));
 it('all compressed positions equal expanded address',()=>{
  const expanded='2804:0:0:0:0:0:0:1';
  for(const compressed of ['2804::1','2804:0::1','2804:0:0::1','2804:0:0:0::1','2804:0:0:0:0::1','2804:0:0:0:0:0::1'])expect(parseIpv6(compressed)).toEqual(parseIpv6(expanded));
 });
});
describe('complete SMTP responses and writes',()=>{
 it('250 O is incomplete until K CRLF arrives',async()=>{
  let release:((v:number)=>void)|undefined;let target:Uint8Array|undefined;let calls=0;
  const s=socket([]);s.read=async b=>{calls++;if(calls===1){b.set(new TextEncoder().encode('250 O'));return 5;}target=b;return new Promise(r=>{release=r;});};
  let resolved=false;const pending=readSmtpResponse(s,1000,'ehlo').then(r=>{resolved=true;return r;});
  await Promise.resolve();await Promise.resolve();expect(resolved).toBe(false);target?.set(new TextEncoder().encode('K\r\n'));release?.(3);
  expect(await pending).toEqual({status:250,lines:['250 OK']});
 });
 it('multiline partial final and preserved next response',async()=>{
  const s=socket(['250-first\r\n250 O','K\r\n235 authenticated\r\n']);
  expect((await readSmtpResponse(s,1000,'ehlo')).lines).toEqual(['250-first','250 OK']);
  expect((await readSmtpResponse(s,1000,'auth')).status).toBe(235);
 });
 it.each(['250-first\r\n550 done\r\n','250 OK','250 OK\n','junk\r\n','250-'+ 'x'.repeat(17000)+'\r\n'])('rejects invalid/incomplete response',async value=>{
  const chunks=value.match(/.{1,512}/gs) ?? [];await expect(readSmtpResponse(socket(chunks),1000,'ehlo')).rejects.toThrow();
 });
 it('line count limit 64',async()=>{await expect(readSmtpResponse(socket(Array(65).fill('250-more\r\n')),1000,'ehlo')).rejects.toThrow();});
 it('one response deadline is not renewed per chunk',async()=>{
  vi.useFakeTimers();try{const s=socket([]);s.read=()=>new Promise(r=>setTimeout(()=>r(1),60));
   const pending=expect(readSmtpResponse(s,100,'ehlo')).rejects.toThrow();await vi.advanceTimersByTimeAsync(101);await pending;expect(s.close).toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('core command writes every two-byte chunk without wrapper',async()=>{
  const s=socket([]);let actual='';s.write=async b=>{const n=Math.min(2,b.length);actual+=new TextDecoder().decode(b.subarray(0,n));return n;};
  await writeSmtpCommand(s,'EHLO cultivofarm.local',1000,'ehlo');expect(actual).toBe('EHLO cultivofarm.local\r\n');
 });
 it.each([0,-1,999,1.5])('invalid write count %s fails',async count=>{const s=socket([]);s.write=async()=>count;await expect(writeSmtpCommand(s,'EHLO',1000,'ehlo')).rejects.toThrow();});
 it('late partial write cannot continue after deadline',async()=>{
  vi.useFakeTimers();try{const s=socket([]);const write=vi.fn(async()=>{await new Promise(r=>setTimeout(r,200));return 2;});s.write=write;
   const pending=expect(writeSmtpCommand(s,'EHLO',100,'ehlo')).rejects.toThrow();await vi.advanceTimersByTimeAsync(101);await pending;await vi.advanceTimersByTimeAsync(100);expect(write).toHaveBeenCalledTimes(1);expect(s.close).toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('MIME body and terminator fully written without wrapper',async()=>{
  const s=socket(['250 sender\r\n','250 recipient\r\n','354 continue\r\n','250 accepted\r\n']);let actual='';s.write=async b=>{const n=Math.min(2,b.length);actual+=new TextDecoder().decode(b.subarray(0,n));return n;};
  await new NativeSmtpClient(s,1000).send({from:'from@fixture.test',to:'to@fixture.test',subject:'Test',content:'body'});
  expect(actual).toContain('MAIL FROM:<from@fixture.test>\r\nRCPT TO:<to@fixture.test>\r\nDATA\r\n');expect(actual.endsWith('\r\n.\r\n')).toBe(true);expect(actual).toContain('body');
 });
});
describe('unique opening deadline and late socket ownership',()=>{
 it('DNS 3s leaves only 1s for TCP/TLS, late TCP closed',async()=>{
  vi.useFakeTimers();try{
   const s=socket([]);const tls=vi.fn(async()=>s);
   const d=pinnedDeps({proven:true,resolve:async()=>{await new Promise(r=>setTimeout(r,3000));return ['191.6.216.80'];},tcp:async()=>{await new Promise(r=>setTimeout(r,2000));return s;},tls});
   const pending=expect(d.connectTls('smtpi.kinghost.net',465)).rejects.toThrow('smtp_tls_failed');await vi.advanceTimersByTimeAsync(4001);await pending;
   await vi.advanceTimersByTimeAsync(1000);expect(s.close).toHaveBeenCalled();expect(tls).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
 it('shared core closes socket arriving after step deadline',async()=>{
  vi.useFakeTimers();try{const s=socket([]);
   const pending=expect(openAuthenticatedSmtpSession({DELIVERY_ENABLED:false,EMAIL_ENABLED:false,WHATSAPP_ENABLED:false,INAPP_ENABLED:false,SMTP_HOST:'fixture.test',SMTP_PORT:'465',SMTP_USER:'synthetic',SMTP_PASSWORD:'synthetic',SMTP_FROM:'from@fixture.test'},{connectTls:async()=>{await new Promise(r=>setTimeout(r,6000));return s;},connect:vi.fn(),startTls:vi.fn()})).rejects.toThrow('smtp_connect_timeout');
   await vi.advanceTimersByTimeAsync(5001);await pending;await vi.advanceTimersByTimeAsync(1000);expect(s.close).toHaveBeenCalled();
  }finally{vi.useRealTimers();}
 });
});
describe('restricted credential-free hosted proof',()=>{
 const org='007bb519-cba0-4704-be2c-cb93ad010048';
 const make=(organization=org)=>{
  const s=socket([]);const runtime={proven:false,resolve:vi.fn(async(_h:string,f:string)=>f==='A'?['191.6.216.80']:['2804:10:8016::216:80']),tcp:vi.fn(async()=>s),tls:vi.fn(async(_s:ProbeConnection,h:string)=>{if(h==='smtp-name-mismatch.invalid')throw new Error('TLS_HOSTNAME_MISMATCH');return s;})};
  const rpc=vi.fn(async(_name:string)=>({data:{actor:'actor',organization,version:2},error:null}));
  const deps={canonicalUrl:'https://swzpzcwiasxmjutrmvkm.supabase.co',enabled:true,runtime,client:()=>({auth:{getUser:async()=>({data:{user:{id:'actor'}},error:null})},rpc}),trustedOrigin:()=>true,cors:()=>({})};return {deps,runtime,rpc,s};
 };
 const request=()=>new Request('https://fixture.test?proof=pinning',{method:'POST',headers:{Authorization:'Bearer synthetic'}});
 it('fixed A/AAAA TLS and mismatch, only context RPC/no SMTP writes',async()=>{
  const m=make();const response=await createHostedProofHandler(m.deps)(request());const body=await response.json();
  expect(body).toEqual({ok:true,code:'PINNING_PROOF_PASS',dns_validated:true,ipv4_tls:true,ipv6_tls:true,hostname_mismatch_rejected:true});expect(m.runtime.resolve.mock.calls.map(([h])=>h)).toEqual(['smtpi.kinghost.net','smtpi.kinghost.net']);expect(m.runtime.tcp).toHaveBeenCalledWith('2804:10:8016::216:80',465);expect(m.rpc.mock.calls.every(([name])=>name==='tenant_smtp_test_context')).toBe(true);
 });
 it('other tenant never resolves',async()=>{const m=make('other');expect((await createHostedProofHandler(m.deps)(request())).status).toBe(403);expect(m.runtime.resolve).not.toHaveBeenCalled();});
 it('no JWT never resolves',async()=>{const m=make();expect((await createHostedProofHandler(m.deps)(new Request('https://fixture.test?proof=pinning',{method:'POST'}))).status).toBe(401);expect(m.runtime.resolve).not.toHaveBeenCalled();});
 it('body with host is rejected before access',async()=>{const m=make();expect((await createHostedProofHandler(m.deps)(new Request('https://fixture.test?proof=pinning',{method:'POST',body:'{"host":"evil"}'}))).status).toBe(400);expect(m.runtime.resolve).not.toHaveBeenCalled();});
 it('mixed private AAAA blocks all TCP',async()=>{const m=make();m.runtime.resolve.mockImplementation(async(_h,f)=>f==='A'?['191.6.216.80']:['::1']);expect((await (await createHostedProofHandler(m.deps)(request())).json()).ok).toBe(false);expect(m.runtime.tcp).not.toHaveBeenCalled();});
 it('TLS network failure is not mismatch proof and never raw error',async()=>{const m=make();m.runtime.tls.mockImplementation(async()=>{throw new Error('PRIVATE raw failure');});const text=await (await createHostedProofHandler(m.deps)(request())).text();expect(text).not.toContain('PRIVATE');expect(JSON.parse(text).ok).toBe(false);});
 it('unexpected wrong hostname acceptance fails proof',async()=>{const m=make();m.runtime.tls.mockImplementation(async()=>m.s);expect((await (await createHostedProofHandler(m.deps)(request())).json()).code).toBe('PINNING_PROOF_FAILED');});
 it('proof cooldown and exclusive invocation',async()=>{const m=make();const handler=createHostedProofHandler(m.deps);await handler(request());expect((await handler(request())).status).toBe(429);expect(m.runtime.resolve).toHaveBeenCalledTimes(2);});
 it('proof never reads or writes SMTP',async()=>{const m=make();const read=vi.fn(),write=vi.fn();m.s.read=read;m.s.write=write;await createHostedProofHandler(m.deps)(request());expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();});
});