export const MAX_BYTES = 20 * 1024 * 1024;
export function documentMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  return null;
}
export async function readBounded(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) throw new Error('empty');
  const reader=stream.getReader(); const chunks:Uint8Array[]=[]; let total=0;
  try { while(true) { const {done,value}=await reader.read(); if(done) break; total+=value.length; if(total>MAX_BYTES) throw new Error('limit'); chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{}); }
  if(total===0) throw new Error('empty');
  const bytes=new Uint8Array(total); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;} return bytes;
}
export async function digest(bytes:Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''); }