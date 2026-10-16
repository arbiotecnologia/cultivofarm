import type { ProbeConnection, SmtpProbeDeps } from '../../../supabase/functions/_shared/comunicacao/smtp-provider-probe.ts';
// Conservative public address allowlist: all unrecognized/special IPv6 fails closed.
export function publicAddress(ip: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const a = ip.split('.').map(Number);
    if (a.some((v, i) => v > 255 || String(v) !== ip.split('.')[i])) return false;
    const [x,y,z] = a;
    return x > 0 && x < 224 && ![10,127].includes(x) && !(x===100 && y>=64 && y<=127)
      && !(x===169 && y===254) && !(x===172 && y>=16 && y<=31) && !(x===192 && (y===0 || y===168 || (y===88 && z===99) || (y===2 && z===0)))
      && !(x===198 && (y===18 || y===19 || (y===51 && z===100))) && !(x===203 && y===0 && z===113);
  }
  // Accept only canonical expanded global unicast, excluding protocol assignments,
  // documentation, 6to4, Teredo, mapped/translated/ULA/link-local and multicast.
  if (!/^[23][0-9a-f]{3}(?::[0-9a-f]{1,4}){7}$/i.test(ip)) return false;
  const w = ip.split(':').map(v => parseInt(v,16));
  return !(w[0]===0x2001 && (w[1]<=0x1ff || w[1]===0xdb8)) && w[0]!==0x2002 && !(w[0]===0x3fff && w[1]<=0xfff);
}
export interface PinnedRuntime {
  proven: boolean;
  resolve(host: string, family: 'A'|'AAAA'): Promise<string[]>;
  tcp(ip: string, port: number): Promise<ProbeConnection>;
  tls(socket: ProbeConnection, hostname: string): Promise<ProbeConnection>;
}
export function pinnedDeps(runtime: PinnedRuntime): SmtpProbeDeps {
  return {
    connect: async () => { throw new Error('SMTP_UNAVAILABLE'); },
    startTls: async () => { throw new Error('SMTP_UNAVAILABLE'); },
    connectTls: async (host, port) => {
      if (!runtime.proven || port!==465) throw new Error('SMTP_UNAVAILABLE');
      let addresses: string[];
      try { const [a,aaaa] = await Promise.all([runtime.resolve(host,'A'),runtime.resolve(host,'AAAA')]); addresses=[...a,...aaaa]; }
      catch { throw new Error('smtp_dns_blocked'); }
      if (!addresses.length || !addresses.every(publicAddress)) throw new Error('smtp_dns_blocked');
      let socket: ProbeConnection | undefined;
      let secured: ProbeConnection | undefined;
      let expired=false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const open = async () => {
        socket = await runtime.tcp(addresses[0],465); // literal IP; never resolve host again
        if (expired) { socket.close(); throw new Error('smtp_tls_failed'); }
        secured = await runtime.tls(socket,host); // SNI + original hostname certificate verification
        if (expired) { secured.close(); throw new Error('smtp_tls_failed'); }
        return secured;
      };
      try {
        return await Promise.race([open(), new Promise<never>((_,reject) => {
          timer=setTimeout(()=>{expired=true;try { secured?.close(); socket?.close(); } catch { /* best effort */ } reject(new Error('smtp_tls_failed'));},4000);
        })]);
      } catch { expired=true; try { secured?.close(); socket?.close(); } catch { /* best effort */ } throw new Error('smtp_tls_failed'); }
      finally { if(timer!==undefined)clearTimeout(timer); }
    },
  };
}
