"""Compact strong metadata checks, with namespace-independent OID binding."""
import json
def literal(value):return "'"+json.dumps(value,separators=(',',':')).replace("'","''")+"'::jsonb"
IDENTITY_SQL="""
CREATE OR REPLACE FUNCTION platform_private.cancel_homolog_resolve_function_v1(signature text,body_md5 text)
RETURNS oid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $identity$
DECLARE f oid;hits integer;qualified boolean;function_name text;arg_types text;
BEGIN
 qualified:=position('.' in split_part(signature,'(',1))>0;
 IF qualified THEN
  f:=pg_catalog.to_regprocedure(signature);
  IF f IS NULL OR pg_catalog.md5(pg_catalog.pg_get_functiondef(f)) IS DISTINCT FROM body_md5 THEN RAISE EXCEPTION 'FUNCTION_IDENTITY_DRIFT:%',signature; END IF;
  RETURN f;
 END IF;
 function_name:=split_part(signature,'(',1);
 arg_types:=substring(signature from position('(' in signature)+1 for length(signature)-position('(' in signature)-1);
 SELECT count(*),min(p.oid::bigint)::oid INTO hits,f FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.proname=function_name AND p.prokind='f'
 AND p.oid=pg_catalog.to_regprocedure(pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,arg_types))
 AND pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))=body_md5;
 IF hits<>1 THEN RAISE EXCEPTION 'FUNCTION_IDENTITY_AMBIGUOUS_OR_MISSING:%',signature; END IF;
 RETURN f;
END $identity$;
REVOKE ALL ON FUNCTION platform_private.cancel_homolog_resolve_function_v1(text,text) FROM PUBLIC,anon,authenticated,service_role;
"""
CHECK_SQL="""
CREATE OR REPLACE FUNCTION platform_private.cancel_homolog_catalog_check_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_catalog' AS $checker$
DECLARE data jsonb:=__DATA__;r jsonb;c jsonb;t jsonb;p jsonb;d jsonb;x jsonb;expected jsonb;rel oid;f oid;definition_text text;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(data->'schema') LOOP
  rel:=to_regclass(r->>'name');
  SELECT jsonb_build_array(pg_get_userbyid(relowner),relrowsecurity,relforcerowsecurity,
   (SELECT coalesce(jsonb_agg(a::text ORDER BY a::text),'[]'::jsonb) FROM unnest(relacl) a)) INTO x FROM pg_class WHERE oid=rel;
  IF x IS DISTINCT FROM jsonb_build_array(r->>'owner',r->'relrowsecurity',r->'relforcerowsecurity',r->'acl') THEN RAISE EXCEPTION 'RELATION_OWNER_RLS_ACL_DRIFT:%',r->>'name';END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(r->'columns') LOOP
   SELECT jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(ad.adbin,ad.adrelid),a.attidentity,a.attgenerated) INTO x FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=rel AND a.attname=c->>'name' AND NOT a.attisdropped;
   IF x IS DISTINCT FROM jsonb_build_array(c->>'type',c->'not_null',c->'default',c->>'identity',c->>'generated') THEN RAISE EXCEPTION 'COLUMN_DRIFT:%.%',r->>'name',c->>'name'; END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(r->'constraints') LOOP
   SELECT jsonb_build_array(pg_get_constraintdef(oid,true),convalidated) INTO x FROM pg_constraint WHERE conrelid=rel AND conname=c->>'name';
   IF x IS DISTINCT FROM jsonb_build_array(c->>'definition',c->'validated') THEN RAISE EXCEPTION 'CONSTRAINT_DRIFT:%.%',r->>'name',c->>'name'; END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(r->'indexes') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indrelid=rel AND pg_get_indexdef(indexrelid)=c#>>'{}') THEN RAISE EXCEPTION 'INDEX_DRIFT:%',r->>'name'; END IF;
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(r->'policies') LOOP
   SELECT jsonb_build_array(polcmd,polpermissive,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) INTO x FROM pg_policy WHERE polrelid=rel AND polname=p->>'name';
   IF x IS DISTINCT FROM jsonb_build_array(p->>'command',p->'permissive',p->'roles',p->'using',p->'check') THEN RAISE EXCEPTION 'POLICY_DRIFT:%.%',r->>'name',p->>'name'; END IF;
  END LOOP;
  FOR t IN SELECT value FROM jsonb_array_elements(r->'triggers') LOOP
   f:=platform_private.cancel_homolog_resolve_function_v1(t->>'function',t->>'body_md5');
   SELECT jsonb_build_array(tgenabled,tgfoid),pg_get_triggerdef(oid,true) INTO x,definition_text FROM pg_trigger WHERE tgrelid=rel AND tgname=t->>'name';
   IF x IS DISTINCT FROM jsonb_build_array(t->>'enabled',f) THEN RAISE EXCEPTION 'TRIGGER_IDENTITY_DRIFT:%.%',r->>'name',t->>'name'; END IF;
   -- The function is checked by OID, not path-dependent regprocedure text. Keep
   -- event/timing/columns/WHEN/arguments exactly; normalize only its printed name.
   IF regexp_replace(definition_text,'EXECUTE FUNCTION [^(]+\\(','EXECUTE FUNCTION FUNCTION_ID(')
    IS DISTINCT FROM regexp_replace(t->>'definition','EXECUTE FUNCTION [^(]+\\(','EXECUTE FUNCTION FUNCTION_ID(') THEN RAISE EXCEPTION 'TRIGGER_DEFINITION_DRIFT:%.%',r->>'name',t->>'name'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>jsonb_array_length(r->'triggers') THEN RAISE EXCEPTION 'TRIGGER_SET_DRIFT:%',r->>'name'; END IF;
 END LOOP;
 FOR d IN SELECT value FROM jsonb_array_elements(data->'definitions') LOOP
  f:=platform_private.cancel_homolog_resolve_function_v1(d->>'signature',d->>'current_md5');
  SELECT jsonb_build_array(pg_get_userbyid(proowner),(SELECT coalesce(jsonb_agg(a::text ORDER BY a::text),'[]'::jsonb) FROM unnest(proacl) a),proconfig) INTO x FROM pg_proc WHERE oid=f;
  IF x IS DISTINCT FROM jsonb_build_array(d->>'owner',d->'acl',d->'proconfig') THEN RAISE EXCEPTION 'FUNCTION_OWNER_ACL_CONFIG_DRIFT:%',d->>'signature'; END IF;
 END LOOP;
 FOR t IN SELECT value FROM jsonb_array_elements(data->'triggers') LOOP
  f:=platform_private.cancel_homolog_resolve_function_v1(t->>'signature',t->>'body_md5');
  SELECT jsonb_build_array(evtevent,evtenabled,evttags,evtfoid) INTO x FROM pg_event_trigger WHERE evtname=t->>'evtname';
  IF x IS DISTINCT FROM jsonb_build_array(t->>'evtevent',t->>'evtenabled',t->'evttags',f) THEN RAISE EXCEPTION 'EVENT_TRIGGER_IDENTITY_DRIFT:%',t->>'evtname'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_event_trigger)<>jsonb_array_length(data->'triggers') THEN RAISE EXCEPTION 'EVENT_TRIGGER_SET_DRIFT'; END IF;
END $checker$;
REVOKE ALL ON FUNCTION platform_private.cancel_homolog_catalog_check_v1() FROM PUBLIC,anon,authenticated,service_role;
"""
def compact_data(data):
 result={'schema':[],'definitions':[],'triggers':data['triggers']}
 for r in data['schema']:
  result['schema'].append({**{k:r[k] for k in ['name','owner','relrowsecurity','relforcerowsecurity','columns','constraints','indexes','policies','triggers']},'acl':sorted(filter(None,(r['raw_acl'] or '{}').strip('{}').split(',')))})
  for key in ['constraints','indexes','policies','triggers']:result['schema'][-1][key]=r[key] or []
 for d in data['definitions']:
  result['definitions'].append({k:d[k] for k in ['signature','current_md5','owner','proconfig']})
  result['definitions'][-1]['acl']=sorted(filter(None,(d['acl'] or '{}').strip('{}').split(',')))
 return result
def source(data):return IDENTITY_SQL+CHECK_SQL.replace('__DATA__',literal(compact_data(data)))

def segmented_sources(data):
 compact=compact_data(data);parts=[];getters=[]
 for i,r in enumerate(compact['schema']):
  name=f'platform_private.cancel_homolog_catalog_part_{i:02d}_v1'
  body=f"CREATE OR REPLACE FUNCTION {name}() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $part$ SELECT {literal(r)} $part$;\nREVOKE ALL ON FUNCTION {name}() FROM PUBLIC,anon,authenticated,service_role;\n"
  parts.append((name+'()',body));getters.append(name+'()')
 rest={k:v for k,v in compact.items() if k!='schema'}
 expression=literal(rest)+"||jsonb_build_object('schema',jsonb_build_array("+','.join(getters)+'))'
 return [('platform_private.cancel_homolog_resolve_function_v1(text,text)',IDENTITY_SQL),*parts,('platform_private.cancel_homolog_catalog_check_v1()',CHECK_SQL.replace('__DATA__',expression))]