import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),download:vi.fn(),epoch:0}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'u'},profile:{user_id:'u',organization_id:'org',ativo:true},roles:['administrador'],loading:false,authzEpoch:mock.epoch})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('@/lib/authz/authenticatedAttachment',()=>({downloadAuthenticatedAttachment:mock.download,ATTACHMENT_LIMITS:{fileBytes:20000,totalBytes:60000,files:24}}));
import {ProductRegulatoryNavigation} from '@/components/fiscal/ProductRegulatoryNavigation';
import {parseProductDossier,loadProductRegulatoryDocument} from '@/hooks/useProductRegulatoryDossiers';
const mid='00000000-0000-4000-8000-000000000001',pid='00000000-0000-4000-8000-000000000002',did='00000000-0000-4000-8000-000000000003',doc='00000000-0000-4000-8000-000000000004';
const product={product_id:pid,nome:'Produto QA',codigo:'QA1',ativo:true,dossier_status:'NONE'};
const filled={product_id:pid,dossier:{id:did,microorganism_id:mid,version:1,status:'DRAFT',regulatory_category:null,mapa_registration_number:null,mapa_status:null,blocked_reason:null},documents:[],checklist:[],gate:{pendencies:[{code:'ROTULO',field:'documents',layer:'REGULATORY',message:'Rótulo deste produto ausente.'}]}};
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><ProductRegulatoryNavigation microId={mid} onLegacy={()=>{}}/></QueryClientProvider>);}
beforeEach(()=>{mock.rpc.mockReset();mock.download.mockReset();mock.rpc.mockImplementation(async(name)=>({data:name==='rpc_regulatory_microorganism_products'?[product]:null,error:null}));});
afterEach(cleanup);
describe('dossiê individual canônico',()=>{
 it('ausência é null sem herdar o legado e voltar mantém o produto',async()=>{mount();fireEvent.click(await screen.findByRole('button',{name:'Abrir dossiê do produto Produto QA'}));expect(await screen.findByText('Nenhum dossiê registrado para este produto.')).toBeTruthy();expect(screen.queryByText('Pendências deste produto')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Voltar à lista de produtos'}));expect(await screen.findByRole('button',{name:'Abrir dossiê do produto Produto QA'})).toBeTruthy();expect(mock.rpc).toHaveBeenCalledWith('rpc_regulatory_product_dossier_detail',{p_microorganism_id:mid,p_product_id:pid});});
 it('nenhum produto não consulta dossiê',async()=>{mock.rpc.mockResolvedValue({data:[],error:null});mount();expect(await screen.findByText('Nenhum produto comercial vinculado a este microrganismo.')).toBeTruthy();expect(mock.rpc.mock.calls).toHaveLength(1);});
 it('falha não vira lista vazia',async()=>{mock.rpc.mockResolvedValue({data:null,error:{code:'42501'}});mount();expect(await screen.findByText(/Não foi possível consultar/)).toBeTruthy();expect(screen.queryByText(/Nenhum produto comercial/)).toBeNull();});
 it('pendências e documentos pertencem ao produto solicitado',async()=>{mock.rpc.mockImplementation(async(name)=>({data:name==='rpc_regulatory_microorganism_products'?[product]:filled,error:null}));mount();fireEvent.click(await screen.findByRole('button',{name:'Abrir dossiê do produto Produto QA'}));expect(await screen.findByText('Rótulo deste produto ausente.')).toBeTruthy();expect(screen.getByText('Nenhum documento disponível neste dossiê.')).toBeTruthy();});
 it('resposta de outro produto é recusada',()=>{expect(()=>parseProductDossier({...filled,product_id:mid},pid)).toThrow('regulatory_target_mismatch');});
 it('documento de outro dossiê é recusado',()=>{expect(()=>parseProductDossier({...filled,documents:[{id:doc,dossier_id:mid,title:'errado',doc_type:'LAUDO',issuer:null,valid_until:null,storage_bucket:'fiscal-regulatorio',storage_path:'x',content_sha256:'a'}]},pid)).toThrow('regulatory_target_mismatch');});
 it('documento privado sem autorização não lê bytes',async()=>{mock.rpc.mockResolvedValue({data:null,error:{code:'42501'}});await expect(loadProductRegulatoryDocument(mid,pid,doc,new AbortController().signal)).rejects.toThrow();expect(mock.download).not.toHaveBeenCalled();});
 it('carregamento não é ausência',async()=>{mock.rpc.mockImplementation(()=>new Promise(()=>{}));mount();expect(screen.getByText('Carregando…')).toBeTruthy();expect(screen.queryByText(/Nenhum produto/)).toBeNull();});
});