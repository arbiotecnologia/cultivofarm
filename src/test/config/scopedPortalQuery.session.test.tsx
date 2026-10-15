import {act,renderHook,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {describe,it,expect,vi,beforeEach} from "vitest";
const s=vi.hoisted(()=>({user:{id:"A"} as {id:string}|null,profile:{user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false},roles:["cliente_produtor"],loading:false}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>s}));
import {useScopedPortalQuery} from "@/hooks/useScopedPortalQuery";
describe("existing portal QueryClient isolation",()=>{
 beforeEach(()=>{s.user={id:"A"};s.profile={user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false};s.roles=["cliente_produtor"];s.loading=false;});
 it.each(["switch","logout","revoked","loading","unmount"])("late %s evicts old scope and refuses response",async mode=>{
 const qc=new QueryClient();let resolve:((v:string[])=>void)|undefined;const signals:AbortSignal[]=[];
 const fetch=vi.fn((signal:AbortSignal)=>{signals.push(signal);return new Promise<string[]>(r=>{resolve=r;});});
 const h=renderHook(()=>useScopedPortalQuery({queryKey:["produtor-pedidos","same-client"],queryFn:fetch}),{wrapper:({children})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>});
 await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());const oldScope=h.result.current.scope;
 if(mode==="switch"){s.user={id:"B"};s.profile={...s.profile,user_id:"B",organization_id:"OB"};h.rerender();}else if(mode==="logout"){s.user=null;h.rerender();}else if(mode==="revoked"){s.profile.ativo=false;h.rerender();}else if(mode==="loading"){s.loading=true;h.rerender();}else h.unmount();
 await act(async()=>{resolve?.(["A-private"]);});expect(signals[0].aborted).toBe(true);
 if(mode!=="unmount"){expect(h.result.current.data).toBeUndefined();expect(qc.getQueryCache().getAll().some(q=>q.queryKey.at(-1)===oldScope)).toBe(false);h.unmount();}qc.clear();
 });
});
