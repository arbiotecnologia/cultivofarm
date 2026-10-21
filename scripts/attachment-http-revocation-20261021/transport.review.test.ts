import { describe, expect, it, vi } from 'vitest';
import { createTransport } from './edge/transport';
import { serveDocument, LIMITS } from './edge/download';
import { fencedStep } from './frontend/backupFence';
const tenant='007bb519-cba0-4704-be2c-cb93ad010048', client='b2bd6b53-4198-40ba-b2da-603cea5eda2b';
const path=`${tenant}/clientes/${client}/outro/legacy.pdf`;
const proof=()=>({actor:client,tenant,client,path,roles:['administrador'],document:tenant,size:3,mime:'application/pdf'});
const req=()=>new Request('https://test.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bucket:'clientes-docs',path})});
describe('atomic actor proof and server-only byte channel',()=>{
  it('exactly two RPC calls and one byte read; no role query fanout',async()=>{
    const rpc=vi.fn().mockResolvedValue(proof()); const bytes=vi.fn().mockResolvedValue(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}}));
    const r=await serveDocument(req(),{},createTransport({rpc},bytes));
    expect(r.status).toBe(200);expect(rpc).toHaveBeenCalledTimes(2);expect(bytes).toHaveBeenCalledTimes(1);
  });
  it('unproved path/bucket cannot trigger privileged bytes',async()=>{
    const bytes=vi.fn();const t=createTransport({rpc:vi.fn().mockResolvedValue(null)},bytes);
    expect(await t.download(path,new AbortController().signal)).toBeNull();
    expect((await serveDocument(req(),{},t)).status).toBe(403);expect(bytes).not.toHaveBeenCalled();
  });
  it('fresh post-RPC revocation rejects successful privileged bytes',async()=>{
    const rpc=vi.fn().mockResolvedValueOnce(proof()).mockResolvedValueOnce(null);
    const bytes=vi.fn().mockResolvedValue(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close();}}));
    expect((await serveDocument(req(),{},createTransport({rpc},bytes))).status).toBe(403);
    expect(rpc).toHaveBeenCalledTimes(2);expect(bytes).toHaveBeenCalledTimes(1);
  });
  it('preserves a valid legacy 15 MiB object below bucket 20 MiB',async()=>{
    const size=15*1024*1024;const rpc=vi.fn().mockResolvedValue({...proof(),size});
    const bytes=vi.fn().mockResolvedValue(new ReadableStream({start(c){c.enqueue(new Uint8Array(size));c.close();}}));
    const r=await serveDocument(req(),{},createTransport({rpc},bytes));expect(r.status).toBe(200);
    expect((await r.arrayBuffer()).byteLength).toBe(size);expect(LIMITS.bytes).toBe(20*1024*1024);
  });
});
describe('ZIP final fence, without consuming a late ZIP',()=>{
  for(const cause of ['tenant','roles','epoch','lease','unmount']) it(`${cause} during compression blocks final bytes`,async()=>{
    let current=true;let resolve:(v:Blob)=>void=()=>{};
    const download=vi.fn();const c=new AbortController();
    const p=fencedStep({signal:c.signal,current:()=>current},()=>new Promise<Blob>(r=>{resolve=r;})).then(download);
    current=false;resolve(new Blob(['zip']));await expect(p).rejects.toThrow();expect(download).not.toHaveBeenCalled();
  });
  it('abort releases hung operation; retry and late completion are independent',async()=>{
    let resolve:(v:Blob)=>void=()=>{};const c=new AbortController();const old=fencedStep({signal:c.signal,current:()=>true},()=>new Promise<Blob>(r=>{resolve=r;}));
    const outcome=expect(old).rejects.toThrow();c.abort();await outcome;
    expect((await fencedStep({signal:new AbortController().signal,current:()=>true},async()=>new Blob(['new']))).size).toBe(3);
    resolve(new Blob(['old']));
  });
});