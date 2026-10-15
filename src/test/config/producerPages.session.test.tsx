import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  auth: { user: { id: "A" } as {id:string}|null, profile: {user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false}, roles:["cliente_produtor"],loading:false },
  clienteId: "C-A" as string|null,
  calls: [] as Array<{table:string, signal?:AbortSignal, resolve?:(v:unknown)=>void}>,
}));
vi.mock("@/hooks/useAuth", () => ({useAuth:()=>s.auth}));
vi.mock("@/hooks/usePortalCliente", () => ({usePortalCliente:()=>({clienteId:s.clienteId,clienteNome:s.clienteId,loading:false})}));
vi.mock("@/integrations/supabase/client", () => ({supabase:{from:(table:string)=>{
  const call:{table:string,signal?:AbortSignal,resolve?:(v:unknown)=>void}={table};s.calls.push(call);
  const builder={select:()=>builder,eq:()=>builder,not:()=>builder,neq:()=>builder,in:()=>builder,order:()=>builder,limit:()=>builder,
    abortSignal:(signal:AbortSignal)=>{call.signal=signal;return builder;},single:()=>builder,
    then:(resolve:(v:unknown)=>void)=>new Promise(r=>{call.resolve=r;}).then(resolve)};
  return builder;
}}}));
import Financeiro from "@/pages/portal/PortalFinanceiro";
import Dashboard from "@/pages/portal/PortalDashboard";
import Fazenda from "@/pages/portal/PortalFazendaDetalhe";
import Talhao from "@/pages/portal/PortalTalhaoDetalhe";
describe("actual producer pages: stale responses",()=>{
  beforeEach(()=>{s.auth={user:{id:"A"},profile:{user_id:"A",organization_id:"OA",ativo:true,senha_provisoria:false},roles:["cliente_produtor"],loading:false};s.clienteId="C-A";s.calls=[];});
  it.each([Financeiro,Dashboard,Fazenda,Talhao])("client change aborts actual page reads before descendants",async Page=>{
    const qc=new QueryClient();const tree=()=> <QueryClientProvider client={qc}><MemoryRouter initialEntries={["/resource/same-id"]}><Routes><Route path="/resource/:id" element={<Page/>}/></Routes></MemoryRouter></QueryClientProvider>;
    const h=render(tree());await waitFor(()=>expect(s.calls.length).toBeGreaterThan(0));const old=[...s.calls];
    const oldKeys=qc.getQueryCache().getAll().map(q=>q.queryKey);
    expect(old.every(c=>!!c.signal)).toBe(true);
    if(Page===Fazenda||Page===Talhao) expect(old).toHaveLength(1);
    s.clienteId="C-sibling";h.rerender(tree());await waitFor(()=>expect(old.every(c=>c.signal?.aborted)).toBe(true));
    await act(async()=>{old.forEach(c=>c.resolve?.({data:null,count:0,error:null}));});
    oldKeys.forEach(key=>expect(qc.getQueryData(key)).toBeUndefined());
    h.unmount();qc.clear();
  });
  it("actual financial page cannot query with provisional password",()=>{
    s.auth.profile.senha_provisoria=true;const qc=new QueryClient();const h=render(<QueryClientProvider client={qc}><Financeiro/></QueryClientProvider>);
    expect(s.calls).toHaveLength(0);h.unmount();qc.clear();
  });
});