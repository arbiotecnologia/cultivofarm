import {boundedBytes,measure,MAX_BYTES} from './integrity.ts';
const equal=(a:unknown,b:unknown)=>{if(a!==b)throw new Error(`${a} != ${b}`);};
async function denied(run:()=>Promise<unknown>) {try{await run();}catch{return;}throw new Error('expected denial');}
Deno.test('PDF measured by bytes',async()=>{const m=await measure(new TextEncoder().encode('%PDF-1.7'));equal(m.mime,'application/pdf');equal(m.size_bytes,8);equal(m.sha256.length,64);});
Deno.test('empty denied',()=>denied(()=>measure(new Uint8Array())));
Deno.test('oversize denied',()=>denied(()=>measure(new Uint8Array(MAX_BYTES+1))));
Deno.test('HTML denied',()=>denied(()=>measure(new TextEncoder().encode('<html>'))));
Deno.test('chunked oversize denied',()=>denied(()=>boundedBytes(new Response(new Uint8Array(12)),new AbortController().signal,10)));
Deno.test('abort denies streaming',()=>{const c=new AbortController();c.abort();return denied(()=>boundedBytes(new Response('data'),c.signal));});
