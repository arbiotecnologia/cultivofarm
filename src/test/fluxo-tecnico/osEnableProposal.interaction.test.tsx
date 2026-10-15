import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), navigate: vi.fn(), toast: vi.fn(),
  auth: { user: { id: 'AR-actor' }, profile: { user_id: 'AR-actor', ativo: true, organization_id: 'AR' }, roles: ['administrador'], loading: false },
  ws: { status: 'aprovado', version: 9, permissions: { can_convert_os: true, can_manage: true }, ordens_servico: [] as unknown[] },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc, from: m.from } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }));
vi.mock('react-router-dom', () => ({ useNavigate: () => m.navigate }));
vi.mock('sonner', () => ({ toast: { success: m.toast, info: m.toast, error: m.toast } }));
import { LaboratoryConversionAction } from '@/components/visita/VisitaStatusBanner';
import { useFluxoVisitaTecnica } from '@/hooks/useFluxoVisitaTecnica';
const clients: QueryClient[] = [];
function wrapper() {
 const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(c);
 return { client: c, Wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider> };
}
beforeEach(() => {
 vi.clearAllMocks(); m.auth.roles = ['administrador']; m.auth.loading = false; m.auth.profile.ativo = true; m.auth.profile.organization_id = 'AR';
 m.ws = { status: 'aprovado', version: 9, permissions: { can_convert_os: true, can_manage: true }, ordens_servico: [] };
 m.rpc.mockImplementation(async name => name === 'rpc_get_visita_workspace' ? { data: m.ws, error: null } : { data: { success: true, os_id: 'os-one', registro_id: 'visit', already_exists: false }, error: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
const calls = () => m.rpc.mock.calls.filter(([name]) => name === 'rpc_converter_visita_em_os');
it.each(['administrador','gestor','consultor_tecnico','tecnico_agronomo'])('%s depends on server permission, not visual role', async role => {
 m.auth.roles = [role]; const { Wrapper } = wrapper(); const { result } = renderHook(useFluxoVisitaTecnica, { wrapper: Wrapper });
 m.ws.permissions.can_convert_os = false; expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(calls()).toHaveLength(0);
 m.ws.permissions.can_convert_os = true; expect((await result.current.converterRecomendacaoEmOS('visit')).os_id).toBe('os-one'); expect(calls()).toHaveLength(1);
});
it.each(['produtor','parceiro_b2b','parceiro_b2b_tecnico','platform_superadmin','financeiro','producao'])('%s never calls converter even with bad cached permission', async role => {
 m.auth.roles = [role]; const { Wrapper } = wrapper(); const { result } = renderHook(useFluxoVisitaTecnica, { wrapper: Wrapper });
 expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(calls()).toHaveLength(0);
});
it.each(['rascunho','em_andamento','finalizado','enviado_aprovacao','reprovado','arquivado'])('status %s is blocked', async status => {
 m.ws.status = status; const { Wrapper } = wrapper(); const { result } = renderHook(useFluxoVisitaTecnica, { wrapper: Wrapper });
 expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(calls()).toHaveLength(0);
});
it.each(['loading','inactive','tenantless'])('%s is fail closed before workspace', async mode => {
 if(mode==='loading') m.auth.loading=true; if(mode==='inactive') m.auth.profile.ativo=false; if(mode==='tenantless') m.auth.profile.organization_id='';
 const { Wrapper }=wrapper(); const { result }=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper});
 expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(m.rpc).not.toHaveBeenCalled();
});
it('workspace foreign/inexistent permission denial never calls conversion', async () => {
 const { Wrapper }=wrapper(); const { result }=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper});
 m.ws.permissions.can_convert_os=false;
 expect(await result.current.converterRecomendacaoEmOS('FSF-visit')).toEqual(await result.current.converterRecomendacaoEmOS('missing'));
 expect(calls()).toHaveLength(0);
});
it('opening and canceling never write; confirmation writes once and reads updated workspace', async () => {
 const { client, Wrapper }=wrapper(); const original=m.rpc.getMockImplementation();
 m.rpc.mockImplementation(async (name,args)=> { const r=await original?.(name,args); if(name==='rpc_converter_visita_em_os') m.ws={...m.ws,status:'convertido_os',ordens_servico:[{id:'os-one'}]}; return r; });
 client.setQueryData(['unrelated'],7); render(<Wrapper><LaboratoryConversionAction registroId="visit" /></Wrapper>);
 fireEvent.click(await screen.findByRole('button',{name:'Gerar OS laboratorial'})); expect(calls()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Cancelar'})); expect(calls()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Gerar OS laboratorial'})); fireEvent.click(screen.getByRole('button',{name:'Confirmar encaminhamento'}));
 await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull()); expect(calls()).toHaveLength(1);
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Gerar OS laboratorial'})).toBeNull());
 expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false); expect(m.from).not.toHaveBeenCalled();
});
it('parallel double invocation uses one synchronous lock; manual retry uses same visit', async()=>{
 let finish: ((v:unknown)=>void)|undefined; const original=m.rpc.getMockImplementation();
 m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?new Promise(resolve=>{finish=resolve}):original?.(name,args));
 const {Wrapper}=wrapper(); const {result}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper}); const first=result.current.converterRecomendacaoEmOS('visit');
 await waitFor(()=>expect(calls()).toHaveLength(1)); expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false);
 finish?.({data:{success:true,os_id:'os-one',registro_id:'visit'},error:null}); await first;
 m.ws.status='convertido_os'; m.rpc.mockImplementation(async name=>name==='rpc_get_visita_workspace'?{data:m.ws,error:null}:{data:{success:true,os_id:'os-one',registro_id:'visit',already_exists:true},error:null});
 expect((await result.current.converterRecomendacaoEmOS('visit')).already_exists).toBe(true); expect(calls()).toHaveLength(2);
 for(const [,args] of calls()) expect(args.p_registro_id).toBe('visit');
});
it.each(['LAB_VISIT_NO_SELECTION','LAB_VISIT_MULTIPLE_SELECTIONS','LAB_VISIT_SELECTION_CONFLICT','LAB_VISIT_EMPTY_RECOMMENDATION','LAB_VISIT_CONVERSION_FAILED'])('%s keeps dialog open and does not invalidate success caches',async code=>{
 const original=m.rpc.getMockImplementation(); m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?{data:{success:false,code,message:'private server detail'},error:null}:original?.(name,args));
 const {client,Wrapper}=wrapper(); const invalidate=vi.spyOn(client,'invalidateQueries'); render(<Wrapper><LaboratoryConversionAction registroId="visit" /></Wrapper>);
 fireEvent.click(await screen.findByRole('button',{name:'Gerar OS laboratorial'})); fireEvent.click(screen.getByRole('button',{name:'Confirmar encaminhamento'}));
 expect(await screen.findByRole('alert')).not.toHaveTextContent('private server detail'); expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(invalidate).not.toHaveBeenCalled(); expect(calls()).toHaveLength(1);
});
it('server error never leaks raw text and permits explicit retry',async()=>{
 const original=m.rpc.getMockImplementation(); m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?{data:null,error:{message:'secret SQL detail'}}:original?.(name,args));
 const {Wrapper}=wrapper(); const {result}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper});
 expect((await result.current.converterRecomendacaoEmOS('visit')).message).not.toContain('secret SQL');
 expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(calls()).toHaveLength(2);
});
it('malformed success does not invalidate or claim completion',async()=>{
 const original=m.rpc.getMockImplementation(); m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?{data:{success:true,os_id:'os-one',registro_id:'other'},error:null}:original?.(name,args));
 const {client,Wrapper}=wrapper(); const invalidate=vi.spyOn(client,'invalidateQueries'); const {result}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper});
 expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(invalidate).not.toHaveBeenCalled();
});
it('AR -> FSF -> AR during pending workspace rejects late result',async()=>{
 let finish: ((v:unknown)=>void)|undefined; m.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
 const {Wrapper}=wrapper(); const {result,rerender}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper}); const pending=result.current.converterRecomendacaoEmOS('visit');
 act(()=>{m.auth.profile.organization_id='FSF';rerender()}); act(()=>{m.auth.profile.organization_id='AR';rerender()});
 finish?.({data:m.ws,error:null}); expect((await pending).success).toBe(false); expect(calls()).toHaveLength(0);
});
it('late conversion after identity change cannot publish success or invalidate',async()=>{
 let finish: ((v:unknown)=>void)|undefined; const original=m.rpc.getMockImplementation(); m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?new Promise(resolve=>{finish=resolve}):original?.(name,args));
 const {client,Wrapper}=wrapper(); const invalidate=vi.spyOn(client,'invalidateQueries'); const {result,rerender}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper}); const pending=result.current.converterRecomendacaoEmOS('visit');
 await waitFor(()=>expect(calls()).toHaveLength(1)); act(()=>{m.auth.profile.organization_id='FSF';rerender()});
 finish?.({data:{success:true,os_id:'os-one',registro_id:'visit'},error:null}); expect((await pending).success).toBe(false); expect(invalidate).not.toHaveBeenCalled();
});
it('workspace loading never mounts actionable button',async()=>{
 m.rpc.mockImplementation(()=>new Promise(()=>{})); const {Wrapper}=wrapper();render(<Wrapper><LaboratoryConversionAction registroId="visit" /></Wrapper>);
 expect(screen.queryByRole('button',{name:'Gerar OS laboratorial'})).toBeNull(); expect(calls()).toHaveLength(0);
});
it('read-only consultant cannot call conversion even with stale convert permission',async()=>{
 m.auth.roles=['consultor_tecnico']; m.ws.permissions.can_manage=false;
 const {Wrapper}=wrapper(); const {result}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper});
 expect((await result.current.converterRecomendacaoEmOS('visit')).success).toBe(false); expect(calls()).toHaveLength(0);
 render(<Wrapper><LaboratoryConversionAction registroId="visit" /></Wrapper>);
 await waitFor(()=>expect(m.rpc).toHaveBeenCalled());expect(screen.queryByRole('button',{name:'Gerar OS laboratorial'})).toBeNull();
});
it('unmount while conversion is pending cannot invalidate, toast or navigate',async()=>{
 let finish: ((v:unknown)=>void)|undefined;const original=m.rpc.getMockImplementation();
 m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?new Promise(resolve=>{finish=resolve}):original?.(name,args));
 const {client,Wrapper}=wrapper();const invalidate=vi.spyOn(client,'invalidateQueries');const {result,unmount}=renderHook(useFluxoVisitaTecnica,{wrapper:Wrapper});
 const pending=result.current.converterRecomendacaoEmOS('visit');await waitFor(()=>expect(calls()).toHaveLength(1));unmount();
 finish?.({data:{success:true,os_id:'os-one',registro_id:'visit'},error:null});expect((await pending).success).toBe(false);
 expect(invalidate).not.toHaveBeenCalled();expect(m.toast).not.toHaveBeenCalled();expect(m.navigate).not.toHaveBeenCalled();
});
it('dialog identity change ignores late error and releases lock without stale state',async()=>{
 let finish: ((v:unknown)=>void)|undefined;const original=m.rpc.getMockImplementation();
 m.rpc.mockImplementation((name,args)=>name==='rpc_converter_visita_em_os'?new Promise(resolve=>{finish=resolve}):original?.(name,args));
 const {Wrapper}=wrapper();const {rerender}=render(<Wrapper><LaboratoryConversionAction registroId="visit" /></Wrapper>);
 fireEvent.click(await screen.findByRole('button',{name:'Gerar OS laboratorial'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar encaminhamento'}));
 await waitFor(()=>expect(calls()).toHaveLength(1));expect(screen.getByRole('button',{name:'Cancelar'})).toBeDisabled();
 act(()=>{m.auth.profile.organization_id='FSF';rerender(<Wrapper><LaboratoryConversionAction registroId="visit" /></Wrapper>)});
 expect(screen.queryByRole('alertdialog')).toBeNull();
 await act(async()=>{finish?.({data:{success:false,code:'LAB_VISIT_CONVERSION_FAILED'},error:null});});
 expect(screen.queryByRole('alert')).toBeNull();expect(m.toast).not.toHaveBeenCalled();expect(m.navigate).not.toHaveBeenCalled();
 fireEvent.click(await screen.findByRole('button',{name:'Gerar OS laboratorial'}));
 expect(screen.getByRole('button',{name:'Confirmar encaminhamento'})).toBeEnabled();
});
