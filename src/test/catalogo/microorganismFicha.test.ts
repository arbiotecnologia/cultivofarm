import {expect,it,vi} from 'vitest';
import {microDraft,microPayload,saveMicroFicha,fetchMicroFicha} from '@/lib/catalogo/microorganismFicha';
const id='00000000-0000-4000-8000-000000000001';
const org='00000000-0000-4000-8000-000000000011';
const row={id,nome:'Global',descricao:null,updated_at:'2026-11-18T00:00:00Z',owner_organization_id:null};
function readClient(rows: unknown[], profiles: unknown[] = [null,null]) {
  const rpc=vi.fn();
  const from=vi.fn((table:string)=>{
    const response={data:(table==='microrganismos'?rows:profiles).shift(),error:null};
    const query={select:()=>query,eq:()=>query,abortSignal:()=>query,single:()=>Promise.resolve(response),maybeSingle:()=>Promise.resolve(response)};
    return query;
  });
  return {from,rpc};
}
it('global usa consulta RLS canônica sem reader privado próprio',async()=>{
  const client=readClient([row,row]);
  expect((await fetchMicroFicha(client,id,org,new AbortController().signal)).row.id).toBe(id);
  expect(client.rpc).not.toHaveBeenCalled();
});
it('nega resposta de outro tenant antes do complemento',async()=>{
  const client=readClient([{...row,owner_organization_id:'00000000-0000-4000-8000-000000000012'}]);
  await expect(fetchMicroFicha(client,id,org,new AbortController().signal)).rejects.toThrow('fora do escopo');
  expect(client.rpc).not.toHaveBeenCalled();
});
it('rejeita leitura rasgada de versão raiz',async()=>{
  const client=readClient([row,{...row,updated_at:'2026-11-18T00:01:00Z'}]);
  await expect(fetchMicroFicha(client,id,org,new AbortController().signal)).rejects.toThrow('mudou durante');
});
it('rejeita schema inválido antes de adotar ficha',async()=>{
  const client=readClient([{...row,id:'foreign'}]);
  await expect(fetchMicroFicha(client,id,org,new AbortController().signal)).rejects.toThrow();
  expect(client.rpc).not.toHaveBeenCalled();
});
it('concentração canônica preserva texto e não converte unidade',()=>{
  const baseline=microDraft({...row,concentracao_ufc_ml:1000000,concentracao_label:'Documento original'});
  expect(microPayload({...baseline,concentracao_ufc_ml:'2000000'},baseline)).toEqual({root:{concentracao_ufc_ml:'2000000'},content:{},extra:{}});
});
it.each(['NaN','-1','0','Infinity'])('nega concentração quantitativa %s',value=>{
  const baseline=microDraft(row);
  expect(()=>microPayload({...baseline,concentracao_ufc_ml:value},baseline)).toThrow('positiva e finita');
});
it('preserva identidade e campos não alterados sem gravar status',()=>{const baseline=microDraft({nome:'Original',codigo:'BAC-27',tipo:'bacteria'});expect(microPayload({...baseline,cepa:'Cepa A'},baseline)).toEqual({root:{},content:{},extra:{cepa:'Cepa A'}});});
it('envia evidência e revisões observadas na mesma chamada',async()=>{const rpc=vi.fn().mockResolvedValue({data:{ok:true,id:'micro-A',updated_at:'2026-11-18',replayed:false},error:null});const baseline=microDraft({nome:'Original'});const evidence=[{field:'resumo_curto',value:'Fonte',identity:{name:'Original',manufacturer:'',registration:'',entity:'microrganismo' as const},sources:[{url:'https://example.org/ficha',title:'Documento',excerpt:'Trecho'}]}];await saveMicroFicha({rpc},'micro-A','root-v1','profile-v2',{...baseline,resumo_curto:'Fonte'},baseline,evidence,'key');expect(rpc).toHaveBeenCalledOnce();expect(rpc.mock.calls[0][1]).toMatchObject({p_expected_updated_at:'root-v1',p_expected_profile_updated_at:'profile-v2',p_evidence:evidence,p_payload:{content:{resumo_curto:'Fonte'}}});});
it('nega salvar sem versão observada',async()=>{const rpc=vi.fn();await expect(saveMicroFicha({rpc},'micro-A',null,null,microDraft({nome:'Original'}),{},[],'key')).rejects.toThrow('Versão observada');expect(rpc).not.toHaveBeenCalled();});
it('recusa ACK de outro micro',async()=>{const rpc=vi.fn().mockResolvedValue({data:{ok:true,id:'foreign',replayed:false},error:null});await expect(saveMicroFicha({rpc},'micro-A','v',null,microDraft({nome:'Original'}),{},[],'key')).rejects.toThrow('outro registro');});
it('conflito não repete escrita automaticamente',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'PT409'}});await expect(saveMicroFicha({rpc},'micro-A','v',null,microDraft({nome:'Original'}),{},[],'key')).rejects.toThrow('Rascunho preservado');expect(rpc).toHaveBeenCalledOnce();});
