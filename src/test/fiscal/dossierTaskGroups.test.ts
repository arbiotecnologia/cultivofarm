import {describe,it,expect} from 'vitest';
import {groupedDossierPendencies} from '@/components/fiscal/dossierTaskGroups';
describe('bloqueios compactos do dossiê',()=>{
 const p={code:'LABEL',field:'documents',layer:'REGULATORY',message:'Rótulo pendente',items:['A','B']};
 it('deduplica apenas o mesmo bloqueio com ordem equivalente de itens',()=>{
   expect(groupedDossierPendencies([p,{...p,items:['B','A']}])[0].pendencies).toHaveLength(1);
 });
 it.each([{code:'OTHER'},{field:'notes'},{layer:'FISCAL'},{message:'Laudo pendente'},{items:['A']}])('conserva bloqueio distinto %j',difference=>{
   expect(groupedDossierPendencies([p,{...p,...difference}]).flatMap(g=>g.pendencies)).toHaveLength(2);
 });
});