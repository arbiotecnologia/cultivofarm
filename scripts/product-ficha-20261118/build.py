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
product_fence = "  IF p_root = 'product_technical_profiles' AND platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;\n"
def extend(old):
 new=replace(old,'  k text; v_hash text;',"  v_children jsonb; v_evidence jsonb; v_product uuid; v_source jsonb; v_item jsonb; v_value text; v_enabled boolean; v_seen text[] := ARRAY[]::text[]; v_product_name text;\n  k text; v_hash text;")
 new=replace(new,"  SELECT * INTO v_cfg",'''  v_children := p_payload->'product_relations';
   v_evidence := p_payload->'documentary_evidence';
   IF v_children IS NOT NULL OR v_evidence IS NOT NULL THEN
     IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
   END IF;
   IF v_children IS NOT NULL THEN
     IF p_root <> 'product_technical_profiles' THEN RAISE EXCEPTION 'product_relations_root_denied' USING ERRCODE='22023'; END IF;
     SELECT enabled INTO v_enabled FROM platform_private.product_evidence_gate_v1 WHERE singleton FOR SHARE;
     IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
     IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'product_evidence_closed' USING ERRCODE='42501'; END IF;
     p_payload := p_payload-'product_relations';
   END IF;
   IF v_evidence IS NOT NULL THEN
     IF p_root <> 'product_technical_profiles' THEN RAISE EXCEPTION 'product_evidence_root_denied' USING ERRCODE='22023'; END IF;
     SELECT enabled INTO v_enabled FROM platform_private.product_evidence_gate_v1 WHERE singleton FOR SHARE;
     IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
     IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'product_evidence_closed' USING ERRCODE='42501'; END IF;
     IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(v_evidence)>40 OR octet_length(v_evidence::text)>300000 THEN RAISE EXCEPTION 'product_evidence_shape' USING ERRCODE='22023'; END IF;
     FOR v_item IN SELECT value FROM jsonb_array_elements(v_evidence) LOOP
       IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR (v_item-ARRAY['field','value','identity','sources','candidate_key'])<>'{}' OR jsonb_typeof(v_item->'candidate_key') IS DISTINCT FROM 'string' OR length(v_item->>'candidate_key') NOT BETWEEN 1 AND 200 OR NOT coalesce(v_item->>'field','')=ANY(ARRAY['resumo_curto','explicacao_tecnica','explicacao_produtor','explicacao_b2b','indicacoes_uso','janela_aplicacao','cuidados_aplicacao','compatibilidade','beneficio_combinado']) OR jsonb_typeof(v_item->'value') IS DISTINCT FROM 'string' OR length(v_item->>'value') NOT BETWEEN 1 AND 12000 OR jsonb_typeof(v_item->'identity') IS DISTINCT FROM 'object' OR jsonb_typeof(v_item->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'product_evidence_shape' USING ERRCODE='22023'; END IF;
       IF ((v_item->'identity')-ARRAY['entity','id','name','manufacturer','registration','scientificName','strain','purpose','synonyms','concentration','presentation','researchScope'])<>'{}'
         OR v_item->'identity'->>'entity' IS DISTINCT FROM 'produto'
         OR jsonb_typeof(v_item->'identity'->'id') IS DISTINCT FROM 'string'
         OR (v_item->'identity'->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR jsonb_typeof(v_item->'identity'->'name') IS DISTINCT FROM 'string' OR length(v_item->'identity'->>'name') NOT BETWEEN 1 AND 1000
         OR jsonb_typeof(v_item->'identity'->'manufacturer') IS DISTINCT FROM 'string' OR length(v_item->'identity'->>'manufacturer')>1000
         OR jsonb_typeof(v_item->'identity'->'registration') IS DISTINCT FROM 'string' OR length(v_item->'identity'->>'registration')>1000
         OR jsonb_array_length(v_item->'sources') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'product_evidence_identity' USING ERRCODE='22023'; END IF;
       FOR k IN SELECT jsonb_object_keys(v_item->'identity') LOOP
         IF k=ANY(ARRAY['scientificName','strain','purpose','synonyms','concentration','presentation']) AND (jsonb_typeof(v_item->'identity'->k) IS DISTINCT FROM 'string' OR length(v_item->'identity'->>k)>2000) THEN RAISE EXCEPTION 'product_evidence_identity' USING ERRCODE='22023'; END IF;
       END LOOP;
       IF v_item->'identity' ? 'researchScope' AND (jsonb_typeof(v_item->'identity'->'researchScope') IS DISTINCT FROM 'string' OR NOT (v_item->'identity'->>'researchScope')=ANY(ARRAY['species','product_strain'])) THEN RAISE EXCEPTION 'product_evidence_identity' USING ERRCODE='22023'; END IF;
       IF (v_item->>'field')=ANY(v_seen) THEN RAISE EXCEPTION 'product_evidence_duplicate_field' USING ERRCODE='22023'; END IF;
       v_seen := array_append(v_seen,v_item->>'field');
       IF p_payload->>(v_item->>'field') IS DISTINCT FROM v_item->>'value' THEN RAISE EXCEPTION 'product_evidence_value_mismatch' USING ERRCODE='22023'; END IF;
       FOR v_source IN SELECT value FROM jsonb_array_elements(v_item->'sources') LOOP
         IF jsonb_typeof(v_source) IS DISTINCT FROM 'object' OR (v_source-ARRAY['url','title','excerpt'])<>'{}' OR NOT platform_private.product_source_https_v1(v_source->>'url') OR jsonb_typeof(v_source->'url') IS DISTINCT FROM 'string' OR jsonb_typeof(v_source->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(v_source->'excerpt') IS DISTINCT FROM 'string' OR coalesce(v_source->>'title','')='' OR coalesce(v_source->>'excerpt','')='' OR octet_length(v_source::text)>20000 THEN RAISE EXCEPTION 'product_source_invalid' USING ERRCODE='22023'; END IF;
       END LOOP;
     END LOOP;
     p_payload := p_payload-'documentary_evidence';
   END IF;
   SELECT * INTO v_cfg''')
 new=replace(new,"coalesce(p_expected_updated_at::text,'')))","coalesce(p_expected_updated_at::text,''),coalesce(v_evidence::text,'')))")
 new=replace(new,'  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;', product_fence+'  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;')
 # Avoid changing idempotency hashes of every existing command.
 new=replace(new,"coalesce(p_expected_updated_at::text,''),coalesce(v_evidence::text,'')))","coalesce(p_expected_updated_at::text,'')));\n  IF v_evidence IS NOT NULL THEN v_hash := md5(v_hash || v_evidence::text); END IF;\n  IF v_children IS NOT NULL THEN v_hash := md5(v_hash || v_children::text); END IF")
 new=replace(new,"  v_row := jsonb_build_object('ok'",'''  IF v_children IS NOT NULL THEN
     PERFORM platform_private.product_relations_apply_v1((v_row->>'produto_id')::uuid,v_org,v_children);
   END IF;
   IF v_evidence IS NOT NULL THEN
     v_product := (v_row->>'produto_id')::uuid;
     IF platform_private.tenant_catalog_ref_owner('produtos',v_product) IS DISTINCT FROM v_org OR platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_evidence_denied' USING ERRCODE='42501'; END IF;
     SELECT nome INTO v_product_name FROM public.produtos WHERE id=v_product AND owner_organization_id=v_org FOR SHARE;
     IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
     FOR v_item IN SELECT value FROM jsonb_array_elements(v_evidence) LOOP
       IF v_item->'identity'->>'name' IS DISTINCT FROM v_product_name OR v_item->'identity'->>'id' IS DISTINCT FROM v_product::text THEN RAISE EXCEPTION 'product_evidence_identity' USING ERRCODE='22023'; END IF;
     END LOOP;
     INSERT INTO platform_private.product_evidence_history_v1(product_id,profile_id,profile_revision,actor_id,evidence) VALUES(v_product,(v_row->>'id')::uuid,(v_row->>'updated_at')::timestamptz,v_uid,v_evidence);
   END IF;
   IF (v_children IS NOT NULL OR v_evidence IS NOT NULL) AND platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
   v_row := jsonb_build_object('ok' ''')
 # Only the product profile changes authority: other roots retain their exact actor path.
 new=replace(new,"  v_org := platform_private.catalog_tenant_actor('mutate');", "  IF p_root = 'product_technical_profiles' THEN v_org := platform_private.recorte_a_actor_fresh('mutate'); ELSE v_org := platform_private.catalog_tenant_actor('mutate'); END IF;")
 new=replace(new,"    v_org2 := platform_private.catalog_tenant_actor('mutate');", "    IF p_root = 'product_technical_profiles' THEN v_org2 := platform_private.recorte_a_actor_fresh('mutate'); ELSE v_org2 := platform_private.catalog_tenant_actor('mutate'); END IF;")
 # Each ref_owner can wait FOR SHARE; fresh authority must precede any subsequent branch.
 new=replace(new,"      IF v_ref IS DISTINCT FROM v_org",product_fence+"      IF v_ref IS DISTINCT FROM v_org")
 new=replace(new,"    IF v_parent IS DISTINCT FROM v_org",product_fence+"    IF v_parent IS DISTINCT FROM v_org")
 # DML can wait on triggers, FK/unique constraints. Fence before receipt and after its INSERT.
 new=replace(new,"  INSERT INTO platform_private.tenant_catalog_root_receipts",product_fence+"  INSERT INTO platform_private.tenant_catalog_root_receipts")
 new=replace(new,"  RETURN v_row;",product_fence+"  RETURN v_row;")
 new=replace(new,"   SELECT * INTO v_cfg",product_fence+"   SELECT * INTO v_cfg")
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
DECLARE org uuid; result jsonb; current_profile uuid; current_revision timestamptz; previous_evidence jsonb; previous_revision timestamptz;
BEGIN
 org:=platform_private.recorte_a_actor_fresh('read_catalog');
 PERFORM 1 FROM platform_private.product_evidence_gate_v1 WHERE singleton AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'product_evidence_closed' USING ERRCODE='42501'; END IF;
 IF platform_private.recorte_a_actor_fresh('read_catalog') IS DISTINCT FROM org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.produtos WHERE id=p_product_id AND owner_organization_id=org) THEN RAISE EXCEPTION 'product_evidence_denied' USING ERRCODE='42501'; END IF;
 -- One statement snapshot for profile plus latest accepted evidence. Do not search
 -- older snapshots per field: an explicit empty evidence snapshot must not resurrect sources.
 SELECT p.id,p.updated_at,h.profile_revision,h.evidence,
   coalesce((SELECT jsonb_agg(item ORDER BY ordinal) FROM jsonb_array_elements(coalesce(h.evidence,'[]'::jsonb)) WITH ORDINALITY e(item,ordinal)
     WHERE item->'identity'->>'id'=p_product_id::text AND item->'identity'->>'name'=product.nome
       AND jsonb_typeof(to_jsonb(p)->(item->>'field'))='string'
       AND to_jsonb(p)->>(item->>'field')=item->>'value'),'[]'::jsonb)
 INTO current_profile,current_revision,previous_revision,previous_evidence,result
 FROM public.product_technical_profiles p JOIN public.produtos product ON product.id=p.produto_id AND product.owner_organization_id=org
 LEFT JOIN LATERAL (SELECT profile_revision,evidence FROM platform_private.product_evidence_history_v1
   WHERE product_id=p_product_id AND profile_id=p.id AND profile_revision<=p.updated_at ORDER BY sequence DESC LIMIT 1) h ON true
 WHERE p.produto_id=p_product_id;
 IF platform_private.recorte_a_actor_fresh('read_catalog') IS DISTINCT FROM org THEN RAISE EXCEPTION 'product_actor_changed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('product_id',p_product_id,'profile_id',current_profile,'profile_revision',current_revision,'evidence',coalesce(result,'[]'::jsonb),'history',CASE WHEN previous_revision IS NOT NULL AND (previous_revision<current_revision OR previous_evidence IS DISTINCT FROM result) THEN jsonb_build_object('profile_id',current_profile,'profile_revision',previous_revision,'evidence',previous_evidence) ELSE NULL END);
END $f$;
REVOKE ALL ON FUNCTION public.tenant_product_documentary_read_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_product_documentary_read_v1(uuid) TO authenticated;
"""
schema="""CREATE TABLE platform_private.product_evidence_gate_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.product_evidence_gate_v1 VALUES(true,false);
CREATE TABLE platform_private.product_evidence_history_v1(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,product_id uuid NOT NULL REFERENCES public.produtos(id),profile_id uuid NOT NULL REFERENCES public.product_technical_profiles(id),profile_revision timestamptz NOT NULL,actor_id uuid NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE platform_private.product_evidence_gate_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.product_evidence_history_v1 ENABLE ROW LEVEL SECURITY;
CREATE INDEX product_evidence_history_v1_latest ON platform_private.product_evidence_history_v1(product_id,sequence DESC);
REVOKE ALL ON platform_private.product_evidence_gate_v1,platform_private.product_evidence_history_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE platform_private.product_evidence_history_v1_sequence_seq FROM PUBLIC,anon,authenticated,service_role;
"""
write(H/'source.sql.review',schema+helper+(H/'relations.sql.review').read_text(encoding='utf-8')+reader+new)
if __name__ == '__main__' and len(sys.argv)>1:
 raise SystemExit('USE assemble.py --pre EXACT --post EXACT --out OUT; legacy incomplete capture cannot install')
