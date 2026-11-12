BEGIN;
DO $pre$ BEGIN
 IF to_regprocedure('platform_private.catalog_tenant_actor(text)') IS NULL OR to_regprocedure('platform_private.tenant_catalog_ref_owner(text,uuid)') IS NULL THEN RAISE EXCEPTION 'CATALOG_FOUNDATION_MISSING'; END IF;
 IF to_regclass('platform_private.catalog_extensions_gate_v1') IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_INSTALLED_REVIEW_REQUIRED'; END IF;
END $pre$;
CREATE TABLE platform_private.catalog_extensions_gate_v1(singleton boolean PRIMARY KEY DEFAULT true, enabled boolean NOT NULL DEFAULT false);
INSERT INTO platform_private.catalog_extensions_gate_v1 VALUES(true,false);
CREATE TABLE platform_private.catalog_own_problems_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, nome text NOT NULL, categoria text NOT NULL, nome_cientifico text, ativo boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(organization_id,categoria,nome));
CREATE TABLE platform_private.catalog_profile_links_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, entity text NOT NULL, parent uuid NOT NULL, culture_id uuid REFERENCES public.culturas(id), problem_id uuid REFERENCES platform_private.catalog_own_problems_v1(id), observacao text, ativo boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE platform_private.catalog_extensions_receipts_v1(actor uuid NOT NULL, org uuid NOT NULL, key uuid NOT NULL, intent jsonb NOT NULL, result jsonb NOT NULL, PRIMARY KEY(actor,org,key));
CREATE TABLE platform_private.catalog_active_families_v1(value text PRIMARY KEY, label text NOT NULL, active boolean NOT NULL DEFAULT true);
INSERT INTO platform_private.catalog_active_families_v1 VALUES ('biologico','Biológicos',true),('quimico','Produtos químicos',true),('fertilizante_adubo','Fertilizantes/Adubos',true);
REVOKE ALL ON platform_private.catalog_extensions_gate_v1,platform_private.catalog_own_problems_v1,platform_private.catalog_profile_links_v1,platform_private.catalog_extensions_receipts_v1,platform_private.catalog_active_families_v1 FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.catalog_own_problems_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.catalog_profile_links_v1 ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION platform_private.catalog_extensions_scope_v1(p_write boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE org uuid;
BEGIN
 org:=platform_private.catalog_tenant_actor(CASE WHEN p_write THEN 'mutate' ELSE 'read_catalog' END);
 IF org IS NULL OR auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM platform_private.catalog_extensions_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'catalog_extensions_closed' USING ERRCODE='42501'; END IF;
 RETURN org;
END $f$;
CREATE FUNCTION platform_private.catalog_extensions_read_core_v1(p_kind text,p_entity text,p_parent uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE org uuid; result jsonb;
BEGIN
 org:=platform_private.catalog_extensions_scope_v1(false);
 IF p_kind='problems' THEN SELECT coalesce(jsonb_agg(to_jsonb(x)-'organization_id' ORDER BY nome),'[]') INTO result FROM platform_private.catalog_own_problems_v1 x WHERE organization_id=org;
 ELSIF p_kind='links' THEN
  IF p_entity NOT IN ('produto','microrganismo') OR p_parent IS NULL THEN RAISE EXCEPTION 'invalid_parent' USING ERRCODE='22023'; END IF;
  IF platform_private.tenant_catalog_ref_owner(CASE p_entity WHEN 'produto' THEN 'produtos' ELSE 'microrganismos' END,p_parent) IS DISTINCT FROM org THEN RAISE EXCEPTION 'parent_foreign' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)-'organization_id' ORDER BY updated_at),'[]') INTO result FROM platform_private.catalog_profile_links_v1 x WHERE organization_id=org AND entity=p_entity AND parent=p_parent;
 ELSE RAISE EXCEPTION 'kind_invalid' USING ERRCODE='22023'; END IF;
 IF platform_private.catalog_extensions_scope_v1(false) IS DISTINCT FROM org THEN RAISE EXCEPTION 'scope_changed' USING ERRCODE='42501'; END IF;
 RETURN result;
END $f$;
CREATE FUNCTION public.tenant_catalog_extensions_read_v1(p_kind text,p_entity text,p_parent uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT platform_private.catalog_extensions_read_core_v1(p_kind,p_entity,p_parent) $f$;
CREATE FUNCTION platform_private.catalog_extensions_save_core_v1(p_kind text,p_entity text,p_parent uuid,p_id uuid,p_expected timestamptz,p_payload jsonb,p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
#variable_conflict use_variable
DECLARE org uuid; intent jsonb; receipt record; prev jsonb; result jsonb; rid uuid; ver timestamptz; field text; culture uuid; problem uuid; owner uuid;
BEGIN
 org:=platform_private.catalog_extensions_scope_v1(true);
 IF p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_kind NOT IN ('problems','links') OR p_kind IS NULL THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL AND p_expected IS NULL THEN RAISE EXCEPTION 'cas_required' USING ERRCODE='PT409'; END IF;
 FOR field IN SELECT jsonb_object_keys(p_payload) LOOP
  IF (p_kind='problems' AND field NOT IN ('nome','categoria','nome_cientifico','ativo')) OR (p_kind='links' AND field NOT IN ('culture_id','problem_id','observacao','ativo')) THEN RAISE EXCEPTION 'field_forbidden' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_kind='links' THEN
  IF p_entity IS NULL OR p_entity NOT IN ('produto','microrganismo') OR p_parent IS NULL THEN RAISE EXCEPTION 'invalid_parent' USING ERRCODE='22023'; END IF;
  -- Stable parent-before-receipt order; two links cannot lock parents in opposite order.
  IF platform_private.tenant_catalog_ref_owner(CASE p_entity WHEN 'produto' THEN 'produtos' ELSE 'microrganismos' END,p_parent) IS DISTINCT FROM org THEN RAISE EXCEPTION 'parent_foreign' USING ERRCODE='42501'; END IF;
 END IF;
 intent:=jsonb_build_array(p_kind,p_entity,p_parent,p_id,p_expected,p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','catalogext',auth.uid(),org,p_key),0));
 IF platform_private.catalog_extensions_scope_v1(true) IS DISTINCT FROM org THEN RAISE EXCEPTION 'scope_changed' USING ERRCODE='42501'; END IF;
 SELECT * INTO receipt FROM platform_private.catalog_extensions_receipts_v1 WHERE actor=auth.uid() AND catalog_extensions_receipts_v1.org=org AND key=p_key;
 IF FOUND THEN IF receipt.intent IS DISTINCT FROM intent THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='PT409'; END IF; RETURN receipt.result||'{"replayed":true}'::jsonb; END IF;
 IF p_id IS NOT NULL THEN
  IF p_kind='problems' THEN SELECT to_jsonb(x) INTO prev FROM platform_private.catalog_own_problems_v1 x WHERE id=p_id AND organization_id=org FOR UPDATE;
  ELSE SELECT to_jsonb(x) INTO prev FROM platform_private.catalog_profile_links_v1 x WHERE id=p_id AND organization_id=org AND entity=p_entity AND parent=p_parent FOR UPDATE; END IF;
  IF prev IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='42501'; END IF;
  IF (prev->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'catalog_stale' USING ERRCODE='PT409'; END IF;
 END IF;
 IF platform_private.catalog_extensions_scope_v1(true) IS DISTINCT FROM org THEN RAISE EXCEPTION 'scope_changed' USING ERRCODE='42501'; END IF;
 p_payload:=coalesce(prev,'{}')||p_payload;
 ver:=greatest(clock_timestamp(),coalesce(p_expected,clock_timestamp())+interval '1 microsecond'); rid:=coalesce(p_id,gen_random_uuid());
 IF p_kind='problems' THEN
  IF length(trim(coalesce(p_payload->>'nome',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(p_payload->>'categoria','')) NOT BETWEEN 1 AND 80 OR length(coalesce(p_payload->>'nome_cientifico',''))>200 THEN RAISE EXCEPTION 'problem_invalid' USING ERRCODE='22023'; END IF;
  INSERT INTO platform_private.catalog_own_problems_v1(id,organization_id,nome,categoria,nome_cientifico,ativo,updated_at) VALUES(rid,org,trim(p_payload->>'nome'),p_payload->>'categoria',p_payload->>'nome_cientifico',coalesce((p_payload->>'ativo')::boolean,true),ver)
  ON CONFLICT(id) DO UPDATE SET nome=excluded.nome,categoria=excluded.categoria,nome_cientifico=excluded.nome_cientifico,ativo=excluded.ativo,updated_at=excluded.updated_at;
 ELSE
  culture:=(p_payload->>'culture_id')::uuid; problem:=(p_payload->>'problem_id')::uuid;
  IF culture IS NULL AND problem IS NULL OR length(coalesce(p_payload->>'observacao',''))>4000 THEN RAISE EXCEPTION 'link_invalid' USING ERRCODE='22023'; END IF;
  IF culture IS NOT NULL AND platform_private.tenant_catalog_ref_owner('culturas',culture) IS DISTINCT FROM org THEN RAISE EXCEPTION 'culture_foreign' USING ERRCODE='42501'; END IF;
  IF problem IS NOT NULL THEN SELECT organization_id INTO owner FROM platform_private.catalog_own_problems_v1 WHERE id=problem AND ativo FOR SHARE; IF owner IS DISTINCT FROM org THEN RAISE EXCEPTION 'problem_foreign' USING ERRCODE='42501'; END IF; END IF;
  IF platform_private.catalog_extensions_scope_v1(true) IS DISTINCT FROM org THEN RAISE EXCEPTION 'scope_changed' USING ERRCODE='42501'; END IF;
  INSERT INTO platform_private.catalog_profile_links_v1(id,organization_id,entity,parent,culture_id,problem_id,observacao,ativo,updated_at) VALUES(rid,org,p_entity,p_parent,culture,problem,p_payload->>'observacao',coalesce((p_payload->>'ativo')::boolean,true),ver)
  ON CONFLICT(id) DO UPDATE SET culture_id=excluded.culture_id,problem_id=excluded.problem_id,observacao=excluded.observacao,ativo=excluded.ativo,updated_at=excluded.updated_at;
 END IF;
 result:=jsonb_build_object('ok',true,'id',rid,'updated_at',ver,'replayed',false);
 INSERT INTO platform_private.catalog_extensions_receipts_v1 VALUES(auth.uid(),org,p_key,intent,result);
 RETURN result;
END $f$;
CREATE FUNCTION public.tenant_catalog_extensions_save_v1(p_kind text,p_entity text,p_parent uuid,p_id uuid,p_expected timestamptz,p_payload jsonb,p_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT platform_private.catalog_extensions_save_core_v1(p_kind,p_entity,p_parent,p_id,p_expected,p_payload,p_key) $f$;
CREATE FUNCTION public.tenant_catalog_active_families_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN PERFORM platform_private.catalog_extensions_scope_v1(false); RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('value',value,'label',label) ORDER BY value),'[]') FROM platform_private.catalog_active_families_v1 WHERE active); END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_extensions_scope_v1(boolean),platform_private.catalog_extensions_read_core_v1(text,text,uuid),platform_private.catalog_extensions_save_core_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid),public.tenant_catalog_extensions_read_v1(text,text,uuid),public.tenant_catalog_extensions_save_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid),public.tenant_catalog_active_families_v1() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
