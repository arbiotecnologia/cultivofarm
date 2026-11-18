import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';

const state=vi.hoisted(()=>({actor:'A',tenant:'org-A',roles:['administrador'],epoch:0,fetch:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:state.actor},profile:{user_id:state.actor,organization_id:state.tenant,ativo:true},roles:state.roles,role:state.roles[0],loading:false,authzReady:true,authzEpoch:state.epoch})}));
vi.mock('@/integrations/supabase/client',async()=>{const {createClient}=await import('@supabase/supabase-js');return {supabase:createClient('https://swzpzcwiasxmjutrmvkm.supabase.co','synthetic-key',{accessToken:async()=> 'synthetic-token',global:{fetch:(...args)=>state.fetch(...args)},auth:{persistSession:false,autoRefreshToken:false}})};});
import {TenantProblemDialog} from '@/components/protocolos/TenantProblemPanel';
import {TenantProfileLinks} from '@/components/protocolos/catalog/TenantProfileLinks';
import {useActiveCatalogFamilies} from '@/hooks/useActiveCatalogFamilies';
const pid='00000000-0000-4000-8000-000000000001', stamp='2026-11-12T04:00:00Z';let qc:QueryClient;
const json=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}});
function wrapper({children}:{children:ReactNode}){return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>}
beforeEach(()=>{Object.assign(state,{actor:'A',tenant:'org-A',roles:['administrador'],epoch:0});state.fetch.mockReset();qc=new QueryClient({defaultOptions:{queries:{retry:false}}});state.fetch.mockImplementation(async u=>String(u).includes('save_v1')?json({ok:true,id:pid,updated_at:stamp,replayed:false}):json([]));});afterEach(()=>{cleanup();qc.clear()});

vi.mock('@/components/catalogo/CompactCatalogSelect',()=>({CompactCatalogSelect:({label,value,options,onChange}:any)=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
const cid='00000000-0000-4000-8000-000000000002';
function reads(){state.fetch.mockImplementation(async(u:any)=>String(u).includes('save_v1')?json({ok:true,id:pid,updated_at:stamp}):String(u).includes('/culturas')?json([{id:cid,nome:'Cultura sintética'}]):json([]));}
async function ready(){await waitFor(()=>expect(screen.getByRole('button',{name:'Cadastrar problema'})).toBeEnabled());}
const writes=()=>state.fetch.mock.calls.filter(([u])=>String(u).includes('save_v1'));
it.each(['produto','microrganismo'] as const)('salva vínculo %s pelo RPC sem submeter a ficha externa',async entity=>{
 reads();const submit=vi.fn(),pending=vi.fn();render(<form onSubmit={submit}><TenantProfileLinks entity={entity} parent={pid} onPending={pending}/></form>,{wrapper});await ready();
 fireEvent.change(screen.getByLabelText('Cultura do vínculo adicional'),{target:{value:cid}});fireEvent.change(screen.getByLabelText('Observação do vínculo'),{target:{value:'Nota sintética'}});
 expect(pending).toHaveBeenLastCalledWith(true);fireEvent.click(screen.getByRole('button',{name:'Salvar vínculo'}));
 await waitFor(()=>expect(screen.getByLabelText('Observação do vínculo')).toHaveValue(''));
 expect(writes()).toHaveLength(1);expect(JSON.parse(writes()[0][1].body)).toMatchObject({p_entity:entity,p_parent:pid,p_payload:{culture_id:cid,problem_id:null,observacao:'Nota sintética',ativo:true}});
 expect(submit).not.toHaveBeenCalled();expect(pending).toHaveBeenLastCalledWith(false);
});
it('cancelar libera o editor sem persistir o rascunho',async()=>{
 reads();const pending=vi.fn();render(<TenantProfileLinks entity='produto' parent={pid} onPending={pending}/>,{wrapper});await ready();
 fireEvent.change(screen.getByLabelText('Observação do vínculo'),{target:{value:'Descartar'}});expect(pending).toHaveBeenLastCalledWith(true);
 fireEvent.click(screen.getByRole('button',{name:'Cancelar vínculo'}));expect(pending).toHaveBeenLastCalledWith(false);expect(writes()).toHaveLength(0);
});
it('troca de empresa limpa rascunho e refaz consultas no novo escopo',async()=>{
 reads();const tree=()=> <TenantProfileLinks entity='produto' parent={pid}/>;const view=render(tree(),{wrapper});await ready();
 fireEvent.change(screen.getByLabelText('Observação do vínculo'),{target:{value:'Somente A'}});state.tenant='org-B';state.epoch++;view.rerender(tree());await ready();
 expect(screen.getByLabelText('Observação do vínculo')).toHaveValue('');expect(writes()).toHaveLength(0);
});
it('resposta incerta conserva dados e reutiliza a chave sem duplicar envio',async()=>{
 reads();const transport=state.fetch.getMockImplementation()!;let count=0;state.fetch.mockImplementation(async(u:any,...args:any[])=>String(u).includes('save_v1')?(++count===1?json({message:'indisponível'},503):json({ok:true,id:pid,updated_at:stamp})):transport(u,...args));
 render(<TenantProfileLinks entity='microrganismo' parent={pid}/>,{wrapper});await ready();fireEvent.change(screen.getByLabelText('Cultura do vínculo adicional'),{target:{value:cid}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar vínculo'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Cancelar vínculo'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Salvar vínculo'}));await waitFor(()=>expect(screen.getByLabelText('Cultura do vínculo adicional')).toHaveValue('none'));
 expect(writes()).toHaveLength(2);expect(JSON.parse(writes()[0][1].body).p_key).toEqual(JSON.parse(writes()[1][1].body).p_key);
});
