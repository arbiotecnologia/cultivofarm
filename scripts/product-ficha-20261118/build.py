"""Offline exact-definition delta. No connections; explicit UTF-8/LF, no repinning."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent
BASE=H.parent/'microorganism-ficha-20261118'
def write(p,s): p.write_text(s,encoding='utf-8',newline='\n')
old=(BASE/'capture/public.tenant_catalog_root_save.sql').read_text(encoding='utf-8')
PIN='7db253bcc2150276ea2bb2f7bd90e471'
# Historical SQL file is an installation statement, not pg_get_functiondef bytes.
# Production assembly below requires the exact catalog capture; never treat this file's MD5 as LIVE.
def replace(s,a,b):
 assert s.count(a)==1,('ANCHOR_DRIFT',a)
 return s.replace(a,b)
def extend(old):
 new=replace(old,'  k text; v_hash text;',"  v_evidence jsonb; v_product uuid; v_source jsonb; v_item jsonb; v_value text; v_enabled boolean;\n  k text; v_hash text;")
 new=replace(new,"  SELECT * INTO v_cfg",'''  v_evidence := p_payload->'documentary_evidence';
   IF v_evidence IS NOT NULL THEN
     IF p_root <> 'product_technical_profiles' THEN RAISE EXCEPTION 'product_evidence_root_denied' USING ERRCODE='22023'; END IF;
     SELECT enabled INTO v_enabled FROM platform_private.product_evidence_gate_v1 WHERE singleton FOR SHARE;
     IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'product_evidence_closed' USING ERRCODE='42501'; END IF;
     IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(v_evidence)>40 OR octet_length(v_evidence::text)>300000 THEN RAISE EXCEPTION 'product_evidence_shape' USING ERRCODE='22023'; END IF;
     FOR v_item IN SELECT value FROM jsonb_array_elements(v_evidence) LOOP
       IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR (v_item-ARRAY['field','value','identity','sources','candidate_key'])<>'{}' OR jsonb_typeof(v_item->'candidate_key') IS DISTINCT FROM 'string' OR length(v_item->>'candidate_key') NOT BETWEEN 1 AND 200 OR NOT coalesce(v_item->>'field','')=ANY(ARRAY['resumo_curto','explicacao_tecnica','explicacao_produtor','explicacao_b2b','indicacoes_uso','janela_aplicacao','cuidados_aplicacao','compatibilidade','beneficio_combinado']) OR jsonb_typeof(v_item->'value') IS DISTINCT FROM 'string' OR length(v_item->>'value') NOT BETWEEN 1 AND 12000 OR jsonb_typeof(v_item->'identity') IS DISTINCT FROM 'object' OR jsonb_typeof(v_item->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'product_evidence_shape' USING ERRCODE='22023'; END IF;
       IF v_item->'identity'->>'entity' IS DISTINCT FROM 'produto' OR coalesce(v_item->'identity'->>'name','')='' OR jsonb_array_length(v_item->'sources') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'product_evidence_identity' USING ERRCODE='22023'; END IF;
       IF p_payload->>(v_item->>'field') IS DISTINCT FROM v_item->>'value' THEN RAISE EXCEPTION 'product_evidence_value_mismatch' USING ERRCODE='22023'; END IF;
       FOR v_source IN SELECT value FROM jsonb_array_elements(v_item->'sources') LOOP
         IF jsonb_typeof(v_source) IS DISTINCT FROM 'object' OR (v_source-ARRAY['url','title','excerpt'])<>'{}' OR NOT platform_private.product_source_https_v1(v_source->>'url') OR jsonb_typeof(v_source->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(v_source->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(v_source->'excerpt') IS DISTINCT FROM 'string' OR coalesce(v_source->>'title','')='' OR coalesce(v_source->>'excerpt','')='' OR octet_length(v_source::text)>20000 THEN RAISE EXCEPTION 'product_source_invalid' USING ERRCODE='22023'; END IF;
       END LOOP;
     END LOOP;
     p_payload := p_payload-'documentary_evidence';
   END IF;
   SELECT * INTO v_cfg''')
 new=replace(new,"coalesce(p_expected_updated_at::text,'')))","coalesce(p_expected_updated_at::text,''),coalesce(v_evidence::text,'')))")
 new=replace(new,'  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;',"  IF platform_private.catalog_tenant_actor('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_actor_changed' USING ERRCODE='42501'; END IF;\n  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;")
 # Avoid changing idempotency hashes of every existing command.
 new=replace(new,"coalesce(p_expected_updated_at::text,''),coalesce(v_evidence::text,'')))","coalesce(p_expected_updated_at::text,'')));\n  IF v_evidence IS NOT NULL THEN v_hash := md5(v_hash || v_evidence::text); END IF")
 new=replace(new,"  v_row := jsonb_build_object('ok'",'''  IF v_evidence IS NOT NULL THEN
     v_product := (v_row->>'produto_id')::uuid;
     IF platform_private.tenant_catalog_ref_owner('produtos',v_product) IS DISTINCT FROM v_org OR platform_private.catalog_tenant_actor('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_evidence_denied' USING ERRCODE='42501'; END IF;
     FOR v_item IN SELECT value FROM jsonb_array_elements(v_evidence) LOOP
       IF v_item->'identity'->>'id' IS DISTINCT FROM v_product::text THEN RAISE EXCEPTION 'product_evidence_identity' USING ERRCODE='22023'; END IF;
     END LOOP;
     INSERT INTO platform_private.product_evidence_history_v1(product_id,profile_id,profile_revision,actor_id,evidence) VALUES(v_product,(v_row->>'id')::uuid,(v_row->>'updated_at')::timestamptz,v_uid,v_evidence);
   END IF;
   v_row := jsonb_build_object('ok' ''')
 # Fix spacing after exact string anchor.
 new=new.replace("jsonb_build_object('ok' ,", "jsonb_build_object('ok',")
 return new
new=extend(old)
helper="""CREATE FUNCTION platform_private.product_source_https_v1(p_url text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $f$
 SELECT p_url IS NOT NULL AND length(p_url)<=2048 AND p_url ~ '^https://[A-Za-z0-9.-]+(:443)?([/?#]|$)' AND p_url !~ '[[:space:][:cntrl:]\\\\]' AND p_url !~* '%(0[0-9a-f]|1[0-9a-f]|7f)' AND p_url !~ '^https://[^/?#]*@' AND p_url !~* '^https://(localhost|[^/?#]*\\.local)(:443)?([/?#]|$)'
$f$;
REVOKE ALL ON FUNCTION platform_private.product_source_https_v1(text) FROM PUBLIC,anon,authenticated,service_role;
"""
reader="""CREATE FUNCTION public.tenant_product_documentary_read_v1(p_product_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE org uuid; result jsonb; current_profile uuid; current_revision timestamptz;
BEGIN
 org:=platform_private.catalog_tenant_actor('read_catalog');
 IF NOT EXISTS(SELECT 1 FROM public.produtos WHERE id=p_product_id AND owner_organization_id=org) THEN RAISE EXCEPTION 'product_evidence_denied' USING ERRCODE='42501'; END IF;
 SELECT id,updated_at INTO current_profile,current_revision FROM public.product_technical_profiles WHERE produto_id=p_product_id;
 SELECT evidence INTO result FROM platform_private.product_evidence_history_v1 WHERE product_id=p_product_id AND profile_id=current_profile AND profile_revision=current_revision ORDER BY sequence DESC LIMIT 1;
 RETURN jsonb_build_object('product_id',p_product_id,'profile_id',current_profile,'profile_revision',current_revision,'evidence',coalesce(result,'[]'::jsonb));
END $f$;
REVOKE ALL ON FUNCTION public.tenant_product_documentary_read_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_product_documentary_read_v1(uuid) TO authenticated;
"""
schema="""CREATE TABLE platform_private.product_evidence_gate_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.product_evidence_gate_v1 VALUES(true,false);
CREATE TABLE platform_private.product_evidence_history_v1(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,product_id uuid NOT NULL REFERENCES public.produtos(id),profile_id uuid NOT NULL REFERENCES public.product_technical_profiles(id),profile_revision timestamptz NOT NULL,actor_id uuid NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON platform_private.product_evidence_gate_v1,platform_private.product_evidence_history_v1 FROM PUBLIC,anon,authenticated,service_role;
"""
write(H/'source.sql.review',schema+helper+reader+new)
if len(sys.argv)>1:
 capture=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')); ref=capture.get('ref')
 assert ref in ['swzpzcwiasxmjutrmvkm','vrlcdwmlytukrjezrrnf'],'REF_DENIED'
 for f in capture['functions']:
  assert hashlib.md5(f['definition'].encode('utf-8')).hexdigest()==f['md5'],'CAPTURE_ROUNDTRIP_DRIFT'
 expected={'public.tenant_catalog_root_save(text,uuid,jsonb,timestamp with time zone,uuid)':PIN,'platform_private.catalog_tenant_actor(text)':'5e0ce9cc9122f1c21d76e29a13de8b59','platform_private.tenant_catalog_receipt(uuid,uuid,text)':'e0215d187cf055064e05c76a13dd55d4'}
 found={f['signature']:f['md5'] for f in capture['functions']}
 for sig,pin in expected.items(): assert found.get(sig)==pin,('FOUNDATION_REVIEW_REQUIRED',sig)
 out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
 checks='\n'.join(f"IF md5(pg_get_functiondef(to_regprocedure('{sig}'))) IS DISTINCT FROM '{pin}' THEN RAISE EXCEPTION 'PRODUCT_PRE_DRIFT'; END IF;" for sig,pin in found.items())
 write(out/'01-pre.sql.review','DO $f$ BEGIN\n'+checks+'\nEND $f$;')
 assert len(sys.argv)==4,'EXACT_POST_CAPTURE_REQUIRED: synthetic post-pins.json never authorizes installation'
 post_capture=json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))
 assert post_capture.get('ref')==ref,'POST_REF_DENIED'
 pins={}
 for f in post_capture['functions']:
  assert hashlib.md5(f['definition'].encode('utf-8')).hexdigest()==f['md5'],'POST_ROUNDTRIP_DRIFT'
  pins[f['signature']]=f['md5']
 exact_root=next(f['definition'] for f in capture['functions'] if f['signature'].startswith('public.tenant_catalog_root_save('))
 exact_delta=extend(exact_root)
 write(out/'source.sql.review',schema+helper+reader+exact_delta)
 assert any('tenant_catalog_root_save(' in sig for sig in pins),'POST_ROOT_REQUIRED'
 post='DO $post$ BEGIN\n'+'\n'.join(f"IF md5(pg_get_functiondef(to_regprocedure('{sig}'))) IS DISTINCT FROM '{pin}' THEN RAISE EXCEPTION 'PRODUCT_POST_DRIFT'; END IF;" for sig,pin in pins.items())+'\nEND $post$;\n'
 write(out/'03-post.sql.review',post)
 write(out/'02-install.sql.review','BEGIN;\n'+(out/'01-pre.sql.review').read_text(encoding='utf-8')+'\n'+(out/'source.sql.review').read_text(encoding='utf-8')+'\n'+post+'COMMIT;\n')
 write(out/'04-release.sql.review',"BEGIN;\n"+post+"UPDATE platform_private.product_evidence_gate_v1 SET enabled=true WHERE singleton;COMMIT;\n")
 write(out/'05-rollback.sql.review',"BEGIN;UPDATE platform_private.product_evidence_gate_v1 SET enabled=false WHERE singleton;REVOKE EXECUTE ON FUNCTION public.tenant_product_documentary_read_v1(uuid) FROM authenticated;COMMIT;\n-- Retain evidence and safe extended motor. Never restore unsafe definitions.\n")
 print('ASSEMBLED_REVIEW_ONLY',ref)
