// Captured baseline AuthProvider, synthetic SDK: reproduce real sequential-loader category, not gateway attribution.
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const s=vi.hoisted(()=>({ listener: undefined as undefined|((e:string,v:unknown)=>void), starts: [] as {table:string;at:number}[] }));
vi.mock("@/integrations/supabase/client",()=>({ supabase: {
  auth: { getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:(l:typeof s.listener)=>{s.listener=l;return{data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{} },
  from:(table:string)=>{
    const run=()=>{s.starts.push({table,at:performance.now()});return new Promise(resolve=>setTimeout(()=>resolve({data:table==="profiles"?{user_id:"synthetic-a",ativo:true,nome:"Teste"}:[{role:"gestor"}],error:null}),11000));};
    const q={select:()=>q,eq:()=>q,maybeSingle:run,then:(f:(v:unknown)=>unknown)=>run().then(f)};return q;
  },
} }));
vi.mock("@/lib/portalBroadcast",()=>({subscribePortalEvents:()=>()=>{}}));
import { AuthProvider,useAuth } from "@/hooks/useAuth";
let auth:ReturnType<typeof useAuth>;
function Spy(){auth=useAuth();return null;}
afterEach(()=>{cleanup();vi.useRealTimers();});
it("baseline11s+11s is sequential, partially applies profile and hits20s watchdog permanently",async()=>{
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout","performance","Date"]});s.starts=[];
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Spy/></AuthProvider></QueryClientProvider>);
  act(()=>s.listener?.("TOKEN_REFRESHED",{user:{id:"synthetic-a"}}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(11500);});
  expect(s.starts.map(x=>x.table)).toEqual(["profiles","user_roles"]);
  expect(s.starts[1].at-s.starts[0].at).toBe(11000);expect(auth.profile?.user_id).toBe("synthetic-a");expect(auth.roles).toEqual([]);
  await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
  expect(auth.loading).toBe(false);expect(auth.error).toMatch(/Falha ao carregar/);expect(auth.profile).toBeNull();expect(s.starts.length).toBe(2);
});