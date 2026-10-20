import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GerarLoteDialog } from "@/components/cockpit/GerarLoteDialog";

const f=vi.hoisted(() => ({ roles:["administrador"], tenant:"tenant-B", epoch:1, ready:true, live:true, rpc:vi.fn(), success:vi.fn(), info:vi.fn(), error:vi.fn(), invalidate:vi.fn() }));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:"actor"},profile:{user_id:"actor",organization_id:f.tenant,ativo:true,senha_provisoria:false},roles:f.roles,authzReady:f.ready,authzEpoch:f.epoch,loading:false,checkAuthzAccess:()=>f.live})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:(...args:unknown[])=>Object.assign(Promise.resolve(f.rpc(...args)),{abortSignal:()=>f.rpc.mock.results.at(-1)?.value})}}));
vi.mock("@/hooks/useCockpitQuery",()=>({useCockpitQuery:()=>({data:[]})}));
vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({invalidateQueries:f.invalidate})}));
vi.mock("sonner",()=>({toast:{success:f.success,info:f.info,error:f.error}}));
const target={programacao_id:"00000000-0000-4000-8000-000000000001",os_id:"00000000-0000-4000-8000-000000000002",origem:"manual",volume_solicitado:0.1};
const result={data:{success:true,replay:false,lote_id:"00000000-0000-4000-8000-000000000003",codigo_lote:"LT-2026-0001"},error:null};
beforeEach(()=>{vi.clearAllMocks(); f.roles=["administrador"];f.tenant="tenant-B";f.epoch=1;f.ready=true;f.live=true;f.rpc.mockResolvedValue(result);});
describe("formulário com useStorageAccessScope real, Auth/transporte sintéticos",()=>{
 it.each(["role","tenant","epoch","pause"])("%s durante await descarta dados e resposta",async kind=>{
  let finish:(v:unknown)=>void=()=>{};f.rpc.mockImplementation(()=>new Promise(r=>{finish=r;}));const created=vi.fn();
  const props={open:true,target,onOpenChange:vi.fn(),onCreated:created}; const view=render(<GerarLoteDialog {...props}/>);
  fireEvent.change(screen.getByLabelText("Tanque"),{target:{value:"TQ-DRAFT"}});
  fireEvent.click(screen.getByRole("button",{name:"Registrar Lote"}));
  if(kind==="role")f.roles=["financeiro"]; if(kind==="tenant")f.tenant="tenant-A"; if(kind==="epoch")f.epoch++; if(kind==="pause")f.ready=false;
  view.rerender(<GerarLoteDialog {...props}/>);await act(async()=>finish(result));
  expect(created).not.toHaveBeenCalled();expect(f.success).not.toHaveBeenCalled();expect(f.invalidate).not.toHaveBeenCalled();
  expect(screen.queryByDisplayValue("TQ-DRAFT")).toBeNull();
 });
 it("lease expira sem render: resposta não confirma",async()=>{
  let finish:(v:unknown)=>void=()=>{};f.rpc.mockImplementation(()=>new Promise(r=>{finish=r;}));const created=vi.fn();
  render(<GerarLoteDialog open target={target} onOpenChange={()=>{}} onCreated={created}/>);
  fireEvent.click(screen.getByRole("button",{name:"Registrar Lote"}));f.live=false;await act(async()=>finish(result));
  expect(created).not.toHaveBeenCalled();expect(f.success).not.toHaveBeenCalled();expect(f.invalidate).not.toHaveBeenCalled();
 });
 it("escopo válido confirma 100mL uma única vez",async()=>{
  const created=vi.fn();render(<GerarLoteDialog open target={target} onOpenChange={()=>{}} onCreated={created}/>);
  await act(async()=>fireEvent.click(screen.getByRole("button",{name:"Registrar Lote"})));
  expect(created).toHaveBeenCalledTimes(1);expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.rpc.mock.calls[0][1].p_lote.volume_produzido).toBe(100);
 });
});
