import { describe, it, expect } from 'vitest';
import { buscaOS, correspondePeriodo, diaSP, volumeOS, unificarOS, validarOS, erroOS, produtoFabricavelOS, lerProdutosFabricaveisOS } from '@/lib/ordens-servico/validacao';
import { readFileSync } from 'node:fs';
const id = '00000000-0000-4000-8000-000000000001';
const form = { cliente_id:id, fazenda_id:id, talhao_id:id, produto_id:id, microrganismo_id:'', tipo_item:'produto', modo_aplicacao:'foliar', area_hectares:'1', data_programada:'2026-09-13', prioridade:'media' };
const refs = { clientes:[{id}], fazendas:[{id,cliente_id:id}], talhoes:[{id,fazenda_id:id}], produtos:[{id,dose_ml_ha:10,familia_catalogo:'biologico'}], microrganismos:[] };
describe('Ordens de serviço seguras', () => {
 it('decoder nega coluna ausente e não adota família inferida', () => {
   expect(() => lerProdutosFabricaveisOS([{id,nome:'item',dose_ml_ha:100}])).toThrow('invalid_product_catalog');
   expect(lerProdutosFabricaveisOS([{id,nome:'item',dose_ml_ha:100,familia_catalogo:null}])).toEqual([]);
   expect(lerProdutosFabricaveisOS([{id,nome:'item',dose_ml_ha:100,familia_catalogo:'biologico'}])).toEqual([{id,nome:'item',dose_ml_ha:100,familia_catalogo:'biologico'}]);
 });
 it('não confunde consulta alfabética com código vazio', () => expect(buscaOS('inexistente',['123','Cliente'])).toBe(false));
 it('normaliza acentos e espaços', () => expect(buscaOS(' joao ',['João'])).toBe(true));
 it('busca vazia inclui registros sem rótulos', () => expect(buscaOS('',[null])).toBe(true));
 it('mantém data civil e converte instante para SP', () => { expect(diaSP('2026-09-13')).toBe('2026-09-13'); expect(diaSP('2026-09-13T01:00:00Z')).toBe('2026-09-12'); });
 it('rejeita datas inexistentes', () => expect(diaSP('2026-02-30')).toBe(''));
 it('semana não inclui futuro e tem sete dias civis', () => { const now = new Date('2026-09-13T12:00:00Z'); expect(correspondePeriodo('2026-09-14','week',now)).toBe(false); expect(correspondePeriodo('2026-09-07','week',now)).toBe(true); expect(correspondePeriodo('2026-09-06','week',now)).toBe(false); });
 it.each([null,0,-1,NaN,Infinity])('não apresenta volume inválido %s', v => expect(volumeOS(v)).toBe('—'));
 it('preserva volume pequeno', () => expect(volumeOS(1)).toBe('0,001 L'));
 it('deduplica sem mesclar origens', () => expect(unificarOS([{id,origem:'manual'},{id,origem:'manual'},{id,origem:'onfarm'}])).toHaveLength(2));
 it('aceita formulário coerente', () => expect(validarOS(form,refs)).toBeNull());
 it.each([null,undefined,'quimico','fertilizante'])('nega família não biológica %s mesmo com dose100', family => {
   const produto = { id, dose_ml_ha:100, familia_catalogo:family };
   expect(produtoFabricavelOS(produto)).toBe(false);
   expect(validarOS(form,{...refs,produtos:[produto]})).not.toBeNull();
 });
 it.each([null,0,-1,NaN,Infinity])('nega dose não finita/positiva de biológico %s', dose => expect(produtoFabricavelOS({familia_catalogo:'biologico',dose_ml_ha:dose})).toBe(false));
 it('aceita família biológico com dose100 e não infere família pelo tipo legado', () => {
   expect(produtoFabricavelOS({familia_catalogo:'biologico',dose_ml_ha:100})).toBe(true);
   expect(produtoFabricavelOS({dose_ml_ha:100})).toBe(false);
 });
 it.each(['0','-1','Infinity',''])('rejeita área %s', area => expect(validarOS({...form,area_hectares:area},refs)).not.toBeNull());
 it('rejeita vínculos divergentes', () => expect(validarOS(form,{...refs,talhoes:[]})).not.toBeNull());
 it('rejeita dose ausente', () => expect(validarOS(form,{...refs,produtos:[{id,dose_ml_ha:null}]})).not.toBeNull());
 it('rejeita data impossível', () => expect(validarOS({...form,data_programada:'2026-02-30'},refs)).not.toBeNull());
 it('não expõe erro bruto', () => { expect(erroOS({code:'42501'})).toContain('permissão'); expect(erroOS({code:'23505'})).toContain('Conflito'); expect(erroOS({message:'secret'})).not.toContain('secret'); });
 it('distingue23514 de fabricabilidade sem expor erro bruto', () => {
   expect(erroOS({code:'23514',message:'LAB_ITEM_NOT_MANUFACTURABLE'})).toContain('não é fabricável');
   expect(erroOS({code:'23514',message:'outro segredo'})).not.toContain('fabricável');
   expect(erroOS({code:'42501',message:'LAB_ITEM_NOT_MANUFACTURABLE'})).toContain('permissão');
 });
 it('mantém falha parcial e trava síncrona', () => { const src = readFileSync('src/pages/OrdensServico.tsx','utf8'); expect(src).toContain('results.some(result => result.error)'); expect(src).toContain('savingRef.current = true'); expect(src).not.toContain('toast.success("Dados atualizados'); expect(src).not.toContain('.update('); });
 it('rastreio usa somente o leitor canônico', () => { const src = readFileSync('src/components/ordens-servico/RastreabilidadeProducaoTab.tsx','utf8'); expect(src).toContain('COCKPIT_LIST_RPC'); expect(src).not.toContain('.from('); expect(src).toContain('cockpit_trace_ambiguous'); });
});
