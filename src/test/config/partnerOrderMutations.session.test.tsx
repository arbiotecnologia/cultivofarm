import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({auth:{user:{id:"A"} as {id:string}|null,profile:{user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false},roles:["administrador"],loading:false},pending:[] as Array<(v:unknown)=>void>}));
const notices=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>state.auth}));vi.mock("sonner",()=>({toast:notices}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:vi.fn(()=>new Promise(resolve=>state.pending.push(resolve)))}}));
import { useSetDeliveryDate } from "@/hooks/usePartnerOrderActions";
describe("mutation QueryClient scope",()=>{
 beforeEach(()=>{state.auth={user:{id:"A"},profile:{user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false},roles:["administrador"],loading:false};state.pending=[];vi.clearAllMocks();});
 it.each(["switch","logout","revoked","unmount"])("late %s does not notify/invalidate B",async mode=>{
 const qc=new QueryClient();qc.setQueryData(["partner-orders","B"],[{id:"B-order"}]);const invalidate=vi.spyOn(qc,"invalidateQueries");
 const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const h=renderHook(()=>useSetDeliveryDate(),{wrapper});let done:Promise<unknown>=Promise.resolve();
 await act(async()=>{done=h.result.current.mutateAsync({order_id:"A-order",estimated_delivery_date:"2026-11-01"}).catch(()=>undefined);});expect(state.pending).toHaveLength(1);
 if(mode==="switch"){state.auth={...state.auth,user:{id:"B"},profile:{...state.auth.profile,user_id:"B",organization_id:"OB"}};h.rerender();}else if(mode==="logout"){state.auth.user=null;h.rerender();}else if(mode==="revoked"){state.auth.profile.ativo=false;h.rerender();}else h.unmount();
 await act(async()=>{state.pending[0]({error:null});await done;});expect(notices.success).not.toHaveBeenCalled();expect(notices.error).not.toHaveBeenCalled();expect(invalidate).not.toHaveBeenCalled();expect(qc.getQueryData(["partner-orders","B"])).toEqual([{id:"B-order"}]);h.unmount();qc.clear();
 });
});
