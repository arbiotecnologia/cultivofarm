"""Assemble review SQL locally; never connects to a database or modifies preserved packages."""
from pathlib import Path
import json
H=Path(__file__).resolve().parent
contracts=[
 ('public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])','46d342a71f4712056782cf3d976154a5',False,'v','search_path=""'),
 ('platform_private.storage1_application_allowed(text,text)','fa4f590bec955e4a254a906fbda82e20',True,'s','search_path=""'),
 ('public.can_user_access_aplicacao(uuid)','04067ba43cea3eed845a1fd3735061e0',True,'s','search_path=public'),
 ('public.can_user_manage_aplicacao(uuid)','b8f4c49dd9b13d4aeecef0e6c76c105a',True,'s','search_path=public'),
 ('public.can_user_create_aplicacao_for_cliente(uuid)','b83a0bc8906b5e9f68ac6b7c9338d703',True,'s','search_path=public, pg_temp'),
 ('public.can_user_access_cliente(uuid)','4c2eaf7ab10e204e7ad57d41cb418554',True,'s','search_path=public'),
 ('public.get_cliente_ids_for_user(uuid)','c80d5900692d960f649d0a9f7850fe2c',True,'v','search_path=public'),
 ('public.h15_actor_organization()','55edafec08bcc84a00f1526c14334a2c',False,'s','search_path=""'),
 ('platform_private.h15_actor_organization()','64e10608403238a41a9baf92857ca881',True,'s','search_path=""'),
 ('platform_private.platform_actor_access_ready(uuid)','048249c0c2106c3761e26eacb8d0de84',True,'s','search_path=""'),
 ('public.has_role(uuid,public.app_role)','4d90e93d521a4819d9085f28d742030f',False,'s','search_path=""'),
 ('platform_private.has_role(uuid,public.app_role)','c5af5b55de6d79da9b73a33948746ae2',True,'s','search_path=""'),
 ('public.aplicacao_storage_path_permitido(text,text)','f5bebda2f411b7161f37a6c9c2bbf3f4',False,'s','search_path=""'),
 ('public.storage1_path_strict(text)','94164fa3b90088b0a1f16ac465a635d4',False,'i','search_path=""'),
 ('public.has_active_user_cliente_access(uuid,uuid,text[])','e099f51d128620e5a68cc3e9001dd976',True,'s','search_path=public'),
 ('platform_private.storage2_salvar_aplicacao_legacy_closed(uuid,jsonb,uuid,jsonb,uuid[])','bd546d19ae6598ba0db5837b83ef398d',True,'v','search_path=public, pg_temp')]
schema="""SELECT md5(string_agg(x,'|' ORDER BY x)) FROM (
SELECT 'column:'||table_schema||'.'||table_name||':'||column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'') AS x FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('aplicacoes','aplicacao_evidencias','aplicacao_evidencias_vinculos','ordens_servico','ordens_servico_onfarm','clientes','produtos','lotes','profiles','user_roles','user_clientes','organizations')
UNION ALL SELECT 'constraint:'||conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.aplicacoes'::regclass,'public.aplicacao_evidencias'::regclass,'public.aplicacao_evidencias_vinculos'::regclass)
UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||':'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'') FROM pg_policies WHERE (schemaname='public' AND tablename IN ('aplicacoes','aplicacao_evidencias','aplicacao_evidencias_vinculos')) OR (schemaname='storage' AND (policyname LIKE 'storage1%' OR policyname LIKE 'aplicacao%'))
UNION ALL SELECT 'trigger:'||t.tgrelid::regclass::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.aplicacoes'::regclass,'public.aplicacao_evidencias'::regclass,'public.aplicacao_evidencias_vinculos'::regclass)) catalog"""
def quote(s):return "'"+s.replace("'","''")+"'"
def guard(post=False):
 rows=[];hashes=json.loads((H/'post-hashes.local.json').read_text())
 for sig,md5,sec,vol,config in contracts:
  if post and sig.startswith('public.rpc_salvar_aplicacao_v1'):md5=hashes['rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])'];sec=True
  if post and sig.startswith('platform_private.storage1_application_allowed'):md5=hashes['platform_private.storage1_application_allowed(text,text)']
  rows.append('('+','.join([quote(sig),quote(md5),'true' if sec else 'false',quote(vol),quote(config),'true' if 'legacy_closed' in sig else 'false'])+')')
 return """DO $guard$ DECLARE c record; p record; v_executor_roles text[]; BEGIN
IF ("""+schema+""") IS DISTINCT FROM 'ab90301d6806c9777da6ecceb7b953f8' THEN RAISE EXCEPTION 'application_schema_policy_trigger_drift'; END IF;
FOR c IN SELECT * FROM (VALUES """+','.join(rows)+""") v(sig,hash,sec,vol,config,closed) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(c.sig);
 IF NOT FOUND THEN RAISE EXCEPTION 'application_dependency_missing: %',c.sig; END IF;
 IF md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM c.hash OR pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
 OR p.prosecdef IS DISTINCT FROM c.sec OR p.provolatile::text IS DISTINCT FROM c.vol OR p.proconfig IS DISTINCT FROM ARRAY[c.config]::text[]
 THEN RAISE EXCEPTION 'application_dependency_drift: %',c.sig; END IF;
 SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)
 INTO v_executor_roles FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE';
 IF v_executor_roles IS DISTINCT FROM (CASE WHEN c.closed THEN ARRAY['postgres'] ELSE ARRAY['authenticated','postgres','service_role'] END)
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND (a.grantor<>p.proowner OR (a.grantee<>p.proowner AND a.is_grantable)))
 THEN RAISE EXCEPTION 'application_dependency_acl_drift: %',c.sig; END IF;
END LOOP;
END $guard$;
"""
before=guard();after=guard(True)
grants="""REVOKE ALL ON FUNCTION public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]),platform_private.storage1_application_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]),platform_private.storage1_application_allowed(text,text) TO authenticated,service_role;
"""
candidate="-- REVIEW ONLY. Executor MUST prove exact ref swzpzcwiasxmjutrmvkm outside SQL; no automatic execution.\nBEGIN;\nSET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';\n"+before+"DO $$BEGIN IF to_regclass('platform_private.application_save_preparations') IS NOT NULL THEN RAISE EXCEPTION 'application_receipt_destination_occupied'; END IF; END$$;\n"+''.join((H/f).read_text() for f in ['setup.sql.review','function.sql.review','storage.sql.review'])+grants+'-- POSTCHECK\n'+after+'COMMIT;\n'
(H/'candidate.sql.review').write_text(candidate)
rollback="-- REVIEW ONLY. Prove canonical ref first. No data deletion; private receipts preserved.\nBEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';\n"+after+''.join((H/f).read_text() for f in ['baseline-rpc.sql.review','baseline-storage.sql.review'])+grants+'-- POSTCHECK\n'+before+'COMMIT;\n'
(H/'rollback.sql.review').write_text(rollback)
(H/'preflight-readonly.sql').write_text('-- Executor must prove swzpzcwiasxmjutrmvkm; results expose catalog only.\nBEGIN READ ONLY;\n'+before+"SELECT (SELECT count(*) FROM public.aplicacoes) AS applications,(SELECT count(*) FROM public.aplicacao_evidencias) AS evidence,to_regclass('platform_private.application_save_preparations') IS NULL AS receipt_destination_free;\nROLLBACK;\n")
(H/'postflight.sql.review').write_text('BEGIN READ ONLY;\n'+after+'ROLLBACK;\n')
(H/'contracts.json').write_text(json.dumps(dict(canonical_ref='swzpzcwiasxmjutrmvkm',schema_fingerprint='ab90301d6806c9777da6ecceb7b953f8',functions=contracts),indent=2)+'\n')
print('Review files assembled; no database operations.')