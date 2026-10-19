import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthzEpochMonitor, type AuthzFingerprintResult } from '@/lib/authz/authzEpochMonitor';

const valid = (fingerprint='same'): AuthzFingerprintResult => ({eligible:true,fingerprint});
function setup() {
  let clock=0;
  let online=true;
  const fetcher=vi.fn<()=>Promise<AuthzFingerprintResult>>().mockResolvedValue(valid());
  const onExpire=vi.fn(), onEpochChange=vi.fn(), onStateChange=vi.fn();
  const monitor=createAuthzEpochMonitor({fetcher,now:()=>clock,isOnline:()=>online,isVisible:()=>false,pollWhenHidden:true,
    setTimeoutFn:(cb,ms)=>setTimeout(cb,ms),clearTimeoutFn:h=>clearTimeout(h as ReturnType<typeof setTimeout>),onExpire,onEpochChange,onStateChange});
  return {monitor,fetcher,onExpire,onEpochChange,onStateChange,setClock:(n:number)=>{clock=n;},offline:()=>{online=false;},
    advance:async(ms:number)=>{clock+=ms;await vi.advanceTimersByTimeAsync(ms);}};
}
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());
describe('reviewed paired environmental checks — monotonic fake clock, not browser suspension proof',()=>{
  it('hidden polls confirm at t10 and t20 without pending or epoch changes',async()=>{
    const s=setup();s.monitor.start();await vi.advanceTimersByTimeAsync(0);
    await s.advance(10000);await s.advance(10000);
    expect(s.fetcher).toHaveBeenCalledTimes(3);expect(s.monitor.checkAccess()).toBe(true);
    expect(s.onStateChange.mock.calls.map(c=>c[0])).toEqual(['pending','valid']);expect(s.onEpochChange).not.toHaveBeenCalled();
  });
  it('focus+visibility+online join one request; t14 confirmation authorizes only until t16 from request start t1',async()=>{
    const s=setup();s.monitor.start();await vi.advanceTimersByTimeAsync(0);await s.advance(1000);
    let resolve:((r:AuthzFingerprintResult)=>void)|undefined;s.fetcher.mockImplementationOnce(()=>new Promise(r=>resolve=r));
    s.monitor.revalidateEnvironment();s.monitor.revalidateEnvironment();s.monitor.revalidateEnvironment();
    expect(s.fetcher).toHaveBeenCalledTimes(2);expect(s.monitor.checkAccess()).toBe(true);
    await s.advance(13000);resolve?.(valid());await vi.advanceTimersByTimeAsync(0);
    expect(s.monitor.checkAccess()).toBe(true);await s.advance(1999);expect(s.monitor.checkAccess()).toBe(true);
    await s.advance(1);expect(s.monitor.checkAccess()).toBe(false);expect(s.onExpire).toHaveBeenCalledWith('timeout');
  });
  it('hidden pending poll never renews t15; late confirmation cannot reopen',async()=>{
    const s=setup();let resolve:((r:AuthzFingerprintResult)=>void)|undefined;
    s.fetcher.mockResolvedValueOnce(valid()).mockImplementationOnce(()=>new Promise(r=>resolve=r));
    s.monitor.start();await vi.advanceTimersByTimeAsync(0);await s.advance(10000);
    expect(s.monitor.checkAccess()).toBe(true);await s.advance(5000);expect(s.monitor.state()).toBe('expired');
    resolve?.(valid('late'));await vi.advanceTimersByTimeAsync(0);expect(s.monitor.checkAccess()).toBe(false);expect(s.monitor.currentFingerprint()).toBe('same');
  });
  it('suspended timers: access closes at t15, resume expires before coalescing and old response stays fenced',async()=>{
    const s=setup();let old:((r:AuthzFingerprintResult)=>void)|undefined, fresh:((r:AuthzFingerprintResult)=>void)|undefined;
    s.fetcher.mockResolvedValueOnce(valid()).mockImplementationOnce(()=>new Promise(r=>old=r)).mockImplementationOnce(()=>new Promise(r=>fresh=r));
    s.monitor.start();await vi.advanceTimersByTimeAsync(0);s.setClock(1000);s.monitor.revalidateEnvironment();
    s.setClock(15000);expect(s.monitor.checkAccess()).toBe(false);s.monitor.revalidateEnvironment();s.monitor.revalidateEnvironment();
    expect(s.monitor.state()).toBe('pending');expect(s.onExpire).toHaveBeenCalledWith('timeout');expect(s.fetcher).toHaveBeenCalledTimes(3);
    old?.(valid('stale'));await vi.advanceTimersByTimeAsync(0);expect(s.monitor.checkAccess()).toBe(false);
    fresh?.(valid());await vi.advanceTimersByTimeAsync(0);expect(s.monitor.checkAccess()).toBe(true);
  });
  it.each(['error','ineligible','offline'])('%s during a soft check immediately closes and invalidates in-flight authority',async reason=>{
    const s=setup();s.monitor.start();await vi.advanceTimersByTimeAsync(0);
    let resolve:((r:AuthzFingerprintResult)=>void)|undefined;
    if(reason==='error')s.fetcher.mockRejectedValueOnce(new Error('offline transport'));
    else if(reason==='ineligible')s.fetcher.mockResolvedValueOnce({eligible:false,fingerprint:null});
    else s.fetcher.mockImplementationOnce(()=>new Promise(r=>resolve=r));
    s.monitor.revalidateEnvironment();if(reason==='offline'){s.offline();s.monitor.revalidateEnvironment();}
    await vi.advanceTimersByTimeAsync(0);expect(s.monitor.state()).toBe('expired');expect(s.monitor.checkAccess()).toBe(false);
    resolve?.(valid());await vi.advanceTimersByTimeAsync(0);expect(s.monitor.checkAccess()).toBe(false);
  });
  it('changed fingerprint retires the epoch; identical environmental confirmation does not',async()=>{
    const s=setup();s.monitor.start();await vi.advanceTimersByTimeAsync(0);
    s.monitor.revalidateEnvironment();await vi.advanceTimersByTimeAsync(0);expect(s.onEpochChange).not.toHaveBeenCalled();
    s.fetcher.mockResolvedValueOnce(valid('changed'));s.monitor.revalidateEnvironment();await vi.advanceTimersByTimeAsync(0);expect(s.onEpochChange).toHaveBeenCalledTimes(1);
  });
  it('explicit retry supersedes environmental generation and clears valid state immediately',async()=>{
    const s=setup();s.monitor.start();await vi.advanceTimersByTimeAsync(0);
    let old:((r:AuthzFingerprintResult)=>void)|undefined;s.fetcher.mockImplementationOnce(()=>new Promise(r=>old=r));
    s.monitor.revalidateEnvironment();s.monitor.revalidate();expect(s.monitor.state()).toBe('pending');
    await vi.advanceTimersByTimeAsync(0);old?.(valid('stale'));await vi.advanceTimersByTimeAsync(0);
    expect(s.monitor.currentFingerprint()).toBe('same');expect(s.monitor.checkAccess()).toBe(true);
  });
});