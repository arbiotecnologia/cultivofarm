import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Apply actual review diff in memory; never edits/deploys the Edge entrypoint.
function proposedSource() {
 const original=readFileSync('supabase/functions/create-user/index.ts','utf8').split('\n');
 const patch=readFileSync('scripts/rbac-audit/proposed-create-user-external-ab.patch','utf8').split('\n');
 const output:string[]=[];let index=0;
 for(let i=2;i<patch.length;i++) {
  const line=patch[i];const h=line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
  if(h){const start=Number(h[1])-1;output.push(...original.slice(index,start));index=start;continue;}
  if(line.startsWith('-')||line.startsWith(' ')){if(original[index]!==line.slice(1))throw new Error('proposal drift');if(line[0]===' ')output.push(original[index]);index++;}
  else if(line.startsWith('+'))output.push(line.slice(1));
 }
 output.push(...original.slice(index));return output.join('\n').replace(/^import .*createClient.*;\s*/m,'');
}
async function invoke(role:string, extra:Record<string,unknown>={},open=false, retry=false, owned=true, lookupMode='ok') {
 let source=proposedSource();if(open)source=source.replace('B2B_PROVISIONING_CHANNELS_REVIEWED = false','B2B_PROVISIONING_CHANNELS_REVIEWED = true');
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:name==='has_role'?true:name==='b2b_provisioning_preflight'?{organization_id:'org',partner_id:args.p_partner,role:args.p_role,papel:args.p_papel}:{claim_id:'claim',fence:'fence',user_id:'reserved',organization_id:'org',status:'claimed',acquired:!retry,lease_valid:!retry},error:null}));
 const createUser=vi.fn(async()=>({data:{user:{id:'reserved'}},error:null}));const finish=vi.fn(async()=>({data:{success:true},error:null}));
 const actor={rpc,auth:{getClaims:async()=>({data:{claims:{sub:'admin',role:'authenticated',iat:1792093500}},error:null})}};
 const getUserById=vi.fn(async()=>{
  if(lookupMode==='throw')throw new Error('timeout');
  return {data:{user:owned?{id:'reserved',email:'test@example.invalid',app_metadata:{b2b_provisioning_receipt:lookupMode==='foreign'?'unrelated':'claim'}}:null},error:lookupMode==='error'?{status:503}:null};
 });
 const server={rpc:finish,auth:{admin:{createUser,getUserById}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{organization_id:'org',ativo:true},error:null})})})})};
 let handler:((req:Request)=>Promise<Response>)|undefined;
 new Function('Deno','createClient',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)({env:{get:(name:string)=>name==='SUPABASE_URL'?'https://swzpzcwiasxmjutrmvkm.supabase.co':'mock'},serve:(fn:typeof handler)=>{handler=fn;}},(_u:unknown,_k:unknown,opts:unknown)=>opts?actor:server);
 if(!handler)throw new Error('missing handler');
 const response=await handler(new Request('https://isolated.invalid',{method:'POST',headers:{Authorization:'Bearer mock','Content-Type':'application/json'},body:JSON.stringify({role,nome:'Test',email:'test@example.invalid',idempotency_key:'55555555-5555-4555-8555-555555555555',...extra})}));
 return {response,rpc,createUser,finish,getUserById};
}
const client='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const partner='11111111-1111-4111-8111-111111111111';
describe('external user review diff — SDK/Auth mocked, no deploy',()=>{
 it.each(['cliente_produtor','parceiro_b2b'])('gate remains closed %s',async(role)=>{const r=await invoke(role,role==='cliente_produtor'?{cliente_ids:[client]}:{partner_id:partner});expect(r.response.status).toBe(503);expect(r.createUser).not.toHaveBeenCalled();});
 it.each(['cliente_produtor','parceiro_b2b'])('isolated explicit role %s uses claim and finish',async(role)=>{const r=await invoke(role,role==='cliente_produtor'?{cliente_ids:[client]}:{partner_id:partner},true);expect(r.response.status).toBe(200);expect(r.rpc).toHaveBeenCalledWith('b2b_claim_provisioning',expect.objectContaining({p_role:role,p_clients:role==='cliente_produtor'?[client]:[],p_primary:role==='cliente_produtor'?client:null}));expect(r.createUser).toHaveBeenCalledOnce();expect(r.finish).toHaveBeenCalledOnce();});
 it('technical remains denied even with open flag',async()=>{const r=await invoke('parceiro_b2b_tecnico',{partner_id:partner},true);expect(r.response.status).toBe(403);expect(r.createUser).not.toHaveBeenCalled();});
 it('expired occupied receipt reconciles exact own Auth, never creates another',async()=>{const r=await invoke('parceiro_b2b',{partner_id:partner},true,true);expect(r.response.status).toBe(200);expect(r.createUser).not.toHaveBeenCalled();expect(r.finish).toHaveBeenCalledOnce();});
 it('missing own UUID cannot adopt email or create Auth',async()=>{const r=await invoke('parceiro_b2b',{partner_id:partner},true,true,false);expect(r.response.status).toBe(409);expect(r.createUser).not.toHaveBeenCalled();expect(r.finish).not.toHaveBeenCalled();});
 it.each(['ok','error','throw'])('pre-Auth crash/uncertain lookup %s stays pending on same request',async(mode)=>{
  const r=await invoke('parceiro_b2b',{partner_id:partner},true,true,false,mode);
  expect(r.response.status).toBe(409);
  expect(await r.response.json()).toMatchObject({error:'b2b_provisioning_auth_pending',status:'pending',recovery_required:true,retry_same_request:true});
  expect(r.getUserById).toHaveBeenCalledExactlyOnceWith('reserved');
  expect(r.createUser).not.toHaveBeenCalled();expect(r.finish).not.toHaveBeenCalled();
 });
 it('pending retry after original worker creates exact UUID reconciles without duplicate',async()=>{
  const a=await invoke('parceiro_b2b',{partner_id:partner},true,true,false);
  const b=await invoke('parceiro_b2b',{partner_id:partner},true,true,true);
  expect(a.response.status).toBe(409);expect(b.response.status).toBe(200);
  expect(a.createUser).not.toHaveBeenCalled();expect(b.createUser).not.toHaveBeenCalled();
  expect(b.finish).toHaveBeenCalledWith('b2b_finish_provisioning',{p_claim:'claim',p_fence:'fence',p_user:'reserved'});
 });
 it('unrelated receipt cannot reconcile',async()=>{const r=await invoke('parceiro_b2b',{partner_id:partner},true,true,true,'foreign');expect(r.response.status).toBe(409);expect(r.createUser).not.toHaveBeenCalled();expect(r.finish).not.toHaveBeenCalled();});
 it.each([{cliente_ids:[]},{cliente_ids:[client,client]},{cliente_ids:[client],roles:['cliente_produtor','gestor']},{cliente_ids:[client],partner_id:partner}])('rejects invalid/exclusive payload %j',async(payload)=>{const r=await invoke('cliente_produtor',payload,true);expect(r.response.status).toBe(403);expect(r.createUser).not.toHaveBeenCalled();});
});
