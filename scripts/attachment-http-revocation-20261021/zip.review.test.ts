import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),download:vi.fn(),compress:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>({abortSignal:()=>m.rpc(...args)})}}));
vi.mock('@/lib/authz/authenticatedAttachment',()=>({downloadAuthenticatedAttachment:m.download}));
vi.mock('jszip',()=>({default:class {file(){return this;} generateAsync(){return m.compress();}}}));
import { gerarBackupDocumentosCliente } from '@/lib/clienteDocumentos';
const rows=[{doc:{id:'d',cliente_id:'c',nome:'a.pdf',tipo:'outro',arquivo_path:'o/clientes/c/outro/a.pdf'},proof:{roles:['administrador'],tenant:'o'}}];
beforeEach(()=>{m.rpc.mockReset().mockResolvedValue({data:rows,error:null});m.download.mockReset().mockResolvedValue(new Blob(['pdf']));m.compress.mockReset().mockResolvedValue(new Blob(['zip']));
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
describe('integrated ZIP final RPC and authorization fence',()=>{
 it('rejects 25 files before bytes without deleting or truncating documents',async()=>{
  m.rpc.mockResolvedValue({data:Array.from({length:25},(_,i)=>({...rows[0],doc:{...rows[0].doc,id:String(i)}})),error:null});
  await expect(gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true})).rejects.toThrow('24 arquivos');
  expect(m.download).not.toHaveBeenCalled();expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
 it('accepts exactly 24 files',async()=>{
  m.rpc.mockResolvedValue({data:Array.from({length:24},(_,i)=>({...rows[0],doc:{...rows[0].doc,id:String(i)}})),error:null});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  expect((await gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true})).baixados).toBe(24);
 });
 for(const bytes of [60*1024*1024,60*1024*1024+1]) it(`actual cumulative bytes ${bytes} enforce 60 MiB independent of metadata`,async()=>{
  m.download.mockResolvedValue({size:bytes});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const p=gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true});
  if(bytes===60*1024*1024) expect((await p).baixados).toBe(1);
  else {await expect(p).rejects.toThrow('60 MiB');expect(m.compress).not.toHaveBeenCalled();expect(URL.createObjectURL).not.toHaveBeenCalled();}
 });
 for(const stage of ['initial','final']) it(`hung ${stage} RPC rejects on timeout, manual retry remains possible`,async()=>{
  vi.useFakeTimers();
  if(stage==='final')m.rpc.mockResolvedValueOnce({data:rows,error:null});
  m.rpc.mockImplementationOnce(()=>new Promise(()=>{}));
  const p=gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true});const outcome=expect(p).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(15_001);await outcome;expect(URL.createObjectURL).not.toHaveBeenCalled();
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  expect((await gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true})).baixados).toBe(1);
 });
 it('final RPC response after suspended timers cannot save ZIP',async()=>{
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
  m.rpc.mockResolvedValueOnce({data:rows,error:null}).mockImplementationOnce(async()=>{now=15_001;return {data:rows,error:null};});
  await expect(gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true})).rejects.toThrow();expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
 it('fresh atomic backup snapshot before/after compression then download',async()=>{
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const r=await gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true});
  expect(r.baixados).toBe(1);expect(m.rpc).toHaveBeenCalledTimes(2);expect(click).toHaveBeenCalledTimes(1);click.mockRestore();
 });
 it('post-compression RLS denial discards ZIP and does not create Blob URL',async()=>{
  m.rpc.mockResolvedValueOnce({data:rows,error:null}).mockResolvedValueOnce({data:null,error:null});
  await expect(gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true})).rejects.toThrow();expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
 it('role snapshot changed during ZIP rejects without download',async()=>{
  m.rpc.mockResolvedValueOnce({data:rows,error:null}).mockResolvedValueOnce({data:[{...rows[0],proof:{roles:['administrativo'],tenant:'o'}}],error:null});
  await expect(gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>true})).rejects.toThrow();expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
 it('lease lost while compression hangs then resolves never runs postread/save',async()=>{
  let current=true;let resolve:(v:Blob)=>void=()=>{};m.compress.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const p=gerarBackupDocumentosCliente('c','Cliente',{signal:new AbortController().signal,current:()=>current});
  await vi.waitFor(()=>expect(m.compress).toHaveBeenCalled());current=false;resolve(new Blob(['old']));
  await expect(p).rejects.toThrow();expect(m.rpc).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
});