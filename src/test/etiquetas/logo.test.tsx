import { describe, it, expect, vi, afterEach } from 'vitest';
import { inspectLogoBytes, LOGO_MAX_BYTES, prepareLabelLogo, validatedLabelLogo } from '@/lib/etiquetaLogo';
import { createLooseLabels, EMPTY_LOOSE_LABEL } from '@/lib/etiquetaAvulsa';
import { labelLayout } from '@/lib/etiquetasLayout';

function png(width = 800, height = 240) {
  const b = new Uint8Array(33); b.set([137,80,78,71,13,10,26,10]); b.set([73,72,68,82],12); const v = new DataView(b.buffer); v.setUint32(16,width); v.setUint32(20,height); return b;
}
function webp() { const b = new Uint8Array(30); const v = new DataView(b.buffer); const s = (text: string, offset: number) => b.set([...text].map(c => c.charCodeAt(0)),offset); s('RIFF',0);s('WEBP',8);s('VP8X',12);v.setUint32(4,22,true);b[24]=31;b[25]=3;b[27]=239;return b; }
function jpeg() { const b = new Uint8Array(21); b.set([255,216,255,192,0,17,8,0,240,3,32]); return b; }
afterEach(() => vi.unstubAllGlobals());
describe('Logomarca local da etiqueta', () => {
  it.each([[png(),'image/png'],[jpeg(),'image/jpeg'],[webp(),'image/webp']] as const)('confere assinatura e dimensões %s', (bytes,type) => expect(inspectLogoBytes(bytes,type)).toMatchObject({width:800,height:240,type}));
  it('rejeita SVG ativo e URL arbitrária', () => {
    expect(() => inspectLogoBytes(new TextEncoder().encode('<svg onload="alert(1)"/>'),'image/svg+xml')).toThrow();
    expect(() => validatedLabelLogo({ dataUrl:'https://external.test/logo.png' })).toThrow();
  });
  it('rejeita tipo divergente', () => expect(() => inspectLogoBytes(png(),'image/jpeg')).toThrow());
  it('limita tamanho em 2 MB antes de decodificar', () => expect(() => inspectLogoBytes(new Uint8Array(LOGO_MAX_BYTES+1),'image/png')).toThrow(/2 MB/));
  it.each([[4097,100],[4096,4096],[0,100]])('nega dimensões %s×%s', (w,h) => expect(() => inspectLogoBytes(png(w,h),'image/png')).toThrow());
  it('nega WebP animado', () => { const b=webp();b[20]=2;expect(() => inspectLogoBytes(b,'image/webp')).toThrow(/animadas/); });
  it('nega JPEG truncado e arquivo vazio', () => {
    expect(() => inspectLogoBytes(jpeg().slice(0,8),'image/jpeg')).toThrow();
    expect(() => inspectLogoBytes(new Uint8Array(),'image/png')).toThrow();
  });
  it('ausência mantém layout textual sem logomarca', () => {
    const l = createLooseLabels({...EMPTY_LOOSE_LABEL,company:'Empresa A',product:'Produto',lot:'LT-1',volume:'1'})[0]; if(!l) throw new Error('missing');
    expect(labelLayout(l,'100x150').logo).toBeUndefined();
  });
  it('nega capability forjada ou clonada mesmo com base64', () => expect(() => validatedLabelLogo({dataUrl:'data:image/png;base64,AAAA',width:800,height:240,scope:'A'})).toThrow());
  it('rejeita imagem corrompida e sempre revoga URL temporária', async () => {
    const revoke = vi.fn();vi.stubGlobal('URL',{createObjectURL:()=> 'blob:test',revokeObjectURL:revoke});
    class BrokenImage { onerror?:()=>void; set src(_v:string) { queueMicrotask(()=>this.onerror?.()); } }
    vi.stubGlobal('Image',BrokenImage);
    const bytes=png();const file={size:bytes.length,type:'image/png',arrayBuffer:async()=>bytes.buffer} as File;
    await expect(prepareLabelLogo(file,'tenant-A')).rejects.toThrow(/corrompida/);
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
  it('capability validada é escopada, reencodificada e não transferível para B', async () => {
    const revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:()=> 'blob:test',revokeObjectURL:revoke});
    class DecodedImage { naturalWidth=800;naturalHeight=240;onload?:()=>void;set src(_v:string){queueMicrotask(()=>this.onload?.());} }
    vi.stubGlobal('Image',DecodedImage);
    const context={drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255])}),putImageData:vi.fn()};
    const canvas={width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,AAAA'};
    const create=vi.spyOn(document,'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
    const bytes=png();const file={size:bytes.length,type:'image/png',arrayBuffer:async()=>bytes.buffer} as File;
    const logo=await prepareLabelLogo(file,'tenant-A');create.mockRestore();
    expect(validatedLabelLogo(logo,'tenant-A')).toBe(logo);
    expect(()=>validatedLabelLogo(logo,'tenant-B')).toThrow(/outro contexto/);
    expect(()=>validatedLabelLogo({...logo},'tenant-A')).toThrow();
    expect(context.putImageData.mock.calls[0]?.[0].data.slice(0,3)).toEqual(new Uint8ClampedArray([76,76,76]));
    expect(revoke).toHaveBeenCalledWith('blob:test');
    for(const format of ['100x150','100x100','80x50'] as const){
      const l=createLooseLabels({...EMPTY_LOOSE_LABEL,company:'A',product:'Produto',lot:'LT-1',volume:'1',format},logo,'tenant-A')[0];if(!l)throw new Error('missing');
      const layout=labelLayout(l,format);expect(layout.logo?.height).toBe(format==='80x50'?4.2:format==='100x100'?9:11);
      expect(layout.blocks[1]?.y).toBeGreaterThanOrEqual(3+(layout.logo?.height??0));
    }
  });
});