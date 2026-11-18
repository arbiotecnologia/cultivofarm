import { describe, it, expect } from 'vitest';
import { PRODUCT_DOCUMENTARY_FIELDS, matchingProductEvidence, productResearchIdentity, parseProductEvidenceEnvelope, productEvidenceSchema } from '@/lib/catalogo/productDocumentary';
const id='00000000-0000-4000-8000-000000000001';
const evidence={field:'resumo_curto',value:'Texto documentado',candidate_key:'A',identity:{entity:'produto' as const,id,name:'Produto',manufacturer:'',registration:''},sources:[{url:'https://example.org/ficha',title:'Fabricante',excerpt:'Trecho'}]};
describe('documentação de produto',()=>{
 it('recusa envelope de outro produto e revisão sem perfil',()=>{
  const envelope={product_id:id,profile_id:null,profile_revision:null,evidence:[]};
  expect(parseProductEvidenceEnvelope(envelope,id).evidence).toEqual([]);
  expect(()=>parseProductEvidenceEnvelope(envelope,'outro')).toThrow();
  expect(()=>parseProductEvidenceEnvelope({...envelope,profile_revision:'2026-11-18T03:48:00Z'},id)).toThrow();
 });
 it('exclui preço, estoque, tributos, aprovação, formulação e registro da IA',()=>{
  for(const field of ['valor_ha_brl','estoque_minimo','ncm','status_validacao','formulacoes','observacoes_regulatorias','dose_ml_ha'])expect(PRODUCT_DOCUMENTARY_FIELDS).not.toContain(field);
 });
 it('usa fabricante e registro do dossiê, sem replicar autoridade',()=>{
  expect(productResearchIdentity({id,nome:'Produto',funcao_completa:'Finalidade'},{mapa_manufacturer:'Fabricante',mapa_registration_number:'Registro',strain_name:'Cepa'})).toEqual({entity:'produto',id,name:'Produto',manufacturer:'Fabricante',registration:'Registro',strain:'Cepa',purpose:'Finalidade',researchScope:'product_strain'});
 });
 it('filtra evidência alterada manualmente ou de outro produto',()=>{
  expect(matchingProductEvidence([evidence],{resumo_curto:'Manual'},id,'Produto')).toEqual([]);
  expect(matchingProductEvidence([evidence],{resumo_curto:evidence.value},'outro','Produto')).toEqual([]);
  expect(matchingProductEvidence([evidence],{resumo_curto:evidence.value},id,'Produto')).toEqual([evidence]);
 });
 it('rejeita fontes inseguras antes do writer',()=>{
  expect(()=>matchingProductEvidence([{...evidence,sources:[{...evidence.sources[0],url:'javascript:alert(1)'}]}],{resumo_curto:evidence.value},id,'Produto')).toThrow();
 });
 it('reabertura mantém evidência reconciliada na revisão atual e histórico anterior separado',()=>{
  const envelope={product_id:id,profile_id:id,profile_revision:'2026-11-18T04:24:00Z',evidence:[evidence],history:{profile_id:id,profile_revision:'2026-11-18T04:00:00Z',evidence:[evidence]}};
  const parsed=parseProductEvidenceEnvelope(envelope,id);
  expect(parsed.evidence).toEqual([evidence]);
  expect(parsed.history?.profile_revision).toBe('2026-11-18T04:00:00Z');
  expect(parseProductEvidenceEnvelope({...envelope,evidence:[]},id).history?.evidence).toEqual([evidence]);
 });
 it('histórico não pode substituir revisão atual ou conter identidade estrangeira',()=>{
  const envelope={product_id:id,profile_id:id,profile_revision:'2026-11-18T04:24:00Z',evidence:[],history:{profile_id:id,profile_revision:'2026-11-18T04:24:00Z',evidence:[evidence]}};
  expect(()=>parseProductEvidenceEnvelope({...envelope,history:{...envelope.history,profile_revision:'2026-11-18T04:25:00Z'}},id)).toThrow();
  expect(()=>parseProductEvidenceEnvelope({...envelope,evidence:[evidence]},id)).toThrow();
  expect(()=>parseProductEvidenceEnvelope({...envelope,history:{...envelope.history,profile_revision:'2026-11-18T04:00:00Z',evidence:[{...evidence,identity:{...evidence.identity,id:'00000000-0000-4000-8000-000000000002'}}]}},id)).toThrow();
 });
});
describe('identidade documental estrita',()=>{
 for (const field of ['manufacturer','registration','name','id'] as const) {
  it.each([undefined, null, 17])(`recusa ${field} ausente/null/número`, value=>{
   const identity: Record<string,unknown>={...evidence.identity,[field]:value};
   if(value===undefined)delete identity[field];
   expect(()=>productEvidenceSchema.parse([{...evidence,identity}])).toThrow();
  });
 }
 it.each(['name','manufacturer','registration'] as const)('limita %s a 1000 caracteres',field=>{
  expect(productEvidenceSchema.parse([{...evidence,identity:{...evidence.identity,[field]:'a'.repeat(1000)}}])).toHaveLength(1);
  expect(()=>productEvidenceSchema.parse([{...evidence,identity:{...evidence.identity,[field]:'a'.repeat(1001)}}])).toThrow();
 });
 it('opcionais têm shape e limites, sem propriedades desconhecidas',()=>{
  expect(productEvidenceSchema.parse([{...evidence,identity:{...evidence.identity,purpose:'a'.repeat(2000),researchScope:'product_strain'}}])).toHaveLength(1);
  for(const identity of [{...evidence.identity,purpose:null},{...evidence.identity,purpose:'a'.repeat(2001)},{...evidence.identity,researchScope:42},{...evidence.identity,unknown:'x'}])expect(()=>productEvidenceSchema.parse([{...evidence,identity}])).toThrow();
 });
 it('renomeação retira fontes ativas sem reescrever nome/candidato de origem, inclusive mesma revisão',()=>{
  expect(matchingProductEvidence([evidence],{resumo_curto:evidence.value},id,'Renomeado')).toEqual([]);
  const revision='2026-11-18T04:35:00Z';
  const parsed=parseProductEvidenceEnvelope({product_id:id,profile_id:id,profile_revision:revision,evidence:[],history:{profile_id:id,profile_revision:revision,evidence:[evidence]}},id);
  expect(parsed.history?.evidence).toEqual([evidence]);
  expect(parsed.history?.evidence[0].identity.name).toBe('Produto');
 });
});
