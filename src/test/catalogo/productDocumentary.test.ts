import { describe, it, expect } from 'vitest';
import { PRODUCT_DOCUMENTARY_FIELDS, matchingProductEvidence, productResearchIdentity } from '@/lib/catalogo/productDocumentary';
const id='00000000-0000-4000-8000-000000000001';
const evidence={field:'resumo_curto',value:'Texto documentado',identity:{entity:'produto' as const,id,name:'Produto',manufacturer:'',registration:''},sources:[{url:'https://example.org/ficha',title:'Fabricante',excerpt:'Trecho'}]};
describe('documentação de produto',()=>{
 it('exclui preço, estoque, tributos, aprovação, formulação e registro da IA',()=>{
  for(const field of ['valor_ha_brl','estoque_minimo','ncm','status_validacao','formulacoes','observacoes_regulatorias','dose_ml_ha'])expect(PRODUCT_DOCUMENTARY_FIELDS).not.toContain(field);
 });
 it('usa fabricante e registro do dossiê, sem replicar autoridade',()=>{
  expect(productResearchIdentity({id,nome:'Produto',funcao_completa:'Finalidade'},{mapa_manufacturer:'Fabricante',mapa_registration_number:'Registro',strain_name:'Cepa'})).toEqual({entity:'produto',id,name:'Produto',manufacturer:'Fabricante',registration:'Registro',strain:'Cepa',purpose:'Finalidade',researchScope:'product_strain'});
 });
 it('filtra evidência alterada manualmente ou de outro produto',()=>{
  expect(matchingProductEvidence([evidence],{resumo_curto:'Manual'},id)).toEqual([]);
  expect(matchingProductEvidence([evidence],{resumo_curto:evidence.value},'outro')).toEqual([]);
  expect(matchingProductEvidence([evidence],{resumo_curto:evidence.value},id)).toEqual([evidence]);
 });
 it('rejeita fontes inseguras antes do writer',()=>{
  expect(()=>matchingProductEvidence([{...evidence,sources:[{...evidence.sources[0],url:'javascript:alert(1)'}]}],{resumo_curto:evidence.value},id)).toThrow();
 });
});
