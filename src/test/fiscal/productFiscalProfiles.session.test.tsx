import { beforeEach,describe,it,expect,vi } from "vitest";
import { act,renderHook,waitFor } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { useProductFiscalProfile,useSaveProductFiscalProfile,OptimisticConflictError } from "@/hooks/useProductFiscalProfiles";
import { productFiscalFormSchema } from "@/lib/fiscal/productFiscalValidation";
const state=vi.hoisted(()=>({actor:"A",tenant:"A",epoch:0,ready:true,read:vi.fn(),write:vi.fn(),from:vi.fn()}));
vi.mock("@/hooks/useStorageAccessScope",()=>({useStorageAccessScope:(resource:string)=>{
 const scope=JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource]);
 return {ready:state.ready,scope,capture:()=>()=>state.ready&&scope===JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource])};
}}));
// Global product hooks use the product-specific fence (Superadmin canonical write); same scope semantics.
vi.mock("@/hooks/useProductFiscalAccess",()=>({useProductFiscalAccess:(resource:string)=>{
 const scope=JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource]);
 return {ready:state.ready,canWrite:state.ready,scope,capture:()=>()=>state.ready&&scope===JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource])};
}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(...a:unknown[])=>state.from(...a)}}));
let client:QueryClient;
function wrapper({children}:{children:React.ReactNode}){return <QueryClientProvider client={client}>{children}</QueryClientProvider>}
// Only the ACTIVE global profile is an editable CAS target (history is immutable).
const row={id:"profile",product_id:"product",is_active:true,updated_at:"2026-10-22T00:00:00Z",ncm:null};
beforeEach(()=>{
 state.actor="A";state.tenant="A";state.epoch=0;state.ready=true;vi.clearAllMocks();
 client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 state.read.mockResolvedValue({data:row,error:null});state.write.mockResolvedValue({data:{...row,ncm:"12345678"},error:null});
 state.from.mockImplementation(()=>{
  let writing=false;
  const q={select:()=>q,eq:()=>q,update:()=>{writing=true;return q},insert:()=>{writing=true;return q},maybeSingle:()=>writing?state.write():state.read(),single:()=>state.write()};return q;
 });
});
describe("fiscal product canonical hook fences",()=>{
 it("effective profile key includes actor/tenant and request scope, not only product ID",async()=>{
  const h=renderHook(()=>useProductFiscalProfile("product"),{wrapper});
  await waitFor(()=>expect(h.result.current.data?.id).toBe("profile"));
  const query=client.getQueryCache().getAll().find(q=>q.queryKey[2]==="profile");
  expect(query?.queryKey.slice(0,4)).toEqual(["fiscal","product-profiles","profile","product"]);
  expect(JSON.parse(String(query?.queryKey.at(-2)))).toEqual(["A","A",0,true,"portal-query-actor"]);
  expect(JSON.parse(String(query?.queryKey.at(-1)))).toEqual(["A","A",0,true,"product-fiscal-read"]);
 });
 it("confirmed save invalidates only matching actor scope, never foreign cache",async()=>{
  const actorScope=JSON.stringify(["A","A",0,true,"portal-query-actor"]);
  const own=["fiscal","product-profiles","list",{},actorScope,"request-A"];
  const foreign=["fiscal","product-profiles","list",{},JSON.stringify(["B","B",0,true,"portal-query-actor"]),"request-B"];
  client.setQueryData(own,{items:[]});client.setQueryData(foreign,{items:[]});
  const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});
  await act(async()=>{await h.result.current.mutateAsync({productId:"product",current:row,values:productFiscalFormSchema.parse({ncm:"12345678"})})});
  expect(client.getQueryState(own)?.isInvalidated).toBe(true);
  expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
 });
 it("revocation during new-profile existence check prevents insert",async()=>{
  let resolve:(v:unknown)=>void=()=>{};state.read.mockImplementation(()=>new Promise(r=>{resolve=r}));
  const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});let pending:Promise<unknown>=Promise.resolve();
  act(()=>{pending=h.result.current.mutateAsync({productId:"product",current:null,values:productFiscalFormSchema.parse({})}).catch(e=>e)});
  await waitFor(()=>expect(state.read).toHaveBeenCalled());state.ready=false;h.rerender();
  let result:unknown;await act(async()=>{resolve({data:null,error:null});result=await pending});
  expect(result).toBeInstanceOf(Error);expect(state.write).not.toHaveBeenCalled();
 });
 it("RLS rejection never invalidates or reports a confirmed save",async()=>{
  state.write.mockResolvedValue({data:null,error:{code:"42501"}});
  const invalidate=vi.spyOn(client,"invalidateQueries");const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync({productId:"product",current:row,values:productFiscalFormSchema.parse({ncm:"12345678"})})).rejects.toThrow("permission_denied")});
  expect(invalidate).not.toHaveBeenCalled();
 });
 it("rejects cached profile after denied refetch",async()=>{
  const h=renderHook(()=>useProductFiscalProfile("product"),{wrapper});
  await waitFor(()=>expect(h.result.current.data?.id).toBe("profile"));
  state.read.mockResolvedValue({data:null,error:{code:"42501"}});
  await act(async()=>{await h.result.current.refetch()});
  await waitFor(()=>expect(h.result.current.isError).toBe(true));
  expect(h.result.current.data).toBeUndefined();
 });
 it("does not adopt actor A response after tenant switch",async()=>{
  let resolve:(v:unknown)=>void=()=>{};
  state.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
  const h=renderHook(()=>useProductFiscalProfile("product"),{wrapper});
  await waitFor(()=>expect(state.read).toHaveBeenCalled());
  state.actor="B";state.tenant="B";state.read.mockResolvedValue({data:null,error:null});h.rerender();
  await act(async()=>resolve({data:row,error:null}));
  await waitFor(()=>expect(h.result.current.data).toBeNull());
 });
 it("late save cannot invalidate the next actor",async()=>{
  let resolve:(v:unknown)=>void=()=>{};state.write.mockImplementation(()=>new Promise(r=>{resolve=r}));
  const invalidate=vi.spyOn(client,"invalidateQueries");
  const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});
  let pending:Promise<unknown>=Promise.resolve();
  act(()=>{pending=h.result.current.mutateAsync({productId:"product",current:row,values:productFiscalFormSchema.parse({ncm:"12345678"})}).catch(e=>e)});
  await waitFor(()=>expect(state.write).toHaveBeenCalled());state.actor="B";state.tenant="B";h.rerender();
  let result:unknown;await act(async()=>{resolve({data:row,error:null});result=await pending});
  expect(result).toBeInstanceOf(Error);expect(invalidate).not.toHaveBeenCalled();
 });
 it("preserves CAS conflict",async()=>{
  state.write.mockResolvedValue({data:null,error:null});const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync({productId:"product",current:row,values:productFiscalFormSchema.parse({ncm:"12345678"})})).rejects.toBeInstanceOf(OptimisticConflictError)});
 });
 it("rejects product ID mismatch before writing",async()=>{
  const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync({productId:"another",current:row,values:productFiscalFormSchema.parse({})})).rejects.toThrow("fiscal_target_changed")});
  expect(state.from).not.toHaveBeenCalled();
 });
 it("expired scope blocks writes",async()=>{
  state.ready=false;const h=renderHook(()=>useSaveProductFiscalProfile(),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync({productId:"product",current:row,values:productFiscalFormSchema.parse({})})).rejects.toThrow("fiscal_context_changed")});
  expect(state.from).not.toHaveBeenCalled();
 });
});