// Uniform 8-digit code (rejection sampling) + salted SHA-256 matching SQL:
// encode(sha256(convert_to(salt||':'||challenge_id||':'||code,'UTF8')),'hex')
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export function generateCode(random:(b:Uint32Array)=>Uint32Array=b=>crypto.getRandomValues(b)):string {
 const limit=4_000_000_000; // multiple of 1e8 → no modulo bias
 for(;;){const v=random(new Uint32Array(1))[0];if(v<limit)return String(v%100_000_000).padStart(8,'0');}
}
export function generateSalt():string{return hex(crypto.getRandomValues(new Uint8Array(16)));}
export async function hashCode(salt:string,challengeId:string,code:string):Promise<string>{
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt}:${challengeId}:${code}`))));
}
