import type { ZodTypeAny } from 'zod';
import { f4RequestSchema, f4ResultSchema, type F4Request, type F4Result } from './contract.ts';
import type { ActorClient } from '../handler.ts';
export interface F4Deps {
 canonicalUrl:string; reviewed:boolean; transportProven:boolean;
 client(authorization:string):ActorClient;
 trustedOrigin(origin:string):boolean; cors(origin:string|null):Record<string,string>;
 execute(actor:string,client:ActorClient,input:F4Request):Promise<F4Result>;
 // F4b (optional, reviewed separately): wider activation/status schemas. Default = F4a contract.
 requestSchema?:ZodTypeAny; resultSchema?:ZodTypeAny;
}
// Routed only by `?op=sender` (non-secret). Code/key travel exclusively in the JSON body.
export function createF4Handler(deps:F4Deps){
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin');
  const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...deps.cors(origin),'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(origin && !deps.trustedOrigin(origin))return respond(403,{code:'SMTP_FORBIDDEN'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...deps.cors(origin),'Cache-Control':'no-store'}});
  const url=new URL(req.url);
  if(req.method!=='POST' || url.search!=='?op=sender')return respond(400,{code:'SMTP_INVALID'});
  if(deps.canonicalUrl!=='https://swzpzcwiasxmjutrmvkm.supabase.co' || !deps.reviewed || !deps.transportProven)return respond(503,{code:'SMTP_UNAVAILABLE'});
  const auth=req.headers.get('Authorization') ?? '';
  if(!/^Bearer [^\s]+$/.test(auth))return respond(401,{code:'SMTP_UNAUTHORIZED'});
  try{
   const client=deps.client(auth);const user=await client.auth.getUser();
   if(user.error || !user.data.user)return respond(401,{code:'SMTP_UNAUTHORIZED'});
   const scope=await client.rpc('tenant_smtp_test_context');
   if(scope.error)return scope.error.code==='42501'?respond(403,{code:'SMTP_FORBIDDEN'}):respond(500,{code:'SMTP_INTERNAL'});
   if(!scope.data || typeof scope.data!=='object')return respond(403,{code:'SMTP_FORBIDDEN'});
   const reader=req.body?.getReader();if(!reader)return respond(400,{code:'SMTP_INVALID'});
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>1024){await reader.cancel();return respond(400,{code:'SMTP_INVALID'});}chunks.push(c.value);}
   const bytes=new Uint8Array(size);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.byteLength;}
   let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return respond(400,{code:'SMTP_INVALID'});}
   const parsed=(deps.requestSchema ?? f4RequestSchema).safeParse(raw);if(!parsed.success)return respond(400,{code:'SMTP_INVALID'});
   const result=(deps.resultSchema ?? f4ResultSchema).parse(await deps.execute(user.data.user.id,client,parsed.data as F4Request));
   const after=await client.rpc('tenant_smtp_test_context');
   if(after.error || JSON.stringify(after.data)!==JSON.stringify(scope.data))return respond(403,{code:'SMTP_FORBIDDEN'});
   return respond(200,result);
  }catch{return respond(500,{code:'SMTP_INTERNAL'});}
 };
}
