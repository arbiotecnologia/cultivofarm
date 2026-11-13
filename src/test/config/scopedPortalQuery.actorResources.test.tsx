import {act,renderHook,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider,useQuery} from "@tanstack/react-query";
import {describe,it,expect,vi} from "vitest";
const s=vi.hoisted(()=>({user:{id:"A"} as {id:string}|null,profile:{user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false},roles:["admin"],loading:false,authzReady:true,authzEpoch:0}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>s}));
import {useScopedPortalQuery} from "@/hooks/useScopedPortalQuery";
import {useStorageAccessScope} from "@/hooks/useStorageAccessScope";
const wrap=(qc:QueryClient)=>({children}:{children:React.ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
describe("scoped portal query: distinct actor resources under one prefix",()=>{
 it("stays stable (no refetch loop) and only evicts on company switch",async()=>{
  const qc=new QueryClient();let calls=0;
  const fetch=async()=>{calls++;return [calls];};
  const h=renderHook(()=>{
   const actorA=useStorageAccessScope("fiscal-actor-a");const reqA=useStorageAccessScope("req-a");
   const actorB=useStorageAccessScope("fiscal-actor-b");const reqB=useStorageAccessScope("req-b");
   const a=useScopedPortalQuery({queryKey:["fiscal","list"],queryFn:fetch},{actor:actorA,request:reqA});
   const b=useScopedPortalQuery({queryKey:["fiscal","dossier"],queryFn:fetch},{actor:actorB,request:reqB});
   const plain=useQuery({queryKey:["fiscal","unscoped"],queryFn:async()=>"x"});
   return {a,b,plain};
  },{wrapper:wrap(qc)});
  await waitFor(()=>{expect(h.result.current.a.data).toBeDefined();expect(h.result.current.b.data).toBeDefined();expect(h.result.current.plain.data).toBe("x");});
  const settled=calls;
  for(let i=0;i<5;i++){h.rerender();await act(async()=>{await new Promise(r=>setTimeout(r,10));});}
  expect(calls).toBe(settled);
  expect(h.result.current.a.isLoading||h.result.current.b.isLoading).toBe(false);
  const oldA=h.result.current.a.data;
  s.profile={...s.profile,organization_id:"OB"};h.rerender();
  expect(h.result.current.a.data===oldA).toBe(false);
  expect(qc.getQueryCache().getAll().some(q=>JSON.stringify(q.queryKey).includes('"OA"'))).toBe(false);
  await waitFor(()=>expect(h.result.current.a.data).toBeDefined());
  h.unmount();qc.clear();
 });
});
