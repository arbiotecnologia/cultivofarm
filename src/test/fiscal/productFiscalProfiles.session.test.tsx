import { beforeEach,describe,it,expect,vi } from "vitest";
import { act,renderHook,waitFor } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { useProductFiscalProfile,useSaveProductFiscalProfile,OptimisticConflictError } from "@/hooks/useProductFiscalProfiles";
import { productFiscalFormSchema } from "@/lib/fiscal/productFiscalValidation";
const state=vi.hoisted(()=>({actor:"A",tenant:"A",epoch:0,ready:true,owned:true,read:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/hooks/useStorageAccessScope",()=>({useStorageAccessScope:(resource:string)=>{
 const scope=JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource]);
 return {ready:state.ready,scope,capture:()=>()=>state.ready&&scope===JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource])};
}}));
// Tenant-owned product fiscal fence: administrador/gestor of the same tenant (canWriteOwnedProduct); same scope semantics.
vi.mock("@/hooks/useProductFiscalAccess",()=>({useProductFiscalAccess:(resource:string)=>{
 const scope=JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource]);
 return {ready:state.ready,canWrite:false,canWriteOwnedProduct:state.ready&&state.owned,scope,capture:()=>()=>state.ready&&scope===JSON.stringify([state.actor,state.tenant,state.epoch,state.ready,resource])};
}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(...a:unknown[])=>state.from(...a),rpc:(...a:unknown[])=>state.rpc(...a)}}));
let client:QueryClient;
function wrapper({children}:{children:React.ReactNode}){return <QueryClientProvider client={client}>{children}</QueryClientProvider>}
const PID="11111111-1111-4111-8111-111111111111", KEY="22222222-2222-4222-8222-222222222222", ORG="33333333-3333-4333-8333-333333333333";
const row={id:"44444444-4444-4444-8444-444444444444",product_id:PID,is_active:true,updated_at:"2026-10-22T00:00:00Z",ncm:null};
const receipt=(over:Record<string,unknown>={})=>({success:true,product_id:PID,profile_id:row.id,organization_id:ORG,profile_status:"DRAFT",updated_at:"2026-10-22 00:00:01+00",idempotency_key:KEY,idempotent:false,...over});
const input=(over:Record<string,unknown>={})=>({productId:PID,current:row,values:productFiscalFormSchema.parse({ncm:"12345678"}),reason:"Classificação informada pela contabilidade",idempotencyKey:KEY,...over});
beforeEach(()=>{
 state.actor="A";state.tenant="A";state.epoch=0;state.ready=true;state.owned=true;vi.clearAllMocks();
 client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 state.read.mockResolvedValue({data:row,error:null});state.rpc.mockResolvedValue({data:receipt(),error:null});
 state.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:()=>state.read()};return q;});
});
describe("fiscal product canonical hook fences (tenant-owned writer)",()=>{
 it("effective profile key includes actor/tenant and request scope, not only product ID",async()=>{
  const h=renderHook(()=>useProductFiscalProfile(PID),{wrapper});
  await waitFor(()=>expect(h.result.current.data?.id).toBe(row.id));
  const query=client.getQueryCache().getAll().find(q=>q.queryKey[2]==="profile");
  expect(query?.queryKey.slice(0,4)).toEqual(["fiscal","product-profiles","profile",PID]);
  expect(JSON.parse(String(query?.queryKey.at(-2)))).toEqual(["A","A",0,true,"portal-query-actor"]);
  expect(JSON.parse(String(query?.queryKey.at(-1)))).toEqual(["A","A",0,true,"product-fiscal-read"]);
 });
 it("writes only through tenant_owned_product_fiscal_save with CAS, reason and key; never direct table DML",async()=>{
  const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await h.result.current.mutateAsync(input())});
  expect(state.rpc).toHaveBeenCalledWith("tenant_owned_product_fiscal_save",{p_product_id:PID,p_expected_updated_at:row.updated_at,
   p_values:{ncm:"12345678"},p_reason:"Classificação informada pela contabilidade",p_idempotency_key:KEY});
  expect(state.from).not.toHaveBeenCalled();
 });
 it("new profile sends NULL CAS token and only filled fields (no product_id/status in payload)",async()=>{
  const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await h.result.current.mutateAsync(input({current:null}))});
  const args=state.rpc.mock.calls[0][1];
  expect(args.p_expected_updated_at).toBeNull();expect(args.p_values).toEqual({ncm:"12345678"});
 });
 it("writer disabled by gate: no RPC dispatch",async()=>{
  const h=renderHook(()=>useSaveProductFiscalProfile(false),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync(input())).rejects.toThrow("fiscal_writer_disabled")});
  expect(state.rpc).not.toHaveBeenCalled();
 });
 it("actor without tenant write role (e.g. Superadmin/financeiro) cannot dispatch",async()=>{
  state.owned=false;const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync(input())).rejects.toThrow("permission_denied")});
  expect(state.rpc).not.toHaveBeenCalled();
 });
 it("confirmed save invalidates only matching actor scope, never foreign cache",async()=>{
  const actorScope=JSON.stringify(["A","A",0,true,"portal-query-actor"]);
  const own=["fiscal","product-profiles","list",{},actorScope,"request-A"];
  const foreign=["fiscal","product-profiles","list",{},JSON.stringify(["B","B",0,true,"portal-query-actor"]),"request-B"];
  client.setQueryData(own,{items:[]});client.setQueryData(foreign,{items:[]});
  const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await h.result.current.mutateAsync(input())});
  expect(client.getQueryState(own)?.isInvalidated).toBe(true);
  expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
 });
 it("server 42501 never invalidates or reports a confirmed save",async()=>{
  state.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
  const invalidate=vi.spyOn(client,"invalidateQueries");const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync(input())).rejects.toThrow("permission_denied")});
  expect(invalidate).not.toHaveBeenCalled();
 });
 it("PT409 maps to CAS conflict without retry",async()=>{
  state.rpc.mockResolvedValue({data:null,error:{code:"PT409"}});const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync(input())).rejects.toBeInstanceOf(OptimisticConflictError)});
  expect(state.rpc).toHaveBeenCalledTimes(1);
 });
 it("ACK divergente (outro produto/chave ou status VALIDATED) é incerto, sem invalidar",async()=>{
  for (const bad of [receipt({product_id:ORG}),receipt({idempotency_key:ORG}),receipt({profile_status:"VALIDATED"}),receipt({success:false})]) {
   state.rpc.mockResolvedValueOnce({data:bad,error:null});
   const invalidate=vi.spyOn(client,"invalidateQueries");const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
   await act(async()=>{await expect(h.result.current.mutateAsync(input())).rejects.toThrow("fiscal_uncertain")});
   expect(invalidate).not.toHaveBeenCalled();invalidate.mockRestore();
  }
 });
 it("rejects cached profile after denied refetch",async()=>{
  const h=renderHook(()=>useProductFiscalProfile(PID),{wrapper});
  await waitFor(()=>expect(h.result.current.data?.id).toBe(row.id));
  state.read.mockResolvedValue({data:null,error:{code:"42501"}});
  await act(async()=>{await h.result.current.refetch()});
  await waitFor(()=>expect(h.result.current.isError).toBe(true));
  expect(h.result.current.data).toBeUndefined();
 });
 it("does not adopt actor A response after tenant switch",async()=>{
  let resolve:(v:unknown)=>void=()=>{};
  state.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
  const h=renderHook(()=>useProductFiscalProfile(PID),{wrapper});
  await waitFor(()=>expect(state.read).toHaveBeenCalled());
  state.actor="B";state.tenant="B";state.read.mockResolvedValue({data:null,error:null});h.rerender();
  await act(async()=>resolve({data:row,error:null}));
  await waitFor(()=>expect(h.result.current.data).toBeNull());
 });
 it("late save cannot invalidate the next actor",async()=>{
  let resolve:(v:unknown)=>void=()=>{};state.rpc.mockImplementation(()=>new Promise(r=>{resolve=r}));
  const invalidate=vi.spyOn(client,"invalidateQueries");
  const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  let pending:Promise<unknown>=Promise.resolve();
  act(()=>{pending=h.result.current.mutateAsync(input()).catch(e=>e)});
  await waitFor(()=>expect(state.rpc).toHaveBeenCalled());state.actor="B";state.tenant="B";h.rerender();
  let result:unknown;await act(async()=>{resolve({data:receipt(),error:null});result=await pending});
  expect(result).toBeInstanceOf(Error);expect(invalidate).not.toHaveBeenCalled();
 });
 it("rejects product ID mismatch before writing",async()=>{
  const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync(input({productId:ORG}))).rejects.toThrow("fiscal_target_changed")});
  expect(state.rpc).not.toHaveBeenCalled();
 });
 it("expired scope blocks writes",async()=>{
  state.ready=false;const h=renderHook(()=>useSaveProductFiscalProfile(true),{wrapper});
  await act(async()=>{await expect(h.result.current.mutateAsync(input())).rejects.toThrow("fiscal_context_changed")});
  expect(state.rpc).not.toHaveBeenCalled();
 });
});
