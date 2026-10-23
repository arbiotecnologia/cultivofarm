import { handler } from "./index.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
const actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",partner="cccccccc-cccc-4ccc-8ccc-cccccccccccc",user="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const key="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const roles=["cliente_produtor","parceiro_b2b","parceiro_b2b_tecnico"];
const body={email:"synthetic@example.invalid",nome:"Synthetic",roles,partner_id:partner,cliente_ids:[key],principal_cliente_id:key,idempotency_key:key};
function fixture(options:{status?:string;finishError?:boolean;foreign?:boolean;malformed?:boolean}={}) {
 const calls:string[]=[];let count=0;
 const receipt={contract:"C2_MULTIPROFILE_V1",external_roles:roles,actor_id:actor,partner_id:partner,readers_ready:true,provisioning_ready:true,producer_links_valid:true,claim_id:key,fence:key,user_id:user,organization_id:tenant,status:options.status??"claimed",acquired:options.status!=="completed",lease_valid:true};
 const anon={auth:{getClaims:()=>({data:{claims:{sub:actor,role:"authenticated",iat:1}},error:null})},rpc:(name:string,args:unknown)=>{
  calls.push(name);
  if(name==="has_role")return {data:true,error:null};
  assertEquals((args as {p_roles:string[]}).p_roles,roles);
  return {data:{...receipt,...(options.malformed?{actor_id:user}:{})},error:null};
 }};
 const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:()=>({data:{organization_id:tenant,ativo:true},error:null})})})}),
  rpc:(name:string)=>{calls.push(name);return name==="b2b_finish_provisioning"?{data:options.finishError?null:{success:true},error:options.finishError?{code:"synthetic"}:null}:name==="b2b_prepare_provisioning_compensation"?{data:"compensating",error:null}:{data:true,error:null}},
  auth:{admin:{createUser:()=>{calls.push("create");return {data:{user:{id:user}},error:null}},getUserById:()=>{calls.push("lookup");return {data:{user:{id:user,email:body.email,app_metadata:{b2b_provisioning_receipt:options.foreign?user:key}}},error:null}},deleteUser:()=>{calls.push("delete");return {error:null}}}}
 };
 const factory=(()=>count++===0?anon:admin) as unknown as Parameters<typeof handler>[1];
 return {calls,factory};
}
function env(){Deno.env.set("SUPABASE_URL","https://swzpzcwiasxmjutrmvkm.supabase.co");Deno.env.set("SUPABASE_ANON_KEY","synthetic");Deno.env.set("SUPABASE_SERVICE_ROLE_KEY","synthetic");}
function request(value:unknown=body){return new Request("http://localhost/",{method:"POST",headers:{Authorization:"Bearer synthetic","Content-Type":"application/json"},body:JSON.stringify(value)})}
Deno.test("cumulative receipt uses exactly one Auth create",async()=>{env();const f=fixture();const r=await handler(request(),f.factory);assertEquals(r.status,200);assertEquals(f.calls.filter(c=>c==="create").length,1);assertEquals(f.calls.includes("delete"),false)});
Deno.test("explicit external_roles alias matches canonical cumulative payload",async()=>{env();const f=fixture();const r=await handler(request({...body,external_roles:roles}),f.factory);assertEquals(r.status,200);assertEquals(f.calls.filter(c=>c==="create").length,1)});
Deno.test("contradictory external_roles fails before claim and Auth",async()=>{env();const f=fixture();const r=await handler(request({...body,external_roles:["gestor"]}),f.factory);assertEquals(r.status,403);assertEquals(f.calls.includes("b2b_claim_provisioning"),false);assertEquals(f.calls.includes("create"),false)});
Deno.test("duplicate external_roles fails before claim",async()=>{env();const f=fixture();const r=await handler(request({...body,external_roles:[roles[0],roles[0],roles[2]]}),f.factory);assertEquals(r.status,403);assertEquals(f.calls.includes("b2b_claim_provisioning"),false)});
Deno.test("completed replay never recreates Auth",async()=>{env();const f=fixture({status:"completed"});const r=await handler(request(),f.factory);assertEquals(r.status,200);assertEquals(f.calls.includes("create"),false)});
Deno.test("mismatched claim stops before Auth",async()=>{env();const f=fixture({malformed:true});const r=await handler(request(),f.factory);assertEquals(r.status,409);assertEquals(f.calls.includes("create"),false)});
Deno.test("failure compensates exact owned receipt only",async()=>{env();const f=fixture({finishError:true});await handler(request(),f.factory);assertEquals(f.calls.includes("delete"),true);assertEquals(f.calls.includes("b2b_complete_provisioning_compensation"),true)});
Deno.test("foreign metadata never deleted during compensation",async()=>{env();const f=fixture({finishError:true,foreign:true});await handler(request(),f.factory);assertEquals(f.calls.includes("delete"),false)});
Deno.test("forged tenant rejected before claim",async()=>{env();const f=fixture();const r=await handler(request({...body,tenant_id:tenant}),f.factory);assertEquals(r.status,403);assertEquals(f.calls.includes("b2b_claim_provisioning"),false)});
Deno.test("internal role is not external authority",async()=>{env();const f=fixture();const r=await handler(request({...body,roles:[...roles,"gestor"]}),f.factory);assertEquals(r.status,403);assertEquals(f.calls.includes("create"),false)});
Deno.test("invalid JSON gets safe 400",async()=>{env();const f=fixture();const r=await handler(new Request("http://localhost/",{method:"POST",headers:{Authorization:"Bearer synthetic"},body:"{"}),f.factory);assertEquals(r.status,400)});
Deno.test("wrong backend fails before constructing SDK",async()=>{env();Deno.env.set("SUPABASE_URL","https://invalid.example");const f=fixture();const r=await handler(request(),f.factory);assertEquals(r.status,503);assertEquals(f.calls.length,0)});