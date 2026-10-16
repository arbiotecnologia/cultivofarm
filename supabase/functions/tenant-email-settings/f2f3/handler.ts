import { testRequestSchema, testResultSchema, type TestRequest, type TestResult } from './contract.ts';
import type { ActorClient } from '../handler.ts';
export interface TestDeps {
 canonicalUrl:string; reviewed:boolean; transportProven:boolean;
 client(authorization:string):ActorClient;
 trustedOrigin(origin:string):boolean; cors(origin:string|null):Record<string,string>;
 execute(actor:string, client:ActorClient, input:TestRequest):Promise<TestResult>;
}
export function createTestHandler(deps:TestDeps) {
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin');
  const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...deps.cors(origin),'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(origin && !deps.trustedOrigin(origin))return respond(403,{code:'SMTP_FORBIDDEN'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...deps.cors(origin),'Cache-Control':'no-store'}});
  if(req.method!=='POST' || new URL(req.url).search)return respond(400,{code:'SMTP_INVALID'});
  if(deps.canonicalUrl!=='https://swzpzcwiasxmjutrmvkm.supabase.co' || !deps.reviewed || !deps.transportProven)return respond(503,{code:'SMTP_UNAVAILABLE'});
  const auth=req.headers.get('Authorization') ?? '';
  if(!/^Bearer [^\s]+$/.test(auth))return respond(401,{code:'SMTP_UNAUTHORIZED'});
  try {
   const client=deps.client(auth); const user=await client.auth.getUser();
   if(user.error || !user.data.user)return respond(401,{code:'SMTP_UNAUTHORIZED'});
   const scope=await client.rpc('tenant_smtp_test_context');
   if(scope.error)return scope.error.code==='42501'?respond(403,{code:'SMTP_FORBIDDEN'}):respond(500,{code:'SMTP_INTERNAL'});
   if(!scope.data || typeof scope.data!=='object')return respond(403,{code:'SMTP_FORBIDDEN'});
   const reader=req.body?.getReader(); if(!reader)return respond(400,{code:'SMTP_INVALID'});
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024){await reader.cancel();return respond(400,{code:'SMTP_INVALID'});}chunks.push(chunk.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
   let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return respond(400,{code:'SMTP_INVALID'});}
   const parsed=testRequestSchema.safeParse(raw);if(!parsed.success)return respond(400,{code:'SMTP_INVALID'});
   const result=testResultSchema.parse(await deps.execute(user.data.user.id,client,parsed.data));
   // Revalidate actual actor ACL before returning late result (finish audit always runs first).
   const after=await client.rpc('tenant_smtp_test_context');if(after.error || JSON.stringify(after.data)!==JSON.stringify(scope.data))return respond(403,{code:'SMTP_FORBIDDEN'});
   return respond(200,result);
  } catch{return respond(500,{code:'SMTP_INTERNAL'});}
 };
}
