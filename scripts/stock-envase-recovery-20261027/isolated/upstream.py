"""Canonical upstream bodies already restored; bootstrap only, no authority bypass."""
import json
def run(X):
 T=X.T
 o,p=T.u(3000),T.u(3001)
 # Bootstrap an open OS and existing awaiting program (creation is independently
 # contained); all tested approval/programming/lot/CQ RPCs run enabled/authenticated.
 X.sql(f"BEGIN;SET LOCAL session_replication_role=replica;UPDATE public.produtos SET familia_catalogo='biologico',ativo=true WHERE id='{T.PROD}';INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os,volume_total_ml) VALUES('{o}','{T.A}','{T.C}','{T.u(18)}','{T.u(20)}','{T.PROD}','agronomica','aberta','LOCAL-UPSTREAM',3000);INSERT INTO public.programacao_producao(id,organization_id,ordem_servico_id,produto_id,volume_necessario,status) VALUES('{p}','{T.A}','{o}','{T.PROD}',3000,'aguardando');COMMIT;")
 def invoke(label,s,check):
  data=json.loads(X.last(T.actor()+s)); assert check(data),(label,data);X.ok(label);return data
 invoke('canonical approval positive under added gates',f"SELECT public.rpc_aprovar_os_v1('{o}','manual');",lambda d:d.get('success') is True and d.get('status')=='aprovada')
 invoke('canonical scheduling positive under added gates',f"SELECT public.rpc_programar_os_v1('{o}','manual',current_date);",lambda d:d.get('success') is True and d.get('status')=='programada')
 before=X.snapshot();invoke('canonical scheduling replay under added gates',f"SELECT public.rpc_programar_os_v1('{o}','manual',current_date);",lambda d:d.get('success') is True and d.get('replay') is True);assert X.snapshot()==before
 invoke('canonical lot generation positive under added gates',f"SELECT public.rpc_cockpit_gerar_lote_v1('{p}','{o}','manual','{{\"volume_produzido\":3000}}'::jsonb);",lambda d:d.get('success') is True)
 l=X.last(f"SELECT id FROM public.lotes WHERE programacao_id='{p}';")
 invoke('canonical send CQ positive under added gates',f"SELECT public.rpc_avancar_esteira_laboratorio('{o}','manual','enviar_cq','{p}');",lambda d:d.get('success') is True)
 payload={'lote_id':l,'resultado':'reprovado','ph':7,'concentracao':1,'aparencia':'Normal','odor':'Caracteristico','contaminacao':'Ausente','referencia_id':None,'dados_sinteticos':True}
 stmt=f"SELECT public.rpc_avancar_esteira_laboratorio('{o}','manual','registrar_cq','{p}','{json.dumps(payload)}'::jsonb);"
 invoke('canonical rejected CQ records under added gates without invented reference',stmt,lambda d:d.get('success') is True)
 before=X.snapshot();invoke('canonical CQ replay under added gates preserves history',stmt,lambda d:d.get('success') is True and d.get('replay') is True);assert X.snapshot()==before
 assert X.last(f"SELECT count(*) FROM public.controle_qualidade WHERE lote_id='{l}';")=='1'
 X.reject('rejected canonical CQ cannot authorize envase',T.actor(T.W)+T.envase(o,p,l,[{'tipo_embalagem':'frasco_1L','quantidade':3}],'upstream-deny01'),'PT409')