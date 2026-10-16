import type { ProbeConnection, SmtpProbeDeps } from '../../_shared/comunicacao/smtp-provider-probe.ts';
// Strict tested numeric parser; no URL coercion, zones or ambiguous IPv4 forms.
export function parseIpv6(ip:string):number[]|null {
  if(!/^[0-9a-f:]+$/i.test(ip))return null;
  const halves=ip.split('::');if(halves.length>2)return null;
  const parse=(part:string)=>part?part.split(':'):[];
  const left=parse(halves[0]),right=halves.length===2?parse(halves[1]):[];
  if([...left,...right].some(v=>! /^[0-9a-f]{1,4}$/i.test(v)))return null;
  const missing=8-left.length-right.length;
  if(halves.length===1?missing!==0:missing<1)return null;
  return [...left,...Array(missing).fill('0'),...right].map(v=>parseInt(v,16));
}
export function publicAddress(ip:string):boolean {
  if(/^\d+\.\d+\.\d+\.\d+$/.test(ip)){
    const parts=ip.split('.'),a=parts.map(Number);
    if(a.some((v,i)=>v>255 || String(v)!==parts[i]))return false;
    const [x,y,z]=a;
    return x>0 && x<224 && x!==10 && x!==127 && !(x===100 && y>=64 && y<=127)
      && !(x===169 && y===254) && !(x===172 && y>=16 && y<=31)
      && !(x===192 && (y===0 || y===168 || y===2 || (y===88 && z===99)))
      && !(x===198 && (y===18 || y===19 || (y===51 && z===100))) && !(x===203 && y===0 && z===113);
  }
  const w=parseIpv6(ip);if(!w || (w[0]&0xe000)!==0x2000)return false;
  // Only global unicast 2000::/3; exclude IANA protocol assignments 2001::/23,
  // documentation, 6to4, AS112 and deprecated 6bone. Mapped/translated/NAT64,
  // ULA, link-local, multicast are outside 2000::/3 or rejected by grammar.
  return !(w[0]===0x2001 && (w[1]<0x200 || w[1]===0xdb8))
    && w[0]!==0x2002 && w[0]!==0x3ffe && !(w[0]===0x3fff && w[1]<=0xfff)
    && !(w[0]===0x2620 && w[1]===0x4f && w[2]===0x8000);
}
export interface PinnedRuntime {
  proven: boolean;
  resolve(host: string, family: 'A'|'AAAA'): Promise<string[]>;
  tcp(ip: string, port: number): Promise<ProbeConnection>;
  tls(socket: ProbeConnection, hostname: string): Promise<ProbeConnection>;
}
export function completeWrites(connection: ProbeConnection): ProbeConnection {
  let closed=false;
  return {
    read:buffer=>{if(closed)throw new Error('smtp_test_failed');return connection.read(buffer);},
    close:()=>{closed=true;connection.close();},
    write:async bytes=>{
      let offset=0;
      while(offset<bytes.length){
        if(closed)throw new Error('smtp_test_failed');
        const count=await connection.write(bytes.subarray(offset));
        if(!Number.isInteger(count) || count<=0 || count>bytes.length-offset)throw new Error('smtp_test_failed');
        offset+=count;
      }
      return offset;
    },
  };
}
export const PINNED_OPEN_TIMEOUT_MS=4000;
export function pinnedDeps(runtime:PinnedRuntime):SmtpProbeDeps {
  return {
    connect:async()=>{throw new Error('SMTP_UNAVAILABLE');},
    startTls:async()=>{throw new Error('SMTP_UNAVAILABLE');},
    connectTls:async(host,port)=>{
      if(!runtime.proven || port!==465)throw new Error('SMTP_UNAVAILABLE');
      let socket:ProbeConnection|undefined,secured:ProbeConnection|undefined;
      let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
      let phase:'dns'|'tls'='dns';
      const close=()=>{try{secured?.close();}catch{/* best effort */}try{socket?.close();}catch{/* best effort */}};
      const run=async()=>{
        const [a,aaaa]=await Promise.all([runtime.resolve(host,'A'),runtime.resolve(host,'AAAA')]);
        if(expired)throw new Error('smtp_dns_blocked');
        const addresses=[...a,...aaaa];
        if(!addresses.length || addresses.length>64 || !addresses.every(publicAddress))throw new Error('smtp_dns_blocked');
        phase='tls';
        socket=await runtime.tcp(addresses[0],465);
        if(expired){close();throw new Error('smtp_tls_failed');}
        secured=await runtime.tls(socket,host);
        if(expired){close();throw new Error('smtp_tls_failed');}
        return secured;
      };
      try{return await Promise.race([run(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{expired=true;close();reject(new Error(phase==='dns'?'smtp_dns_blocked':'smtp_tls_failed'));},PINNED_OPEN_TIMEOUT_MS);
      })]);}
      catch{expired=true;close();throw new Error(phase==='dns'?'smtp_dns_blocked':'smtp_tls_failed');}
      finally{if(timer!==undefined)clearTimeout(timer);}
    },
  };
}
