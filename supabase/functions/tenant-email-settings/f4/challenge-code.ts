// Uniform 8-digit code (rejection sampling) + salted SHA-256 matching SQL:
// encode(sha256(convert_to(salt||':'||challenge_id||':'||code,'UTF8')),'hex')
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export function generateCode(random:(b:Uint32Array<ArrayBuffer>)=>Uint32Array<ArrayBuffer>=b=>{crypto.getRandomValues(b);return b;}):string {
 const limit=4_000_000_000; // multiple of 1e8 → no modulo bias
 for(;;){const v=random(new Uint32Array(new ArrayBuffer(4)))[0];if(v<limit)return String(v%100_000_000).padStart(8,'0');}
}
export function generateSalt():string{const b=new Uint8Array(new ArrayBuffer(16));crypto.getRandomValues(b);return hex(b);}
export async function hashCode(salt:string,challengeId:string,code:string):Promise<string>{
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt}:${challengeId}:${code}`))));
}
