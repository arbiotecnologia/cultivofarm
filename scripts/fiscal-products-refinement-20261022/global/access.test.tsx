import { beforeEach,describe,it,expect,vi } from "vitest";
import { renderHook,act,waitFor } from "@testing-library/react";
import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";
import { useFiscalRtcItem } from "@/hooks/useFiscalRtc";
const state=vi.hoisted(()=>({actor:{user:{id:"A"},session:{user:{id:"A"},expires_at:2100000000},profile:{id:"P",user_id:"A",ativo:true,senha_provisoria:false,organization_id:null as string|null},roles:["superadmin"],loading:false,error:null,authzReady:true,authzEpoch:1,checkAuthzAccess:()=>true},rpc:vi.fn()}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>state.actor}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:(...args:unknown[])=>state.rpc(...args)}}));
beforeEach(()=>{state.actor.roles=["superadmin"];state.actor.profile.ativo=true;state.actor.profile.senha_provisoria=false;state.actor.profile.organization_id=null;state.actor.authzReady=true;state.actor.authzEpoch=1;state.actor.checkAuthzAccess=()=>true;state.actor.session.user.id="A";state.rpc.mockReset();state.rpc.mockResolvedValue({data:{configuration:{schema_version:1},revision:"1",exists:true},error:null});});
describe("global fiscal real-session presentation fence",()=>{
 it("Superadmin without organization can edit only global product contract",()=>{const h=renderHook(()=>useProductFiscalAccess("product"));expect(h.result.current.ready).toBe(true);expect(h.result.current.canWrite).toBe(true)});
 it.each(["administrador","gestor","financeiro"])("%s is read only",role=>{state.actor.roles=[role];state.actor.profile.organization_id="T";const h=renderHook(()=>useProductFiscalAccess("product"));expect(h.result.current.ready).toBe(true);expect(h.result.current.canWrite).toBe(false)});
 it("rejects session subject mismatch",()=>{state.actor.session.user.id="B";expect(renderHook(()=>useProductFiscalAccess("product")).result.current.ready).toBe(false)});
 it("rejects inactive profile",()=>{state.actor.profile.ativo=false;expect(renderHook(()=>useProductFiscalAccess("product")).result.current.canWrite).toBe(false)});
 it("rejects provisional password",()=>{state.actor.profile.senha_provisoria=true;expect(renderHook(()=>useProductFiscalAccess("product")).result.current.canWrite).toBe(false)});
 it("rejects expired monitor without rerender",()=>{const h=renderHook(()=>useProductFiscalAccess("product"));const valid=h.result.current.capture();state.actor.checkAuthzAccess=()=>false;h.rerender();expect(valid()).toBe(false)});
 it("IBS/CBS internal writer is denied before RPC",async()=>{state.actor.roles=["financeiro"];state.actor.profile.organization_id="T";const h=renderHook(()=>useFiscalRtcItem("product","item"));await waitFor(()=>expect(h.result.current.loading).toBe(false));state.rpc.mockClear();await act(async()=>{expect(await h.result.current.save({schema_version:1})).toEqual({ok:false})});expect(state.rpc).not.toHaveBeenCalled()});
 it("IBS/CBS late answer after epoch revocation is never shown",async()=>{let done:(v:unknown)=>void=()=>{};state.rpc.mockImplementationOnce(()=>new Promise(r=>{done=r}));const h=renderHook(()=>useFiscalRtcItem("product","item"));await waitFor(()=>expect(state.rpc).toHaveBeenCalled());state.actor.authzReady=false;state.actor.authzEpoch++;h.rerender();await act(async()=>done({data:{configuration:{schema_version:1,cst_ibs_cbs:"000"},revision:"1",exists:true},error:null}));expect(h.result.current.data).toBeNull()});
});
