// Real AuthProvider, monitor and canonical probe; synthetic SDK/session, never hosted JWT/RLS.
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  uid: "00000000-0000-4000-8000-000000000001", org: "00000000-0000-4000-8000-000000000002",
  roles: ["gestor", "consultor_tecnico"] as string[], active: true, pms: 0, rms: 0, probeMs: 0,
  fail: null as null | { status: number }, hang: false, ignoreAbort: false,
  calls: [] as { table: string; uid: string; start: number; signal?: AbortSignal }[],
  listener: undefined as undefined | ((e: string, x: unknown) => void), signOut: vi.fn(),
}));
function chain(table: string) {
  let uid = s.uid; let signal: AbortSignal | undefined;
  const q = {
    select: () => q, eq: (_key: string, val: string) => { uid = val; return q; },
    abortSignal: (v: AbortSignal) => { signal = v; return q; },
    maybeSingle: () => run(), then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => run().then(a, b),
  };
  const run = () => {
    const row = { user_id: uid, organization_id: s.org, ativo: s.active, senha_provisoria: false, nome: "Sintético" };
    const roles = s.roles.map(role => ({ role })); const failure = s.fail; const hang = s.hang;
    s.calls.push({ table, uid, start: performance.now(), signal });
    return new Promise<{ data: unknown; error: unknown }>((resolve, reject) => {
      const timer = hang ? undefined : setTimeout(() => resolve({ data: table === "profiles" ? row : roles, error: failure }), table === "profiles" ? s.pms : s.rms);
      if (!s.ignoreAbort) signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  };
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: chain,
  auth: { getSession: async () => ({ data: { session: null }, error: null }), signOut: s.signOut,
    onAuthStateChange: (l: typeof s.listener) => { s.listener = l; return { data: { subscription: { unsubscribe: () => { s.listener = undefined; } } } }; } },
  rpc: () => new Promise(resolve => {
    const uid=s.uid, org=s.org, roles=[...s.roles], active=s.active;
    setTimeout(() => resolve({ data: { v: 1, user_id: uid, organization_id: org, profile: { user_id: uid, organization_id: org, ativo: active, senha_provisoria: false }, roles, roles_confirmed: roles.length > 0 }, error: null }), s.probeMs);
  }),
} }));
vi.mock("@/lib/portalBroadcast", () => ({ subscribePortalEvents: () => () => {} }));
import { AuthProvider, useAuth } from "@/hooks/useAuth";
let auth: ReturnType<typeof useAuth>;
function Spy() { auth=useAuth(); return null; }
const emit = (e="TOKEN_REFRESHED", uid: string | null=s.uid) => act(() => { s.listener?.(e, uid ? { user: { id: uid } } : null); });
const tick = async (ms=0) => { for (let n=0;n<ms;n+=100) await act(async()=>{ await vi.advanceTimersByTimeAsync(Math.min(100,ms-n)); }); await act(async()=>{ await vi.advanceTimersByTimeAsync(5); }); };
const start = async () => {
  const view=render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Spy /></AuthProvider></QueryClientProvider>);
  emit("SIGNED_IN"); await tick(100); expect(auth.authzReady).toBe(true); return view;
};
beforeEach(()=>{
  vi.useFakeTimers({ toFake: ["setTimeout","clearTimeout","Date","performance"] });
  s.uid="00000000-0000-4000-8000-000000000001";s.org="00000000-0000-4000-8000-000000000002";
  s.roles=["gestor","consultor_tecnico"];s.active=true;s.pms=0;s.rms=0;s.probeMs=0;s.fail=null;s.hang=false;s.ignoreAbort=false;s.calls=[];s.signOut.mockClear();
  Object.defineProperty(navigator,"onLine",{ configurable:true,value:true });
  Object.defineProperty(document,"visibilityState",{ configurable:true,value:"visible" });
});
afterEach(()=>{ cleanup();vi.useRealTimers(); });
describe("parallel atomic renewal loader",()=>{
  it.each([3000,8000])("%i ms independent reads overlap, no partial adoption",async(ms)=>{
    await start();s.pms=ms;s.rms=ms;emit();await tick(10);
    const last=s.calls.slice(-2);expect(last.map(x=>x.table).sort()).toEqual(["profiles","user_roles"]);
    expect(Math.abs(last[0].start-last[1].start)).toBeLessThan(2);
    expect(auth.profile).toBeNull();expect(auth.roles).toEqual([]);expect(auth.authzReady).toBe(false);
    await tick(ms+100);expect(auth.loading).toBe(false);expect(auth.authzReady).toBe(true);
  });
  it("profile complete, roles pending does not commit profile",async()=>{
    await start();s.pms=3000;s.rms=8000;emit();await tick(3100);expect(auth.profile).toBeNull();expect(auth.roles).toEqual([]);
    await tick(5000);expect(auth.authzReady).toBe(true);
  });
  it("parallel 11s reads finish before20s watchdog",async()=>{
    await start();s.pms=11000;s.rms=11000;emit();await tick(11200);expect(auth.loading).toBe(false);expect(auth.error).toBeNull();expect(auth.authzReady).toBe(true);
  });
  it("20s deadline aborts both hung reads and ends in operable error (no auto-retry, no signout)",async()=>{
    await start();s.hang=true;emit();await tick(20100);
    expect(s.calls.slice(-2).every(c=>c.signal?.aborted)).toBe(true);expect(auth.authzReady).toBe(false);
    expect(auth.loading).toBe(false);expect(auth.error).toMatch(/Falha ao carregar/);
    await tick(22000);expect(s.calls.length).toBe(4);expect(s.signOut).not.toHaveBeenCalled();
  });
  it("hung renewal: late answer never adopted; manual refresh re-reads fresh",async()=>{
    await start();s.ignoreAbort=true;s.pms=30000;s.rms=30000;emit();await tick(20100);expect(auth.error).toMatch(/Falha ao carregar/);
    await tick(11000);expect(auth.authzReady).toBe(false);expect(auth.error).toMatch(/Falha ao carregar/);
    s.ignoreAbort=false;s.pms=0;s.rms=0;await act(async()=>{ void auth.refresh(); });await tick(200);expect(auth.authzReady).toBe(true);expect(s.calls.length).toBe(6);
  });
  it("503 has one recovery; 401 is terminal without retry/signout",async()=>{
    await start();s.fail={status:503};emit();await tick(100);s.fail=null;await tick(1500);expect(auth.authzReady).toBe(true);
    const n=s.calls.length;s.fail={status:401};emit();await tick(3000);expect(s.calls.length).toBe(n+2);expect(auth.authzReady).toBe(false);expect(s.signOut).not.toHaveBeenCalled();
  });
  it("late ignored-abort responses cannot reopen authority",async()=>{
    await start();s.ignoreAbort=true;s.pms=30000;s.rms=30000;emit();await tick(20100);s.hang=true;
    await tick(12000);expect(auth.profile).toBeNull();expect(auth.authzReady).toBe(false);
    await tick(12000);expect(auth.loading).toBe(false);expect(auth.authzReady).toBe(false);
  });
  it.each(["offline","signout","unmount"])("%s aborts reads and stops scheduled recovery",async(stop)=>{
    const v=await start();s.hang=true;emit();await tick(20100);
    if(stop==="offline") { Object.defineProperty(navigator,"onLine",{ configurable:true,value:false });act(()=>window.dispatchEvent(new Event("offline"))); }
    if(stop==="signout") emit("SIGNED_OUT",null);
    if(stop==="unmount") v.unmount();
    const n=s.calls.length;await tick(40000);expect(s.calls.length).toBe(n);expect(s.calls.slice(-2).every(c=>c.signal?.aborted)).toBe(true);
  });
  it("A→B aborts A and late A cannot replace B",async()=>{
    await start();s.ignoreAbort=true;s.pms=8000;s.rms=8000;emit();await tick(100);
    const a=s.calls.slice(-2);s.uid="00000000-0000-4000-8000-000000000009";s.org="00000000-0000-4000-8000-000000000010";s.pms=0;s.rms=0;emit("SIGNED_IN");await tick(9000);
    expect(a.every(c=>c.signal?.aborted)).toBe(true);expect(auth.profile?.user_id).toBe(s.uid);expect(auth.profile?.organization_id).toBe(s.org);
  });
  it("inactivity is terminal with the original signOut; total role loss is terminal without signout; no recovery",async()=>{
    await start();s.active=false;emit();await tick(3000);expect(auth.error).toBe("Sua conta está inativa.");expect(auth.authzReady).toBe(false);
    expect(s.signOut).toHaveBeenCalledTimes(1);const n=s.calls.length;await tick(3000);expect(s.calls.length).toBe(n);
    s.signOut.mockClear();s.active=true;s.roles=[];emit();await tick(3000);expect(auth.roles).toEqual([]);expect(auth.authzReady).toBe(false);expect(s.signOut).not.toHaveBeenCalled();
  });
  it("manual refresh recovers terminal error without automatic retry budget reset",async()=>{
    await start();s.fail={status:401};emit();await tick(100);expect(auth.authzReady).toBe(false);
    s.fail=null;act(()=>{ void auth.refresh(); });await tick(200);expect(auth.authzReady).toBe(true);
  });
  it("signout during active read aborts immediately, no stale restart",async()=>{
    await start();s.hang=true;emit();await tick(100);const n=s.calls.length;
    emit("SIGNED_OUT",null);await tick(30000);expect(s.calls.length).toBe(n);expect(s.calls.slice(-2).every(c=>c.signal?.aborted)).toBe(true);expect(auth.profile).toBeNull();
  });
  it.each(["gestor","consultor_tecnico"])("pair loses one role: fresh %s remains independently monitored",async(role)=>{
    await start();s.roles=[role];emit();await tick(200);expect(auth.roles).toEqual([role]);expect(auth.authzResidualScope).toBe(true);expect(auth.authzReady).toBe(true);
  });
  it("8s probe still expires under unchanged15s lease, loader recovery does not grant",async()=>{
    await start();s.probeMs=8000;await tick(40000);expect(auth.authzReady).toBe(false);
  });
  it("3s probes and renewed pair remain authorized for120s without extending lease",async()=>{
    await start();s.probeMs=3000;
    for(let n=0;n<12;n++){await tick(10000);expect(auth.authzReady).toBe(true);}
  });
  it("same identity tenant changes require fresh matching probe, never old tenant",async()=>{
    await start();s.pms=3000;s.rms=3000;s.org="00000000-0000-4000-8000-000000000010";emit();await tick(100);
    expect(auth.profile).toBeNull();expect(auth.authzReady).toBe(false);await tick(3200);
    expect(auth.profile?.organization_id).toBe(s.org);expect(auth.authzReady).toBe(true);
  });
  it("offline during active request aborts and cannot restart until explicit fresh resolution",async()=>{
    await start();s.hang=true;emit();await tick(100);const n=s.calls.length;
    Object.defineProperty(navigator,"onLine",{configurable:true,value:false});act(()=>window.dispatchEvent(new Event("offline")));
    await tick(30000);expect(s.calls.length).toBe(n);expect(s.calls.slice(-2).every(c=>c.signal?.aborted)).toBe(true);expect(auth.authzReady).toBe(false);
  });
  it("superseding renewal cancels old recovery timer and never applies stale budget",async()=>{
    await start();s.hang=true;emit();await tick(20100);s.hang=false;emit();await tick(1500);
    expect(s.calls.length).toBe(6);expect(auth.authzReady).toBe(true);
  });
  it("user signOut cancels current hung reads before Auth signout settles",async()=>{
    await start();s.hang=true;emit();await tick(100);const last=s.calls.slice(-2);
    await act(async()=>{ await auth.signOut(); });await tick(25000);
    expect(last.every(c=>c.signal?.aborted)).toBe(true);expect(s.calls.length).toBe(4);expect(s.signOut).toHaveBeenCalledTimes(1);
  });
});