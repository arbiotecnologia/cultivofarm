import {afterEach,describe,it,expect,vi} from "vitest";
import {draftSchema,EMPTY_VIEW,saveSchema,draftHostAllowed} from "../../../scripts/smtp-tenant-candidate/_shared/contract";
import {createTenantSmtpHandler, type ActorClient} from "../../../scripts/smtp-tenant-candidate/handler";
import {TENANT_SMTP_REVIEWED,tenantSmtpTransport} from "@/lib/configuracoes/tenantSmtp";
import {supabase} from "@/integrations/supabase/client";
afterEach(()=>vi.restoreAllMocks());
const config={host:"smtp.provider.com",port:465,tls_mode:"implicit_tls",username:"user",from_email:"sender@provider.com",reply_to:"",from_name:"Cultivo Farm"};
const password="test-only-secret-sentinel";
async function run(options:{scope?:boolean;scopeError?:boolean;jwt?:boolean;reviewed?:boolean;url?:string;rpcError?:string;badView?:boolean;method?:string;body?:unknown}={}) {
 const rpc=vi.fn(async(name:string)=>name==="tenant_email_settings_scope" ? {data:options.scope ?? true,error:options.scopeError ? {message:password} : null} : {data:options.badView ? {...EMPTY_VIEW,password} : {...EMPTY_VIEW,version:1,config,credential_configured:true},error:options.rpcError ? {code:options.rpcError,message:password} : null});
 const client:ActorClient={rpc,auth:{getUser:async()=>({data:{user:options.jwt===false ? null : {id:"mock-actor"}},error:null})}};
 const factory=vi.fn(()=>client);
 const handler=createTenantSmtpHandler({canonicalUrl:options.url ?? "https://swzpzcwiasxmjutrmvkm.supabase.co",reviewed:options.reviewed ?? true,client:factory,trustedOrigin:o=>o==="https://app.cultivofarm.com.br",cors:()=>({})});
 const method=options.method ?? "PUT";
 const res=await handler(new Request("https://local.invalid",{method,headers:{Authorization:"Bearer mock-jwt"},...(method==="GET" ? {} : {body:JSON.stringify(options.body ?? {expected_version:0,config,password})})}));
 const body=await res.json();expect(JSON.stringify(body)).not.toContain(password);
 return {res,body,rpc,factory};
}
describe("SMTP-T1 contract and real candidate handler — mocked actor RPC, zero network",()=>{
 it.each(["smtp.provider.com","mail.other-provider.net"])("multiprovider %s accepted as unverified draft",host=>expect(draftSchema.safeParse({...config,host}).success).toBe(true));
 it.each(["localhost","127.0.0.1","2130706433","0x7f000001","[::1]","smtp.local","metadata.google.internal","metadata","http://smtp.provider.com","smtp.provider.com\r\nQUIT","smtp.provider.com.","user@smtp.provider.com","smtp.internal"])("unsafe/ambiguous host %s rejected",host=>expect(draftHostAllowed(host)).toBe(false));
 it.each(["plaintext","oauth","api"])("unhomologated transport %s rejected",tls_mode=>expect(draftSchema.safeParse({...config,tls_mode}).success).toBe(false));
 it.each([0,25,65536,465.5])("port %s rejected",port=>expect(draftSchema.safeParse({...config,port}).success).toBe(false));
 it.each(["username","from_name","from_email","reply_to"])("header/command injection in %s rejected",key=>expect(draftSchema.safeParse({...config,[key]:"a\r\nAUTH bad"}).success).toBe(false));
 it("only draft save RPC uses caller client, no worker or service key",async()=>{const r=await run();expect(r.res.status).toBe(200);expect(r.rpc.mock.calls.map(c=>c[0])).toEqual(["tenant_email_settings_scope","tenant_email_settings_save"]);expect(r.body.dispatch_enabled).toBe(false);expect(r.body.sender_verified).toBe(false);});
 it("GET never passes a credential",async()=>{const r=await run({method:"GET"});expect(r.res.status).toBe(200);expect(r.rpc).toHaveBeenLastCalledWith("tenant_email_settings_get",undefined);});
 it("credential remains optional only for server-validated existing draft",()=>expect(saveSchema.safeParse({expected_version:1,config}).success).toBe(true));
 it.each(["financeiro","gestor","B2B","produtor","superadmin","inativo","provisório","tenant ausente"])("denied server scope %s stops mutation",async()=>{const r=await run({scope:false});expect(r.res.status).toBe(403);expect(r.rpc).toHaveBeenCalledTimes(1);});
 it("JWT validation fails before RPC",async()=>{const r=await run({jwt:false});expect(r.res.status).toBe(401);expect(r.rpc).not.toHaveBeenCalled();});
 it("scope RPC error fails closed",async()=>{const r=await run({scopeError:true});expect(r.res.status).toBe(500);expect(r.rpc).toHaveBeenCalledTimes(1);});
 it.each(["40001","42501","22023","P0001"])("safe error mapping %s",async rpcError=>{const r=await run({rpcError});expect(r.res.status).toBe(({"40001":409,"42501":403,"22023":400,"P0001":500})[rpcError]);});
 it("unexpected credential in RPC response is rejected",async()=>expect((await run({badView:true})).res.status).toBe(500));
 it("forged tenant rejected, no save",async()=>{const r=await run({body:{expected_version:0,config,password,organization_id:"forged"}});expect(r.res.status).toBe(400);expect(r.rpc).toHaveBeenCalledTimes(1);});
 it("oversized body stops before save",async()=>{const r=await run({body:{expected_version:0,config,password:"a".repeat(40000)}});expect(r.res.status).toBe(400);expect(r.rpc).toHaveBeenCalledTimes(1);});
 it.each([{reviewed:false},{url:"https://invalid.invalid"}])("closed installation gate %j",async options=>{const r=await run(options);expect(r.res.status).toBe(503);expect(r.factory).not.toHaveBeenCalled();});
 it("production draft transport is enabled and invokes only existing GET/PUT endpoint",async()=>{
  const invoke=vi.spyOn(supabase.functions,"invoke").mockResolvedValue({data:EMPTY_VIEW,error:null});
  expect(TENANT_SMTP_REVIEWED).toBe(true);await expect(tenantSmtpTransport.load()).resolves.toEqual(EMPTY_VIEW);
  await expect(tenantSmtpTransport.save({expected_version:0,config,password})).resolves.toEqual(EMPTY_VIEW);
  expect(invoke.mock.calls).toEqual([["tenant-email-settings",{method:"GET",body:undefined}],["tenant-email-settings",{method:"PUT",body:{expected_version:0,config,password}}]]);
 });
 it.each([401,403,409,400,500])("enabled production transport keeps safe failure %s and no retry",async status=>{
  const invoke=vi.spyOn(supabase.functions,"invoke").mockResolvedValue({data:null,error:{context:{status},message:password}} as never);
  await expect(tenantSmtpTransport.save({expected_version:0,config,password})).rejects.toThrow(({401:"SMTP_UNAUTHORIZED",403:"SMTP_FORBIDDEN",409:"SMTP_CONFLICT",400:"SMTP_INVALID",500:"SMTP_INTERNAL"})[status]);expect(invoke).toHaveBeenCalledOnce();
 });
 it("draft still accepts 587 as metadata without proving runtime support",()=>expect(draftSchema.safeParse({...config,port:587}).success).toBe(true));
 it("CAS and credential reach only caller save; metadata response is no-store",async()=>{
  const r=await run({body:{expected_version:7,config,password}});
  expect(r.rpc).toHaveBeenLastCalledWith("tenant_email_settings_save",{p_expected_version:7,p_config:config,p_password:password});
  expect(r.res.headers.get("Cache-Control")).toBe("no-store");expect(Object.keys(r.body).sort()).toEqual(["ok","version","config","credential_configured","state","sender_verified","dispatch_enabled"].sort());
 });
 it("raw thrown failure becomes only safe code without application logging",async()=>{
  const logs=[vi.spyOn(console,"log"),vi.spyOn(console,"error"),vi.spyOn(console,"warn"),vi.spyOn(console,"info")];
  try{
   const handler=createTenantSmtpHandler({canonicalUrl:"https://swzpzcwiasxmjutrmvkm.supabase.co",reviewed:true,client:()=>{throw new Error(password);},trustedOrigin:()=>true,cors:()=>({})});
   const res=await handler(new Request("https://local.invalid",{headers:{Authorization:"Bearer mock-jwt"}}));
   expect(res.status).toBe(500);expect(await res.json()).toEqual({code:"SMTP_INTERNAL"});for(const log of logs)expect(log).not.toHaveBeenCalled();
  }finally{for(const log of logs)log.mockRestore();}
 });
});
