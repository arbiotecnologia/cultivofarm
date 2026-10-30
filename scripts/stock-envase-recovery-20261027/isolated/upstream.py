"""Canonical upstream bodies already restored; bootstrap only, no authority bypass."""
import json,re
def run(X):
 T=X.T
 o,p=T.u(3000),T.u(3001)
 # Bootstrap an open OS and existing awaiting program (creation is independently
 # contained); all tested approval/programming/lot/CQ RPCs run enabled/authenticated.
 X.sql(f"BEGIN;SET LOCAL session_replication_role=replica;UPDATE public.produtos SET familia_catalogo='biologico',ativo=true WHERE id='{T.PROD}';INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os,volume_total_ml) VALUES('{o}','{T.A}','{T.C}','{T.u(18)}','{T.u(20)}','{T.PROD}','agronomica','aberta','LOCAL-UPSTREAM',3000);INSERT INTO public.programacao_producao(id,organization_id,ordem_servico_id,produto_id,volume_necessario,status) VALUES('{p}','{T.A}','{o}','{T.PROD}',3000,'aguardando');COMMIT;")
 def invoke(label,s,check):
  data=json.loads(X.last(T.actor()+s)); assert check(data),(label,data);X.ok(label);return data
 def contention(label,s):
  before=X.snapshot()
  holder=T.T.session('BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;')
  try:
   X.reject(label,T.actor()+s,'55P03')
   assert X.snapshot()==before
  finally:T.T.finish(holder,'ROLLBACK;')
 contention('canonical approval during held envase gate refuses 55P03 without writes',f"SELECT public.rpc_aprovar_os_v1('{o}','manual');")
 invoke('canonical approval positive under added gates',f"SELECT public.rpc_aprovar_os_v1('{o}','manual');",lambda d:d.get('success') is True and d.get('status')=='aprovada')
 contention('canonical scheduling during held envase gate refuses 55P03 without writes',f"SELECT public.rpc_programar_os_v1('{o}','manual',current_date);")
 invoke('canonical scheduling positive under added gates',f"SELECT public.rpc_programar_os_v1('{o}','manual',current_date);",lambda d:d.get('success') is True and d.get('status')=='programada')
 before=X.snapshot();invoke('canonical scheduling replay under added gates',f"SELECT public.rpc_programar_os_v1('{o}','manual',current_date);",lambda d:d.get('success') is True and d.get('replay') is True);assert X.snapshot()==before
 contention('canonical lot generation during held envase gate refuses 55P03 without writes',f"SELECT public.rpc_cockpit_gerar_lote_v1('{p}','{o}','manual','{{\"volume_produzido\":3000}}'::jsonb);")
 invoke('canonical lot generation positive under added gates',f"SELECT public.rpc_cockpit_gerar_lote_v1('{p}','{o}','manual','{{\"volume_produzido\":3000}}'::jsonb);",lambda d:d.get('success') is True)
 l=X.last(f"SELECT id FROM public.lotes WHERE programacao_id='{p}';")
 contention('canonical CQ send during held envase gate refuses 55P03 without writes',f"SELECT public.rpc_avancar_esteira_laboratorio('{o}','manual','enviar_cq','{p}');")
 invoke('canonical send CQ positive under added gates',f"SELECT public.rpc_avancar_esteira_laboratorio('{o}','manual','enviar_cq','{p}');",lambda d:d.get('success') is True)
 payload={'lote_id':l,'resultado':'reprovado','ph':7,'concentracao':1,'aparencia':'Normal','odor':'Caracteristico','contaminacao':'Ausente','referencia_id':None,'dados_sinteticos':True}
 stmt=f"SELECT public.rpc_avancar_esteira_laboratorio('{o}','manual','registrar_cq','{p}','{json.dumps(payload)}'::jsonb);"
 contention('canonical CQ recording during held envase gate refuses 55P03 without writes',stmt)
 invoke('canonical rejected CQ records under added gates without invented reference',stmt,lambda d:d.get('success') is True)
 before=X.snapshot();invoke('canonical CQ replay under added gates preserves history',stmt,lambda d:d.get('success') is True and d.get('replay') is True);assert X.snapshot()==before
 assert X.last(f"SELECT count(*) FROM public.controle_qualidade WHERE lote_id='{l}';")=='1'
 X.reject('rejected canonical CQ cannot authorize envase',T.actor(T.W)+T.envase(o,p,l,[{'tipo_embalagem':'frasco_1L','quantidade':3}],'upstream-deny01'),'P0001')
 # The reference is a synthetic catalogue fixture, not a ticket or a specification
 # for production. The real core resolves it and creates all CQ/history itself.
 o2,p2,ref=T.u(3010),T.u(3011),T.u(3012)
 X.sql(f"BEGIN;SET LOCAL session_replication_role=replica;INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os,volume_total_ml) VALUES('{o2}','{T.A}','{T.C}','{T.u(18)}','{T.u(20)}','{T.PROD}','agronomica','aberta','LOCAL-UPSTREAM-APPROVED',3000);INSERT INTO public.programacao_producao(id,organization_id,ordem_servico_id,produto_id,volume_necessario,status) VALUES('{p2}','{T.A}','{o2}','{T.PROD}',3000,'aguardando');INSERT INTO public.cq_parametros_referencia(id,produto_id,ativo,ph_min,ph_max,concentracao_min_ufc_ml,aparencia_esperada,odor_esperado,contaminacao_esperada) VALUES('{ref}','{T.PROD}',true,6,8,1000000000,'LOCAL','LOCAL','AUSENTE');COMMIT;")
 invoke('second canonical approval for approved CQ chain',f"SELECT public.rpc_aprovar_os_v1('{o2}','manual');",lambda d:d.get('success') is True)
 invoke('second canonical programming for approved CQ chain',f"SELECT public.rpc_programar_os_v1('{o2}','manual',current_date);",lambda d:d.get('success') is True)
 invoke('second canonical lot creates authoritative event',f"SELECT public.rpc_cockpit_gerar_lote_v1('{p2}','{o2}','manual','{{\"volume_produzido\":3000}}'::jsonb);",lambda d:d.get('success') is True)
 l2=X.last(f"SELECT id FROM public.lotes WHERE programacao_id='{p2}';")
 invoke('second canonical CQ send creates private receipt',f"SELECT public.rpc_avancar_esteira_laboratorio('{o2}','manual','enviar_cq','{p2}');",lambda d:d.get('success') is True)
 approved={'lote_id':l2,'resultado':'aprovado','ph':7,'concentracao':1000000000,'aparencia':'LOCAL','odor':'LOCAL','contaminacao':'AUSENTE','referencia_id':ref,'dados_sinteticos':True}
 invoke('approved CQ canonical positive resolves actual synthetic reference',f"SELECT public.rpc_avancar_esteira_laboratorio('{o2}','manual','registrar_cq','{p2}','{json.dumps(approved)}'::jsonb);",lambda d:d.get('success') is True and d.get('resultado')=='aprovado')
 data=json.loads(X.last(T.actor(T.W)+T.envase(o2,p2,l2,[{'tipo_embalagem':'frasco_1L','quantidade':3}],'canonical-chain01')))
 assert data['success'] is True and data['estado']=='completed' and T.os_status(o2)=='pronto_entrega'
 X.ok('full canonical approval programming lot approved CQ envase chain under enabled gates')