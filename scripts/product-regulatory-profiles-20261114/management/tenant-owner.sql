BEGIN;
DROP INDEX public.mrd_uq_micro_version;
CREATE UNIQUE INDEX mrd_uq_micro_version ON public.microorganism_regulatory_dossiers(microorganism_id,version) WHERE product_id IS NULL;
CREATE UNIQUE INDEX mrd_uq_product_version ON public.microorganism_regulatory_dossiers(product_id,version) WHERE product_id IS NOT NULL;
-- Compatible delta: retain old RPC names, signatures, paths, legacy rows and pointers.
CREATE OR REPLACE FUNCTION platform_private.product_dossier_read_scope(p_product uuid,p_micro uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 org:=platform_private.catalog_tenant_actor('read_catalog');
 IF org IS NULL OR NOT EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_product AND p.owner_organization_id=org AND NOT p.e_insumo) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_micro IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_micro AND m.owner_organization_id=org AND (m.product_id=p_product OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p_product AND f.microrganismo_id=m.id AND f.owner_organization_id=org))) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_read_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_manage_scope(p_product uuid,p_micro uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 org:=platform_private.catalog_tenant_actor('mutate');
 IF org IS DISTINCT FROM platform_private.product_dossier_read_scope(p_product,p_micro) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
CREATE OR REPLACE FUNCTION platform_private.regulatory_product_scope(p_micro uuid,p_product uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 IF p_product IS NOT NULL THEN RETURN platform_private.product_dossier_read_scope(p_product,p_micro); END IF;
 org:=platform_private.catalog_tenant_actor('read_catalog');
 IF org IS NULL OR NOT public.fn_regulatory_can_read() OR NOT EXISTS(SELECT 1 FROM public.microrganismos WHERE id=p_micro AND owner_organization_id=org) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
ALTER TABLE public.microorganism_regulatory_dossiers ADD COLUMN IF NOT EXISTS covered_microorganism_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.microorganism_regulatory_documents ADD COLUMN IF NOT EXISTS covered_microorganism_ids uuid[] NOT NULL DEFAULT '{}';
-- Empty dossier coverage means historical single-anchor coverage only, not inferred composition.
CREATE OR REPLACE FUNCTION platform_private.product_dossier_coverage(p_dossier uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT CASE WHEN cardinality(covered_microorganism_ids)=0 THEN ARRAY[microorganism_id] ELSE covered_microorganism_ids END FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_coverage(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_row_read(p_dossier uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; d public.microorganism_regulatory_dossiers; BEGIN
 org:=platform_private.catalog_tenant_actor('read_catalog');
 SELECT * INTO d FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier AND deleted_at IS NULL;
 IF d.id IS NULL THEN RETURN false; END IF;
 IF d.product_id IS NOT NULL THEN RETURN org=platform_private.product_dossier_read_scope(d.product_id); END IF;
 RETURN public.fn_regulatory_can_read() AND EXISTS(SELECT 1 FROM public.microrganismos WHERE id=d.microorganism_id AND owner_organization_id=org);
 EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_row_read(uuid) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION platform_private.product_dossier_row_read(uuid) TO authenticated;
DO $$ DECLARE t text; col text; BEGIN
 FOREACH t IN ARRAY ARRAY['microorganism_regulatory_dossiers','microorganism_regulatory_documents','microorganism_regulatory_checklist','microorganism_regulatory_presentations','microorganism_regulatory_publication_snapshots','microorganism_ncm_candidates'] LOOP
 col:=CASE WHEN t='microorganism_regulatory_dossiers' THEN 'id' ELSE 'dossier_id' END;
 EXECUTE format('CREATE POLICY dossier_owner_session_fence ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(platform_private.product_dossier_row_read(%I))',t,col);
 END LOOP;
END $$;
-- Reads have their own authority; no writer or superadmin grant is needed.
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_list(p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 org:=platform_private.catalog_tenant_actor('read_catalog');
 IF p_search IS NULL OR length(p_search)>120 THEN RAISE EXCEPTION 'REGULATORY_SEARCH_INVALID' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT p.id product_id,p.nome,p.codigo,p.ativo,o.nome organization_name,p.owner_organization_id FROM public.produtos p JOIN public.organizations o ON o.id=p.owner_organization_id WHERE p.owner_organization_id=org AND NOT p.e_insumo AND (p_search='' OR p.nome ILIKE '%'||p_search||'%' OR p.codigo ILIKE '%'||p_search||'%') ORDER BY p.nome,p.id LIMIT 100)q);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_context(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; writable boolean:=false; BEGIN
 org:=platform_private.product_dossier_read_scope(p_product_id);
 BEGIN writable:=org=platform_private.catalog_tenant_actor('mutate'); EXCEPTION WHEN insufficient_privilege THEN writable:=false; END;
 RETURN jsonb_build_object('product_id',p_product_id,'can_edit',writable,
 'microorganisms',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'nome',m.nome,'codigo',m.codigo) ORDER BY m.nome,m.id),'[]'::jsonb) FROM public.microrganismos m WHERE m.owner_organization_id=org AND (m.product_id=p_product_id OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p_product_id AND f.microrganismo_id=m.id AND f.owner_organization_id=org))),
 'dossier_microorganism_id',(SELECT d.microorganism_id FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers d ON d.id=l.dossier_id WHERE l.product_id=p_product_id AND d.deleted_at IS NULL),
 'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'status',status) ORDER BY version DESC),'[]'::jsonb) FROM public.microorganism_regulatory_dossiers WHERE product_id=p_product_id AND deleted_at IS NULL));
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_set_coverage(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_microorganism_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; m uuid; ids uuid[]; BEGIN
 d:=platform_private.product_dossier_lock(p_product_id,p_dossier_id,p_expected_updated_at);
 SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(p_microorganism_ids) x;
 IF cardinality(ids) IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 100 OR array_position(ids,NULL) IS NOT NULL OR NOT d.microorganism_id=ANY(ids) THEN RAISE EXCEPTION 'REGULATORY_COVERAGE_INVALID' USING ERRCODE='22023'; END IF;
 FOREACH m IN ARRAY ids LOOP PERFORM platform_private.product_dossier_manage_scope(p_product_id,m); END LOOP;
 IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents WHERE dossier_id=d.id AND deleted_at IS NULL AND NOT covered_microorganism_ids<@ids) THEN RAISE EXCEPTION 'REGULATORY_DOCUMENT_COVERAGE_CONFLICT' USING ERRCODE='PT409'; END IF;
 UPDATE public.microorganism_regulatory_dossiers SET covered_microorganism_ids=ids,technical_review_status='PENDING',regulatory_review_status='PENDING',fiscal_review_status='PENDING',updated_by=auth.uid() WHERE id=d.id RETURNING * INTO d;
 DELETE FROM platform_private.product_dossier_write_permits WHERE txid=txid_current() AND dossier_id=d.id;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',d.id,'updated_at',d.updated_at);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_create_covered(p_product_id uuid,p_microorganism_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE ids uuid[]; m uuid; ack jsonb; d public.microorganism_regulatory_dossiers; existed boolean; BEGIN
 SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM unnest(p_microorganism_ids) x;
 IF cardinality(ids) IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 100 OR array_position(ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'REGULATORY_COVERAGE_INVALID' USING ERRCODE='22023'; END IF;
 FOREACH m IN ARRAY ids LOOP PERFORM platform_private.product_dossier_manage_scope(p_product_id,m); END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-dossier:'||p_product_id,0));
 SELECT EXISTS(SELECT 1 FROM public.product_regulatory_dossier_links WHERE product_id=p_product_id) INTO existed;
 ack:=platform_private.product_dossier_management_create(p_product_id,ids[1]);
 SELECT * INTO d FROM public.microorganism_regulatory_dossiers WHERE id=(ack->>'dossier_id')::uuid;
 IF existed THEN
 IF platform_private.product_dossier_coverage(d.id) IS DISTINCT FROM ids THEN RAISE EXCEPTION 'REGULATORY_COVERAGE_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN ack;
 END IF;
 RETURN platform_private.product_dossier_set_coverage(p_product_id,d.id,d.updated_at,ids);
END $$;
-- Optional document subset: empty means whole explicit dossier coverage, never another product.
DO $$ DECLARE b text; BEGIN
 b:=pg_get_functiondef('platform_private.product_dossier_upload_prepare(uuid,uuid,timestamptz,uuid,jsonb)'::regprocedure);
 IF position('sz:=(p_intent' in b)=0 THEN RAISE EXCEPTION 'REGULATORY_PREPARE_DRIFT'; END IF;
 b:=replace(b,'sz:=(p_intent', $s$IF p_intent ? 'microorganism_ids' THEN
 IF jsonb_typeof(p_intent->'microorganism_ids')<>'array' OR jsonb_array_length(p_intent->'microorganism_ids')>100 THEN RAISE EXCEPTION 'REGULATORY_DOCUMENT_COVERAGE_INVALID' USING ERRCODE='22023'; END IF;
 IF NOT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_intent->'microorganism_ids')) <@ platform_private.product_dossier_coverage(d.id) THEN RAISE EXCEPTION 'REGULATORY_DOCUMENT_COVERAGE_INVALID' USING ERRCODE='22023'; END IF;
 END IF; sz:=(p_intent$s$); EXECUTE b;
 b:=pg_get_functiondef('platform_private.product_dossier_upload_finalize(uuid)'::regprocedure);
 IF position('UPDATE public.microorganism_regulatory_dossiers SET' in b)=0 THEN RAISE EXCEPTION 'REGULATORY_FINALIZE_DRIFT'; END IF;
 b:=replace(b,'UPDATE public.microorganism_regulatory_dossiers SET', $s$UPDATE public.microorganism_regulatory_documents SET covered_microorganism_ids=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(u.intent->'microorganism_ids','[]'::jsonb))) WHERE id=u.id;
 UPDATE public.microorganism_regulatory_dossiers SET$s$); EXECUTE b;
END $$;
-- Storage old/global helper aliases now resolve through the same fresh owner-session proof.
CREATE OR REPLACE FUNCTION platform_private.product_regulatory_storage_read_allowed(p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE d uuid; BEGIN
 IF NOT public.fn_regulatory_storage_path_ok(p_path) THEN RETURN false; END IF;
 SELECT dossier_id INTO d FROM public.microorganism_regulatory_documents WHERE storage_path=p_path AND storage_bucket='fiscal-regulatorio' AND deleted_at IS NULL AND split_part(p_path,'/',2)=dossier_id::text AND split_part(p_path,'/',3)=id::text;
 RETURN coalesce(platform_private.product_dossier_row_read(d),false);
END $$;
CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_can_read(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT platform_private.product_regulatory_storage_read_allowed(_name) $$;
CREATE OR REPLACE FUNCTION public.fn_regulatory_storage_can_write(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 org:=platform_private.catalog_tenant_actor('mutate');
 RETURN EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers d JOIN public.microrganismos m ON m.id=d.microorganism_id WHERE d.id=public.fn_regulatory_storage_dossier_id(_name) AND d.product_id IS NULL AND d.deleted_at IS NULL AND d.status IN ('DRAFT','PENDING_REVIEW') AND m.owner_organization_id=org AND NOT EXISTS(SELECT 1 FROM public.microorganism_regulatory_publication_snapshots WHERE dossier_id=d.id));
 EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.fn_regulatory_storage_can_read(text),public.fn_regulatory_storage_can_write(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.fn_regulatory_storage_can_read(text),public.fn_regulatory_storage_can_write(text) TO authenticated;
-- No direct Storage insertion/overwrite/deletion for product dossiers: tracked Edge only.
CREATE POLICY dossier_tracked_upload_only ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'fiscal-regulatorio' OR public.fn_regulatory_storage_can_write(name));
CREATE POLICY dossier_tracked_update_only ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'fiscal-regulatorio' OR public.fn_regulatory_storage_can_write(name)) WITH CHECK(bucket_id<>'fiscal-regulatorio' OR public.fn_regulatory_storage_can_write(name));
CREATE POLICY dossier_tracked_delete_only ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'fiscal-regulatorio' OR public.fn_regulatory_storage_can_write(name));
-- Exact facts stay private and require tenant authority even when called by a definer.
DO $$ DECLARE b text; BEGIN
 b:=pg_get_functiondef('platform_private.product_dossier_facts(uuid)'::regprocedure);
 b:=regexp_replace(b,'SELECT \(auth.uid\(\) IS NULL.*?AS ok','SELECT platform_private.product_dossier_row_read(p_dossier_id) AS ok','s'); EXECUTE b;
END $$;

CREATE OR REPLACE FUNCTION platform_private.product_dossier_new_version(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; r public.microorganism_regulatory_dossiers; BEGIN
 PERFORM platform_private.product_dossier_manage_scope(p_product_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('product-dossier:'||p_product_id,0));
 SELECT z.* INTO d FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers z ON z.id=l.dossier_id WHERE l.product_id=p_product_id AND z.id=p_dossier_id AND z.product_id=p_product_id AND z.deleted_at IS NULL FOR UPDATE OF z;
 PERFORM platform_private.product_dossier_manage_scope(p_product_id,d.microorganism_id);
 IF d.id IS NULL OR d.status NOT IN ('VALIDATED','BLOCKED') OR d.updated_at IS DISTINCT FROM p_expected_updated_at OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'REGULATORY_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 r:=jsonb_populate_record(d,jsonb_build_object('id',gen_random_uuid(),'version',(SELECT max(version)+1 FROM public.microorganism_regulatory_dossiers WHERE product_id=p_product_id),'status','DRAFT','technical_review_status','PENDING','regulatory_review_status','PENDING','fiscal_review_status','PENDING','published_at',NULL,'published_by',NULL,'published_ncm',NULL,'published_cest',NULL,'published_ncm_candidate_id',NULL,'blocked_reason',NULL,'effective_from',NULL,'effective_to',NULL,'created_by',auth.uid(),'updated_by',auth.uid(),'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
 INSERT INTO platform_private.product_dossier_write_permits VALUES(txid_current(),r.id);
 INSERT INTO public.microorganism_regulatory_dossiers SELECT (r).*;
 UPDATE public.product_regulatory_dossier_links SET dossier_id=r.id WHERE product_id=p_product_id;
 INSERT INTO public.microorganism_regulatory_checklist(dossier_id,item_key,state) SELECT r.id,item_key,'PENDING' FROM public.microorganism_regulatory_checklist WHERE dossier_id=d.id;
 DELETE FROM platform_private.product_dossier_write_permits WHERE txid=txid_current() AND dossier_id=r.id;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',r.id,'updated_at',r.updated_at);
END $$;
DO $$ DECLARE b text; BEGIN
 b:=pg_get_functiondef('platform_private.product_dossier_link_integrity()'::regprocedure);
 IF position('NEW.dossier_id IS DISTINCT FROM OLD.dossier_id)' in b)=0 THEN RAISE EXCEPTION 'REGULATORY_LINK_DRIFT'; END IF;
 b:=replace(b,'NEW.dossier_id IS DISTINCT FROM OLD.dossier_id)', 'NEW.dossier_id IS DISTINCT FROM OLD.dossier_id) AND NOT (NEW.product_id=OLD.product_id AND EXISTS(SELECT 1 FROM platform_private.product_dossier_write_permits WHERE txid=txid_current() AND dossier_id=NEW.dossier_id))'); EXECUTE b;
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_version_detail(p_product_id uuid,p_dossier_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; current_id uuid; BEGIN
 PERFORM platform_private.product_dossier_read_scope(p_product_id);
 SELECT * INTO d FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier_id AND product_id=p_product_id AND deleted_at IS NULL;
 IF d.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT dossier_id INTO current_id FROM public.product_regulatory_dossier_links WHERE product_id=p_product_id;
 IF current_id=d.id THEN RETURN platform_private.rpc_regulatory_product_dossier_detail(d.microorganism_id,p_product_id); END IF;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier',to_jsonb(d),'documents',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM public.microorganism_regulatory_documents x WHERE dossier_id=d.id AND deleted_at IS NULL),'[]'::jsonb),'checklist',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM public.microorganism_regulatory_checklist x WHERE dossier_id=d.id),'[]'::jsonb),'gate',jsonb_build_object('pendencies','[]'::jsonb),'historical',true);
END $$;
DO $$ DECLARE b text; BEGIN
 b:=pg_get_functiondef('platform_private.rpc_regulatory_product_document_access(uuid,uuid,uuid)'::regprocedure);
 b:=replace(b,'FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers d ON d.id=l.dossier_id','FROM public.microorganism_regulatory_dossiers d');
 b:=replace(b,'WHERE l.product_id=p_product_id','WHERE d.product_id=p_product_id'); EXECUTE b;
END $$;

-- Existing names preserved; tenant aliases are the new UI/Edge contract.
DO $$ DECLARE f record; args text; alias text; BEGIN
 FOR f IN SELECT p.oid,p.proname,pg_get_function_arguments(p.oid) arguments,pg_get_function_identity_arguments(p.oid) ident,pg_get_function_result(p.oid) result FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND (p.proname LIKE 'product_dossier_management_%' OR p.proname LIKE 'product_dossier_upload_%' OR p.proname IN ('product_dossier_set_coverage','product_dossier_create_covered','product_dossier_new_version','product_dossier_version_detail')) LOOP
 SELECT string_agg(split_part(btrim(x),' ',1),',') INTO args FROM unnest(string_to_array(f.ident,',')) x;
 alias:='tenant_'||f.proname;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $b$ SELECT platform_private.%I(%s) $b$',alias,f.arguments,f.result,f.proname,args);
 EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s),platform_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',alias,f.ident,f.proname,f.ident);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s),platform_private.%I(%s) TO %I',alias,f.ident,f.proname,f.ident,CASE WHEN f.proname IN ('product_dossier_upload_attest','product_dossier_upload_cancel') THEN 'service_role' ELSE 'authenticated' END);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_attest(uuid,text,bigint,text),public.platform_product_dossier_upload_cancel(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;