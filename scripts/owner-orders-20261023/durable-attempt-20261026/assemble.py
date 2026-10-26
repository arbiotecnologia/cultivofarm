"""Review-only server continuity. Never executes hosted SQL."""
from pathlib import Path
import hashlib, json, re
D = Path(__file__).resolve().parent
C = D.parent / 'attempt-closure-20261026'
old = (C/'candidate.sql.review').read_text()
exp = json.loads((C/'expected.json').read_text())['candidate_prosrc_md5']
sig = 'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'
start = old.index('CREATE OR REPLACE FUNCTION public.create_partner_order_secure(')
definition = old[start:old.index('$function$;', start)+len('$function$;')]
body = definition.split('AS $function$',1)[1].rsplit('$function$;',1)[0]
assert hashlib.md5(body.encode()).hexdigest() == exp[sig]
anchor = "  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));\n"
assert body.count(anchor)==1
patch = "  PERFORM platform_private.c2_attempt_dispatch_guard(v_uid,p_partner_id,v_idem);\n" + anchor
newdef = definition.replace(anchor,patch,1)
after_auth="  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);\n"
assert newdef.count(after_auth)==1
newdef=newdef.replace(after_auth,after_auth+"  IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j JOIN public.profiles p ON p.user_id=j.actor_id AND p.organization_id=j.organization_id AND p.ativo WHERE j.actor_id=v_uid AND j.partner_id=p_partner_id AND j.idempotency_key=v_idem) THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;\n")
close_start = old.index('CREATE FUNCTION platform_private.c2_close_partner_order_attempt_core(')
closedef = old[close_start:old.index('$function$;',close_start)+len('$function$;')].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
ca = '  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);\n'
closedef = closedef.replace(ca,ca+'  PERFORM platform_private.c2_attempt_scope_lock(v_uid,p_partner_id);\n',1)
closedef=closedef.replace('  v_found boolean;', '  v_scope_org uuid; v_current_org uuid;\n  v_found boolean;',1)
closedef=closedef.replace('  PERFORM platform_private.c2_attempt_scope_lock(v_uid,p_partner_id);','  v_scope_org := platform_private.c2_attempt_scope_lock(v_uid,p_partner_id);',1)
last=closedef.rfind(ca)
closedef=closedef[:last]+closedef[last:].replace(ca,ca+"  SELECT organization_id INTO v_current_org FROM public.profiles WHERE user_id=v_uid AND ativo;\n  IF v_current_org IS DISTINCT FROM v_scope_org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;\n",1)
timeouts = "SET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\n"
pre = """DO $pre$ BEGIN
IF current_database() IS NULL THEN RAISE EXCEPTION 'C2DJ_DATABASE_UNKNOWN'; END IF;
IF current_setting('request.jwt.claims',true) IS NOT NULL AND current_setting('request.jwt.claims',true) <> ''
 THEN RAISE EXCEPTION 'C2DJ_MIGRATION_CONTEXT_REQUIRED'; END IF;
IF to_regclass('platform_private.partner_order_attempt_journal') IS NOT NULL THEN
 RAISE EXCEPTION 'C2DJ_TARGET_PRESENT'; END IF;
END $pre$;
"""
# These seven installed bodies were confirmed by READ ONLY capture 2026-10-26 19:12+.
for s,m in exp.items():
    pre += f"DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{s}')) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION 'C2DJ_DRIFT:{s}'; END IF; END $pin$;\n"
closurepost=(C/'postflight.sql').read_text()
pre += closurepost[closurepost.index('DO $'):closurepost.rindex('ROLLBACK;')]
pre += """DO $scope$ BEGIN
IF (SELECT md5(pg_get_functiondef(oid))||' '||proacl::text FROM pg_proc
 WHERE oid=to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)'))
 IS DISTINCT FROM '54c4327d63f48e39f598129ff9dd8f09 {postgres=X/postgres}'
 THEN RAISE EXCEPTION 'C2DJ_SCOPE_DRIFT'; END IF;
END $scope$;
"""
structure="""(SELECT md5(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='partner_order_idempotency'))::text) FROM pg_class c WHERE c.oid='public.partner_order_idempotency'::regclass)"""
pre+=f"DO $structure$ BEGIN IF {structure} IS DISTINCT FROM '3c5afe617195db177fe831c877473258' THEN RAISE EXCEPTION 'C2DJ_POI_STRUCTURE_DRIFT'; END IF; END $structure$;\n"
pre+="""DO $updated$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.update_updated_at_column()'::regprocedure) IS DISTINCT FROM 'a27bb088c067b7b77a9f0707b0048e40' THEN RAISE EXCEPTION 'C2DJ_UPDATED_DRIFT'; END IF; END $updated$;
"""
legacy="""-- LEGACY_CAPTURE_BEGIN: exact audited rows, not absence/drain inference.
DO $legacy$ BEGIN
IF (SELECT count(*) FROM public.partner_order_idempotency) <> 5
 OR EXISTS(SELECT 1 FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id
 WHERE i.created_by IS DISTINCT FROM 'beb25695-3957-48b0-aff8-6316520ea189'::uuid
 OR i.partner_id IS DISTINCT FROM '7e52de9a-4bed-4d1e-8200-3255a805465c'::uuid
 OR o.created_by IS DISTINCT FROM i.created_by OR o.partner_id IS DISTINCT FROM i.partner_id
 OR o.c2_external_origin_snapshot->>'organization_id' IS DISTINCT FROM '007bb519-cba0-4704-be2c-cb93ad010048'
 OR (i.idempotency_key,i.order_id) NOT IN (
 ('d200eb8a-2451-41f5-9161-11b82d20fac8','d4539dd9-b090-4433-9ed3-6f8f5d3e767b'::uuid),
 ('0dc12922-a037-46db-a5de-ecb91148ba7a','405ff73f-1667-43a3-a41c-56d9500dfd8b'::uuid),
 ('5cea2654-be52-4e2e-b52a-c3e1075ea381','6c23167c-e453-4724-82eb-8eb17e840539'::uuid),
 ('c76f3a8d-e1e0-4e89-b2a4-903803224b87','467959ea-d1ab-447b-81f6-7fbd3b774c22'::uuid),
 ('20d3da20-8e67-4890-bdf2-8d2bbba4f4ed','255057ba-8025-4fa5-a32f-ca3402d6c591'::uuid)))
 OR (SELECT count(*) FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id)<>5
 OR (SELECT idempotency_key FROM public.partner_order_idempotency ORDER BY created_at DESC,id DESC LIMIT 1)
 IS DISTINCT FROM '20d3da20-8e67-4890-bdf2-8d2bbba4f4ed'
 THEN RAISE EXCEPTION 'C2DJ_LEGACY_CAPTURE_DRIFT'; END IF;
END $legacy$;
-- LEGACY_CAPTURE_END
"""
pre+=legacy
fresh=json.loads((D/'live-capture-1912.json').read_text())
for s,m in fresh['functiondef_md5'].items():
 pre+=f"DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('{s}')) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:{s}'; END IF; END $fresh$;\n"
pre+="""DO $closure_rows$ BEGIN
IF (SELECT count(*) FROM platform_private.partner_order_idempotency_closures)<>1
 OR NOT EXISTS(SELECT 1 FROM platform_private.partner_order_idempotency_closures
 WHERE partner_id='7e52de9a-4bed-4d1e-8200-3255a805465c' AND idempotency_key='7eda3f91-52a8-457c-9abd-6980920b9c0c'
 AND closed_by='beb25695-3957-48b0-aff8-6316520ea189' AND closed_org='007bb519-cba0-4704-be2c-cb93ad010048')
 THEN RAISE EXCEPTION 'C2DJ_CLOSURE_ROWS_DRIFT'; END IF;
END $closure_rows$;
"""
ddl = """
CREATE TABLE platform_private.partner_order_attempt_journal (
 actor_id uuid NOT NULL, organization_id uuid NOT NULL, partner_id uuid NOT NULL REFERENCES public.partner_accounts(id),
 generation bigint NOT NULL CHECK(generation>0), idempotency_key text NOT NULL UNIQUE,
 predecessor_key text, imported_order_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,organization_id,partner_id,generation),
 CHECK(length(idempotency_key)=36)
);
REVOKE ALL ON platform_private.partner_order_attempt_journal FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON platform_private.partner_order_attempt_journal TO service_role;
ALTER TABLE platform_private.partner_order_attempt_journal ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER c2dj_no_change BEFORE UPDATE OR DELETE ON platform_private.partner_order_attempt_journal
 FOR EACH ROW EXECUTE FUNCTION platform_private.c2_attempt_closure_immutable();
CREATE TRIGGER c2dj_no_truncate BEFORE TRUNCATE ON platform_private.partner_order_attempt_journal
 FOR EACH STATEMENT EXECUTE FUNCTION platform_private.c2_attempt_closure_immutable();

-- ACCESS EXCLUSIVE on idempotency is held across assertions, import and barriers.
-- Derive historical organization from immutable origin, NEVER current profile.
INSERT INTO platform_private.partner_order_attempt_journal(actor_id,organization_id,partner_id,generation,idempotency_key,imported_order_id)
 SELECT DISTINCT ON (i.created_by,(coalesce(o.c2_external_origin_snapshot,o.internal_origin_snapshot)->>'organization_id')::uuid,i.partner_id)
 i.created_by,(coalesce(o.c2_external_origin_snapshot,o.internal_origin_snapshot)->>'organization_id')::uuid,
 i.partner_id,1,i.idempotency_key,i.order_id
 FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id
 ORDER BY i.created_by,(coalesce(o.c2_external_origin_snapshot,o.internal_origin_snapshot)->>'organization_id')::uuid,i.partner_id,i.created_at DESC,i.id DESC;

CREATE FUNCTION platform_private.c2_attempt_scope_lock(p_uid uuid,p_partner uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE org uuid; fresh uuid;
BEGIN
 IF p_uid IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'C2DJ_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.c2_partner_order_attempt_authz(p_uid,p_partner);
 SELECT organization_id INTO org FROM public.profiles WHERE user_id=p_uid AND ativo;
 IF org IS NULL THEN RAISE EXCEPTION 'C2DJ_ORG_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_attempt_scope:'||p_uid::text||':'||org::text||':'||p_partner::text,0));
 PERFORM platform_private.c2_partner_order_attempt_authz(p_uid,p_partner);
 SELECT organization_id INTO fresh FROM public.profiles WHERE user_id=p_uid AND ativo;
 IF fresh IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN org;
END $function$;

CREATE FUNCTION platform_private.c2_attempt_dispatch_guard(p_uid uuid,p_partner uuid,p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE org uuid; j platform_private.partner_order_attempt_journal;
BEGIN
 org := platform_private.c2_attempt_scope_lock(p_uid,p_partner);
 SELECT * INTO j FROM platform_private.partner_order_attempt_journal
 WHERE actor_id=p_uid AND organization_id=org AND partner_id=p_partner ORDER BY generation DESC LIMIT 1;
 IF j.idempotency_key IS DISTINCT FROM p_key OR p_key IS NULL THEN
  RAISE EXCEPTION 'C2DJ_REGISTERED_ATTEMPT_REQUIRED' USING ERRCODE='42501'; END IF;
END $function$;

CREATE FUNCTION platform_private.c2_attempt_journal_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
BEGIN
 -- Also fences old function bodies in flight and arbitrary old/downgraded clients.
 IF TG_OP='UPDATE' AND (NEW.partner_id,NEW.idempotency_key,NEW.created_by)
  IS DISTINCT FROM (OLD.partner_id,OLD.idempotency_key,OLD.created_by) THEN
  RAISE EXCEPTION 'C2DJ_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 -- Fail BEFORE any scope lock; this trigger NEVER acquires scope (old body may hold idem).
 IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j
  WHERE j.actor_id=auth.uid() AND j.partner_id=NEW.partner_id AND j.idempotency_key=btrim(NEW.idempotency_key)) THEN
  RAISE EXCEPTION 'C2DJ_REGISTERED_ATTEMPT_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:'||NEW.partner_id::text||':'||btrim(NEW.idempotency_key),0));
 PERFORM platform_private.c2_partner_order_attempt_authz(auth.uid(),NEW.partner_id);
 IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'C2DJ_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j JOIN public.profiles p
  ON p.user_id=j.actor_id AND p.organization_id=j.organization_id AND p.ativo
  WHERE j.actor_id=auth.uid() AND j.partner_id=NEW.partner_id AND j.idempotency_key=btrim(NEW.idempotency_key)) THEN
  RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$;
CREATE TRIGGER c2_attempt_journal_guard BEFORE INSERT OR UPDATE OF partner_id,idempotency_key,created_by
 ON public.partner_order_idempotency FOR EACH ROW EXECUTE FUNCTION platform_private.c2_attempt_journal_write_guard();

CREATE FUNCTION platform_private.c2_recover_order_attempt_core(p_partner uuid,p_expected_key text DEFAULT NULL,
 p_expected_generation bigint DEFAULT NULL,p_advance boolean DEFAULT false,p_ack_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE uid uuid:=auth.uid(); org uuid; j platform_private.partner_order_attempt_journal;
  result jsonb; nextgen bigint; nextkey text; fresh uuid;
BEGIN
 org := platform_private.c2_attempt_scope_lock(uid,p_partner);
 SELECT * INTO j FROM platform_private.partner_order_attempt_journal
 WHERE actor_id=uid AND organization_id=org AND partner_id=p_partner ORDER BY generation DESC LIMIT 1;
 IF p_advance THEN
  IF j.idempotency_key IS NULL OR p_expected_key IS DISTINCT FROM j.idempotency_key
   OR p_expected_generation IS DISTINCT FROM j.generation THEN
   RAISE EXCEPTION 'C2DJ_CAS_CONFLICT' USING ERRCODE='40001'; END IF;
  -- Explicit click only; existing atomic close is the ONLY way to abandon uncertain K.
  result := platform_private.c2_close_partner_order_attempt_core(p_partner,j.idempotency_key);
  SELECT organization_id INTO fresh FROM public.profiles WHERE user_id=uid AND ativo;
  IF fresh IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF result->>'state'='in_progress' THEN RETURN jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','state','unknown'); END IF;
  IF result->>'state'='committed' AND p_ack_order IS DISTINCT FROM (result->>'order_id')::uuid THEN
   RETURN result || jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','key',j.idempotency_key,'generation',j.generation); END IF;
  IF result->>'state' NOT IN ('closed','committed') OR result->>'state' IS NULL THEN
   RAISE EXCEPTION 'C2DJ_INVALID_CLOSURE'; END IF;
 ELSIF j.idempotency_key IS NOT NULL THEN
  -- Recovery is read-only with respect to closure; never auto-close an absent order.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:'||p_partner::text||':'||j.idempotency_key,0));
  PERFORM platform_private.c2_partner_order_attempt_authz(uid,p_partner);
  SELECT organization_id INTO fresh FROM public.profiles WHERE user_id=uid AND ativo;
  IF fresh IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('state','committed','order_id',i.order_id,'numero',o.numero) INTO result
   FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id
   WHERE i.partner_id=p_partner AND i.idempotency_key=j.idempotency_key AND i.created_by=uid;
  IF result IS NULL THEN
   result := jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM platform_private.partner_order_idempotency_closures
    WHERE partner_id=p_partner AND idempotency_key=j.idempotency_key) THEN 'closed' ELSE 'uncertain' END);
  END IF;
  RETURN result || jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','key',j.idempotency_key,'generation',j.generation);
 ELSIF p_expected_key IS NOT NULL OR p_expected_generation IS NOT NULL THEN
  -- Lost legacy memory cannot be adopted by mere key knowledge.
  RAISE EXCEPTION 'C2DJ_LEGACY_RECONCILIATION_REQUIRED' USING ERRCODE='42501';
 END IF;
 nextgen := coalesce(j.generation,0)+1; nextkey := gen_random_uuid()::text;
 INSERT INTO platform_private.partner_order_attempt_journal(actor_id,organization_id,partner_id,generation,idempotency_key,predecessor_key)
 VALUES(uid,org,p_partner,nextgen,nextkey,j.idempotency_key);
 RETURN jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','state','reserved','key',nextkey,'generation',nextgen);
END $function$;

CREATE FUNCTION public.recover_partner_order_attempt_v1(p_partner uuid,p_expected_key text DEFAULT NULL,
 p_expected_generation bigint DEFAULT NULL,p_advance boolean DEFAULT false,p_ack_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT platform_private.c2_recover_order_attempt_core(p_partner,p_expected_key,p_expected_generation,p_advance,p_ack_order);
$function$;
"""
private = ['c2_attempt_scope_lock(uuid,uuid)','c2_attempt_dispatch_guard(uuid,uuid,text)','c2_attempt_journal_write_guard()']
core='platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)'
wrap='public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)'
for s in ['platform_private.'+x for x in private]+[core,wrap]:
 ddl+=f'REVOKE ALL ON FUNCTION {s} FROM PUBLIC,anon,authenticated,service_role;\n'
for s in [core,wrap]: ddl+=f'GRANT EXECUTE ON FUNCTION {s} TO authenticated;\n'
ddl+=newdef+'\n'+closedef+'\n'
# Exact function metadata captured from assembly, checked before any containment replacement.
funcs={}
for match in re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION ([\w.]+)\((.*?)\).*?AS \$function\$(.*?)\$function\$;',ddl,re.S):
 name,args,b=match.groups(); types=[]
 for a in (args.split(',') if args.strip() else []):
  t=a.strip().split()[1]; types.append(t)
 fs=name+'('+','.join(types)+')'
 # Canonical create uses integer, alias int etc not introduced.
 funcs[fs]=hashlib.md5(b.encode()).hexdigest()
post=''
for s,m in funcs.items():
 post+=f"DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{s}')) IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION 'C2DJ_POST:{s}'; END IF; END $post$;\n"
post+="""DO $metadata$ BEGIN
IF (SELECT relacl::text FROM pg_class WHERE oid='platform_private.partner_order_attempt_journal'::regclass)
 IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=r/postgres}'
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='platform_private.partner_order_attempt_journal'::regclass)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='platform_private' AND tablename='partner_order_attempt_journal')
 THEN RAISE EXCEPTION 'C2DJ_JOURNAL_ACL_RLS'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='c2_attempt_journal_guard' AND NOT tgisinternal
 AND tgrelid='public.partner_order_idempotency'::regclass AND tgenabled='O'
 AND tgfoid='platform_private.c2_attempt_journal_write_guard()'::regprocedure AND tgtype=23)
 THEN RAISE EXCEPTION 'C2DJ_TRIGGER'; END IF;
END $metadata$;
"""
for s in ['platform_private.'+x for x in private]+[core,wrap]:
 allowed="{postgres=X/postgres,authenticated=X/postgres}" if s in [core,wrap] else "{postgres=X/postgres}"
 sec='false' if s==wrap else 'true'
 config="ARRAY['search_path=\"\"']::text[]" if s==wrap else "ARRAY['search_path=\"\"','lock_timeout=5s']::text[]"
 post+=f"DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('{s}') AND pg_get_userbyid(proowner)='postgres' AND prosecdef={sec} AND proacl::text='{allowed}' AND proconfig={config}) THEN RAISE EXCEPTION 'C2DJ_METADATA:{s}'; END IF; END $acl$;\n"
post+="""DO $closure$ BEGIN
IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='platform_private.c2_attempt_closure_guard()'::regprocedure)
 IS DISTINCT FROM '140ceb10660fb226fda78fb94277d17e' THEN RAISE EXCEPTION 'C2DJ_CLOSURE_DRIFT'; END IF;
END $closure$;
"""
post+="""DO $imports$ BEGIN
IF EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j
 WHERE j.imported_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_order_idempotency i
 WHERE i.created_by=j.actor_id AND i.partner_id=j.partner_id AND i.idempotency_key=j.idempotency_key AND i.order_id=j.imported_order_id))
 THEN RAISE EXCEPTION 'C2DJ_IMPORT_DRIFT'; END IF;
END $imports$;
"""
post+="""DO $canonical_metadata$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure
 AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=public']::text[]
 AND proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='platform_private.c2_close_partner_order_attempt_core(uuid,text)'::regprocedure
 AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]
 AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION 'C2DJ_CANONICAL_METADATA_DRIFT'; END IF;
END $canonical_metadata$;
"""
boundary="LOCK TABLE public.partner_order_idempotency IN ACCESS EXCLUSIVE MODE;\nLOCK TABLE public.partner_orders IN SHARE MODE;\n"
header='-- INATIVO. Canonical target swzpzcwiasxmjutrmvkm. No automatic execution.\n'
(D/'preflight.sql').write_text(header+'BEGIN TRANSACTION READ ONLY;\n'+timeouts+pre+'ROLLBACK;\n')
(D/'candidate.sql.review').write_text(header+'BEGIN;\n'+timeouts+boundary+pre+ddl+post+'COMMIT;\n')
(D/'test-install.sql').write_text('-- DISPOSABLE ONLY: production pins require explicit fixture substitution. Never hosted.\nBEGIN;\n'+timeouts+boundary+pre+ddl+post+'COMMIT;\n')
(D/'postflight.sql').write_text(header+'BEGIN TRANSACTION READ ONLY;\n'+timeouts+post+'ROLLBACK;\n')
deny="""CREATE OR REPLACE FUNCTION platform_private.c2_attempt_journal_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
BEGIN RAISE EXCEPTION 'C2DJ_WRITER_CONTAINED' USING ERRCODE='42501'; END $function$;
"""
rb=header+'-- DENY ONLY, never downgrade to memory-only writer.\nBEGIN;\n'+timeouts+boundary+post+deny
for s in [core,wrap]: rb+=f'REVOKE EXECUTE ON FUNCTION {s} FROM authenticated;\n'
deny_md5=hashlib.md5(deny.split('AS $function$')[1].split('$function$;')[0].encode()).hexdigest()
rb+=f"DO $rb$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='platform_private.c2_attempt_journal_write_guard()'::regprocedure) IS DISTINCT FROM '{deny_md5}' OR has_function_privilege('authenticated','{wrap}','EXECUTE') OR has_function_privilege('authenticated','{core}','EXECUTE') THEN RAISE EXCEPTION 'C2DJ_CONTAINMENT_POST'; END IF; END $rb$;\nCOMMIT;\n"
(D/'rollback.sql.review').write_text(rb)
(D/'expected.json').write_text(json.dumps({'base_source':'READ ONLY canonical swzpzcwiasxmjutrmvkm, 2026-10-26 19:12+; bodies corroborated against reviewed 5cd','poi_structure_md5':'3c5afe617195db177fe831c877473258','base':exp,'candidate':funcs,'containment_guard':deny_md5},indent=2)+'\n')
print('Generated inactive candidate; bounded atomic boundary and exact legacy pins. Functions:',len(funcs))