"""Offline review assembly only. No connections, no migrations/autodeploy paths."""
from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent
REF='swzpzcwiasxmjutrmvkm'
q=lambda s:"'"+s.replace("'","''")+"'"
BASE={
'public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid)':('c159638f8e2b7bcb4c8c04fd457592cb','{postgres=X/postgres,service_role=X/postgres}'),
'platform_private.guard_manual_lot_write_v1()':('8db8d23862936928529e073117bb9e15','{postgres=X/postgres}'),
'public.check_os_status_transition()':('496a214d87fc831a53b2f16d3524ddea','{postgres=X/postgres,service_role=X/postgres}'),
'public.fn_cq_aprovado_avanca_os()':('a5ea5580e8ceb0616e1d83c9c6f11e28','{postgres=X/postgres,service_role=X/postgres}'),
'private.h7n_esteira_laboratorio()':('bad38b5200629cc887767e62b7a46e40','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
'public.fn_cq_autoria_servidor()':('33f665a1fbc3377b1f909effb5ef5a43','{postgres=X/postgres,service_role=X/postgres}'),
'public.fn_cq_resultado_imutavel()':('f7bc6980729dbef8f06aaf9d412ae291','{postgres=X/postgres,service_role=X/postgres}'),
'public.fn_sync_os_classica_downstream()':('06e64b76968f91e19f03b24363ac610a','{postgres=X/postgres,service_role=X/postgres}'),
'public._refresh_esteira_laboratorio_after_change()':('2f361c1fd9de578cf45796d82f3754e0','{postgres=X/postgres,service_role=X/postgres}'),
'public.refresh_esteira_laboratorio()':('bbb2e580bfc6ffddfa833f950c38e0f3','{postgres=X/postgres,service_role=X/postgres}'),
'platform_private.h15_actor_organization()':('64e10608403238a41a9baf92857ca881','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
'platform_private.lab_item_is_manufacturable(uuid,uuid)':('853595394240e8f2a61ac2d621118271','{postgres=X/postgres}'),
'public.technical_actor_ready(uuid)':('b5d0994b6eb976b14122cd2a1ec798cf','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
'public._saas_user_has_feature(uuid,text)':('501dd958e117d2df8a4d38f6bcbeed04','{postgres=X/postgres,service_role=X/postgres}'),
'public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)':('04d54f538952afc9bfcd29991f55b724',None),
}
TABLES=[
('controle_qualidade','{postgres=arwdDxtm/postgres,anon=arwdm/postgres,authenticated=arwdm/postgres,service_role=arwdDxtm/postgres}','7b243eb5ec78ddb853482d87bfe557f7','bf68d935dbc04146b7f33139cb5fb99f','568de7e21732569a28800937144da4bd'),
('cq_parametros_referencia','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=rm/postgres,service_role=arwdDxtm/postgres}','2e521a3b3c4e459e5ab9b5f8e52d06ee','7456ac326dd85bb7d22b5f48b22a3d65','086d698024efa3fb9448a34bea41655f'),
('lotes','{postgres=arwdDxtm/postgres,anon=arwd/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}','9ec8b0348eaa6a1416e753d00a7f7216','5ad7698636d5364d1ac7cd818669051a','e52025f988e6e693c8ba9a2fa868db1f'),
('ordens_servico','{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}','141cda71ffbcadb023dfaa945bb1465c','b4cdb9fa3090c60650ed052dd6c90fcf','a6bc5db4e1f0ab992f260033290f0d23'),
('programacao_producao','{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}','c6c77ef26665c428577e407b65408afc','d67e2052cf43f3fca4b2e53a7f812282','3517bb22d1bec05daae0d4ed3441e63d'),
('cockpit_operacao_idempotencia','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}','bc6717f7d08c3d9cadd7feea256e50eb','d41d8cd98f00b204e9800998ecf8427e','84a8613294ad2e297c5db942b5731be3'),
('laboratorio_esteira_eventos','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}','7d717abc7a2c6b4d8125e7a25a9aaf5a','d41d8cd98f00b204e9800998ecf8427e','cff54c5dfe24beec6da66f1ae14335bf'),
]
NEW=['platform_private.manual_cq_v1(uuid,uuid,jsonb)','platform_private.guard_manual_cq_write_v1()','platform_private.guard_manual_cq_parent_v1()','public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid,jsonb)']
ADDED={'controle_qualidade':'aa_manual_cq_write_fence_v1','ordens_servico':'aa_manual_cq_parent_v1','programacao_producao':'aa_manual_cq_parent_v1'}

def full(s):return s if s.startswith(('platform_private.','private.','public.')) else 'public.'+s

def guard(mode):
 post={full(k):v for k,v in json.loads((H/'post-hashes.json').read_text()).items()}
 expected=dict(BASE)
 if mode!='pre':
  for k,v in post.items():expected[k]=(v,BASE.get(k,(None,'{postgres=X/postgres}'))[1])
  for s in ['public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid)','public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid,jsonb)']:expected[s]=(post[s],'{postgres=X/postgres,authenticated=X/postgres}')
 if mode=='rollback':
  for s in ['public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid)','platform_private.guard_manual_lot_write_v1()','public.check_os_status_transition()']:expected[s]=BASE[s]
  expected[NEW[-1]]=(post[NEW[-1]],'{postgres=X/postgres}')
 lines=['DO $guard$ BEGIN',f"IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM {q(REF)} THEN RAISE EXCEPTION 'WRONG_PROJECT';END IF;"]
 for sig,(h,a) in expected.items():
  extra=' AND proacl::text='+q(a) if a else ''
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(sig)}) AND md5(pg_get_functiondef(oid))={q(h)} AND proowner='postgres'::regrole{extra}) THEN RAISE EXCEPTION 'FUNCTION_DRIFT: %',{q(sig)};END IF;")
 if mode=='pre':
  for sig in NEW:lines.append(f"IF to_regprocedure({q(sig)}) IS NOT NULL THEN RAISE EXCEPTION 'NEW_FUNCTION_ALREADY_EXISTS: %',{q(sig)};END IF;")
 for table,acl,sch,trig,pol in TABLES:
  name=q('public.'+table);omit=" AND tgname<>"+q(ADDED[table]) if mode!='pre' and table in ADDED else ''
  lines += [f"IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid={name}::regclass AND relowner='postgres'::regrole AND relacl::text={q(acl)} AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION 'TABLE_ACL_RLS_DRIFT: %',{name};END IF;",
  f"IF (SELECT md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),'|' ORDER BY a.attnum)) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid={name}::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM {q(sch)} THEN RAISE EXCEPTION 'SCHEMA_DRIFT: %',{name};END IF;",
  f"IF (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid)||':'||tgenabled::text,'|' ORDER BY tgname),'')) FROM pg_trigger WHERE tgrelid={name}::regclass AND NOT tgisinternal{omit}) IS DISTINCT FROM {q(trig)} THEN RAISE EXCEPTION 'TRIGGERS_DRIFT: %',{name};END IF;",
  f"IF (SELECT md5(coalesce(string_agg(polname||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),'')||':'||polroles::text||':'||polcmd::text||':'||polpermissive::text,'|' ORDER BY polname),'')) FROM pg_policy WHERE polrelid={name}::regclass) IS DISTINCT FROM {q(pol)} THEN RAISE EXCEPTION 'POLICY_DRIFT: %',{name};END IF;"]
  if mode!='pre' and table in ADDED:
   fn='platform_private.guard_manual_cq_write_v1()' if table=='controle_qualidade' else 'platform_private.guard_manual_cq_parent_v1()'
   lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid={name}::regclass AND tgname={q(ADDED[table])} AND tgenabled='O' AND tgfoid={q(fn)}::regprocedure AND tgtype={31 if table=='controle_qualidade' else 19}) THEN RAISE EXCEPTION 'NEW_TRIGGER_DRIFT';END IF;")
 # All immutable dependency schema/constraints and auth/SaaS functions from prior independently reviewed package; targets overridden above.
 old=json.loads((H.parent/'lot-generation-canonical-20261020/catalog.json').read_text())
 for sig,h,a in old['functions']:
  if sig in expected or sig=='private.h7n_esteira_laboratorio()':continue
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(sig)}) AND md5(pg_get_functiondef(oid))={q(h)} AND proacl::text={q(a)}) THEN RAISE EXCEPTION 'DEPENDENCY_DRIFT: %',{q(sig)};END IF;")
 for table in ['programacao_producao','production_order_link','entregas','aplicacoes']:
  definition='FOREIGN KEY (ordem_servico_id) REFERENCES ordens_servico(id)'+(' ON DELETE CASCADE' if table in ['programacao_producao','production_order_link'] else '')
  lines.append(f"IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid={q('public.'+table)}::regclass AND conname={q(table+'_ordem_servico_id_fkey')} AND convalidated AND NOT condeferrable AND pg_get_constraintdef(oid)={q(definition)}) THEN RAISE EXCEPTION 'PHANTOM_FK_DRIFT';END IF;")
 lines.append("IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='platform_private.authz_tickets'::regclass AND relowner='postgres'::regrole AND relrowsecurity AND relacl::text='{postgres=arwdDxtm/postgres}') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='platform_private.authz_tickets'::regclass) THEN RAISE EXCEPTION 'PRIVATE_TICKET_DRIFT';END IF;")
 lines.append('END $guard$;');return '\n'.join(lines)+'\n'

def main():
 head='-- REVIEW ONLY. NO HOSTED EXECUTION. Canonical '+REF+'; no fixture/data writes.\n'
 tx="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';\n"
 acl=''
 for s in ['public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid)',NEW[-1]]:acl+=f'REVOKE ALL ON FUNCTION {s} FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION {s} TO authenticated;\n'
 body=''.join((H/f).read_text()+'\n' for f in ['lot-guard.sql.review','guards.sql.review','cq-trigger.sql.review','transition.sql.review','reader.sql.review','core.sql.review'])
 for mode,file in [('pre','preflight-readonly.sql'),('post','postflight-readonly.sql'),('rollback','rollback-postflight-readonly.sql')]: (H/file).write_text(head+'BEGIN READ ONLY;\n'+guard(mode)+'ROLLBACK;\n')
 (H/'candidate.sql.review').write_text(head+tx+guard('pre')+body+acl+guard('post')+'COMMIT;\n')
 rollback=(H/'rollback/advance-rpc.sql.review').read_text()+f'REVOKE ALL ON FUNCTION {NEW[-1]} FROM PUBLIC,anon,authenticated,service_role;\nREVOKE ALL ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid,text,text,uuid) TO service_role;\n'+(H/'rollback/manual-write-guard.sql.review').read_text().split('CREATE TRIGGER')[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)+(H/'rollback/check_os_status_transition.sql.review').read_text()
 (H/'rollback.sql.review').write_text(head+tx+guard('post')+rollback+guard('rollback')+'COMMIT;\n')
 manifest={'baseline':'afa2417fb2ac305636b9bc82786d62ae9af0a632','canonical_ref':REF,'applied':False,'runtime_changed':False,'gate':'MANUAL_CQ_REVIEWED=false','files':{}}
 for p in sorted(H.rglob('*')):
  if p.is_file() and p.name!='manifest.json' and '__pycache__' not in p.parts:manifest['files'][str(p.relative_to(H))]=hashlib.sha256(p.read_bytes()).hexdigest()
 (H/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if __name__=='__main__':main()
