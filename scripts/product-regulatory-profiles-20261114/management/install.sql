BEGIN;
-- Scope individual dossiers without assigning any legacy evidence.
ALTER TABLE public.microorganism_regulatory_dossiers ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.produtos(id) ON DELETE RESTRICT;
DROP INDEX public.mrd_uq_open_per_micro;
DROP INDEX public.mrd_uq_published_per_micro;
CREATE UNIQUE INDEX mrd_uq_open_per_micro ON public.microorganism_regulatory_dossiers(microorganism_id) WHERE product_id IS NULL AND status IN ('DRAFT','PENDING_REVIEW') AND deleted_at IS NULL;
CREATE UNIQUE INDEX mrd_uq_published_per_micro ON public.microorganism_regulatory_dossiers(microorganism_id) WHERE product_id IS NULL AND status='VALIDATED' AND deleted_at IS NULL;
CREATE UNIQUE INDEX mrd_uq_open_per_product ON public.microorganism_regulatory_dossiers(product_id) WHERE product_id IS NOT NULL AND status IN ('DRAFT','PENDING_REVIEW') AND deleted_at IS NULL;
CREATE UNIQUE INDEX mrd_uq_published_per_product ON public.microorganism_regulatory_dossiers(product_id) WHERE product_id IS NOT NULL AND status='VALIDATED' AND deleted_at IS NULL;
-- Separate canonical micro-only readers; no product dossier leaks into legacy readiness.
DO $$ DECLARE f regprocedure; body text; BEGIN
 FOREACH f IN ARRAY ARRAY['public.fn_microorganism_regulatory_facts(uuid)'::regprocedure,'public.rpc_regulatory_dossier_detail(uuid)'::regprocedure,'platform_private.rpc_regulatory_dossier_ensure_draft__tenant_core(uuid)'::regprocedure] LOOP
 body:=pg_get_functiondef(f);
 IF position('WHERE microorganism_id = p_microorganism_id' in body)=0 THEN RAISE EXCEPTION 'REGULATORY_LEGACY_DRIFT'; END IF;
 body:=replace(body,'WHERE microorganism_id = p_microorganism_id','WHERE product_id IS NULL AND microorganism_id = p_microorganism_id'); EXECUTE body;
 END LOOP;
END $$;
CREATE TABLE platform_private.product_dossier_uploads(
 id uuid PRIMARY KEY, actor_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES public.produtos(id), dossier_id uuid NOT NULL REFERENCES public.microorganism_regulatory_dossiers(id),
 intent jsonb NOT NULL, storage_path text NOT NULL UNIQUE, sha256 text NOT NULL, size_bytes bigint NOT NULL, mime text NOT NULL,
 state text NOT NULL DEFAULT 'RESERVED', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_private.product_dossier_uploads FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.product_dossier_uploads ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_manage_scope(p_product uuid,p_micro uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 PERFORM platform_private.catalog_metadata_require_actor();
 SELECT p.owner_organization_id INTO org FROM public.produtos p JOIN public.organizations o ON o.id=p.owner_organization_id AND o.ativo AND o.status='ativa' WHERE p.id=p_product AND NOT p.e_insumo;
 IF org IS NULL THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_micro IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_micro AND m.owner_organization_id=org AND (m.product_id=p_product OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p_product AND f.microrganismo_id=m.id AND f.owner_organization_id=org))) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
CREATE OR REPLACE FUNCTION platform_private.regulatory_product_scope(p_micro uuid,p_product uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 IF public.is_platform_superadmin(auth.uid()) THEN
  IF p_product IS NOT NULL THEN RETURN platform_private.product_dossier_manage_scope(p_product,p_micro); END IF;
  PERFORM platform_private.catalog_metadata_require_actor(); SELECT owner_organization_id INTO org FROM public.microrganismos WHERE id=p_micro;
 ELSE
  IF NOT public.fn_regulatory_can_read() THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
  org:=platform_private.catalog_tenant_actor('read_catalog');
 END IF;
 IF org IS NULL OR NOT EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_micro AND m.owner_organization_id=org) OR (p_product IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.produtos p JOIN public.microrganismos m ON m.id=p_micro WHERE p.id=p_product AND p.owner_organization_id=org AND NOT p.e_insumo AND (m.product_id=p.id OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p.id AND f.microrganismo_id=m.id AND f.owner_organization_id=org)))) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN org;
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_list(p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM platform_private.catalog_metadata_require_actor();
 IF length(p_search)>120 THEN RAISE EXCEPTION 'REGULATORY_SEARCH_INVALID' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT p.id product_id,p.nome,p.codigo,p.ativo,o.nome organization_name,p.owner_organization_id FROM public.produtos p JOIN public.organizations o ON o.id=p.owner_organization_id AND o.ativo AND o.status='ativa' WHERE NOT p.e_insumo AND (p_search='' OR p.nome ILIKE '%'||p_search||'%' OR p.codigo ILIKE '%'||p_search||'%') ORDER BY p.nome,p.id LIMIT 100)q);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_context(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 org:=platform_private.product_dossier_manage_scope(p_product_id);
 RETURN jsonb_build_object('product_id',p_product_id,'microorganisms',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'nome',m.nome,'codigo',m.codigo) ORDER BY m.nome,m.id),'[]'::jsonb) FROM public.microrganismos m WHERE m.owner_organization_id=org AND (m.product_id=p_product_id OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p_product_id AND f.microrganismo_id=m.id AND f.owner_organization_id=org))), 'dossier_microorganism_id',(SELECT d.microorganism_id FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers d ON d.id=l.dossier_id WHERE l.product_id=p_product_id AND d.deleted_at IS NULL));
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_create(p_product_id uuid,p_microorganism_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; v int; BEGIN
 PERFORM platform_private.product_dossier_manage_scope(p_product_id,p_microorganism_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('product-dossier:'||p_product_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier:'||p_microorganism_id,0));
 PERFORM platform_private.product_dossier_manage_scope(p_product_id,p_microorganism_id);
 SELECT z.* INTO d FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers z ON z.id=l.dossier_id WHERE l.product_id=p_product_id;
 IF d.id IS NOT NULL THEN
  IF d.microorganism_id<>p_microorganism_id THEN RAISE EXCEPTION 'REGULATORY_MICRO_CHOICE_CONFLICT' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',d.id);
 END IF;
 SELECT coalesce(max(version),0)+1 INTO v FROM public.microorganism_regulatory_dossiers WHERE microorganism_id=p_microorganism_id;
 INSERT INTO public.microorganism_regulatory_dossiers(product_id,microorganism_id,version,status,created_by,updated_by) VALUES(p_product_id,p_microorganism_id,v,'DRAFT',auth.uid(),auth.uid()) RETURNING * INTO d;
 INSERT INTO public.product_regulatory_dossier_links(product_id,dossier_id) VALUES(p_product_id,d.id);
 INSERT INTO public.microorganism_regulatory_checklist(dossier_id,item_key,state) SELECT d.id,k,'PENDING' FROM unnest(ARRAY['FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA','TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM','CFOP','TRIBUTACAO'])k;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',d.id);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_lock(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz)
RETURNS public.microorganism_regulatory_dossiers LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; BEGIN
 PERFORM platform_private.product_dossier_manage_scope(p_product_id);
 SELECT z.* INTO d FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers z ON z.id=l.dossier_id WHERE l.product_id=p_product_id AND z.id=p_dossier_id AND z.deleted_at IS NULL FOR UPDATE OF z;
 PERFORM platform_private.product_dossier_manage_scope(p_product_id,d.microorganism_id);
 IF d.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF d.status NOT IN ('DRAFT','PENDING_REVIEW') THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'REGULATORY_VERSION_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN d;
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_save(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; k text; r public.microorganism_regulatory_dossiers; BEGIN
 d:=platform_private.product_dossier_lock(p_product_id,p_dossier_id,p_expected_updated_at);
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REGULATORY_PATCH_INVALID' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
 IF k<>ALL(ARRAY['strain_code','strain_name','regulatory_category','formulation','label_guarantee','guarantee_unit','mapa_registration_number','mapa_holder','mapa_manufacturer','mapa_status','mapa_valid_until','mapa_not_applicable_reason','notes']) OR (jsonb_typeof(p_patch->k) NOT IN ('string','null')) OR length(p_patch->>k)>10000 THEN RAISE EXCEPTION 'REGULATORY_PATCH_INVALID' USING ERRCODE='22023'; END IF; END LOOP;
 r:=jsonb_populate_record(d,p_patch);
 UPDATE public.microorganism_regulatory_dossiers SET strain_code=r.strain_code,strain_name=r.strain_name,regulatory_category=r.regulatory_category,formulation=r.formulation,label_guarantee=r.label_guarantee,guarantee_unit=r.guarantee_unit,mapa_registration_number=r.mapa_registration_number,mapa_holder=r.mapa_holder,mapa_manufacturer=r.mapa_manufacturer,mapa_status=r.mapa_status,mapa_valid_until=r.mapa_valid_until,mapa_not_applicable_reason=r.mapa_not_applicable_reason,notes=r.notes,technical_review_status='PENDING',regulatory_review_status='PENDING',fiscal_review_status='PENDING',updated_by=auth.uid() WHERE id=d.id RETURNING * INTO d;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',d.id,'updated_at',d.updated_at);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_checklist(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_item_key text,p_state text,p_justification text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; BEGIN
 d:=platform_private.product_dossier_lock(p_product_id,p_dossier_id,p_expected_updated_at);
 IF p_state IS NULL OR p_state<>ALL(ARRAY['PENDING','CONFIRMED','NOT_APPLICABLE']) OR NOT EXISTS(SELECT 1 FROM public.microorganism_regulatory_checklist WHERE dossier_id=d.id AND item_key=p_item_key) OR (p_state='NOT_APPLICABLE' AND length(btrim(coalesce(p_justification,'')))=0) THEN RAISE EXCEPTION 'REGULATORY_CHECKLIST_INVALID' USING ERRCODE='22023'; END IF;
 UPDATE public.microorganism_regulatory_checklist SET state=p_state,justification=p_justification,decided_by=CASE WHEN p_state='PENDING' THEN NULL ELSE auth.uid() END,decided_at=CASE WHEN p_state='PENDING' THEN NULL ELSE now() END WHERE dossier_id=d.id AND item_key=p_item_key;
 UPDATE public.microorganism_regulatory_dossiers SET technical_review_status='PENDING',regulatory_review_status='PENDING',fiscal_review_status='PENDING',updated_by=auth.uid() WHERE id=d.id RETURNING * INTO d;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',d.id,'updated_at',d.updated_at);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_management_submit(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; BEGIN
 d:=platform_private.product_dossier_lock(p_product_id,p_dossier_id,p_expected_updated_at);
 IF d.status<>'DRAFT' OR EXISTS(SELECT 1 FROM platform_private.product_dossier_uploads WHERE dossier_id=d.id AND state IN ('RESERVED','VERIFIED')) THEN RAISE EXCEPTION 'REGULATORY_INVALID_TRANSITION' USING ERRCODE='55006'; END IF;
 UPDATE public.microorganism_regulatory_dossiers SET status='PENDING_REVIEW',updated_by=auth.uid() WHERE id=d.id RETURNING * INTO d;
 RETURN jsonb_build_object('product_id',p_product_id,'dossier_id',d.id,'updated_at',d.updated_at);
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_prepare(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_upload_id uuid,p_intent jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE d public.microorganism_regulatory_dossiers; u platform_private.product_dossier_uploads; sz bigint; sha text; mime text; filename text; BEGIN
 PERFORM platform_private.product_dossier_manage_scope(p_product_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('regulatory-upload:'||p_upload_id,0));
 SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id FOR UPDATE;
 IF u.id IS NOT NULL THEN
 IF u.actor_id<>auth.uid() OR u.product_id<>p_product_id OR u.dossier_id<>p_dossier_id OR u.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_CONFLICT' USING ERRCODE='PT409'; END IF;
 PERFORM platform_private.product_dossier_manage_scope(p_product_id,(SELECT microorganism_id FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier_id));
 IF u.state<>'COMMITTED' AND NOT EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier_id AND status IN ('DRAFT','PENDING_REVIEW')) THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006'; END IF;
 RETURN to_jsonb(u)-'actor_id'-'intent'; END IF;
 d:=platform_private.product_dossier_lock(p_product_id,p_dossier_id,p_expected_updated_at);
 IF p_upload_id IS NULL OR jsonb_typeof(p_intent) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_INVALID' USING ERRCODE='22023'; END IF;
 sz:=(p_intent->>'size_bytes')::bigint; sha:=p_intent->>'sha256'; mime:=p_intent->>'mime'; filename:=p_intent->>'filename';
 IF sz IS NULL OR sz NOT BETWEEN 1 AND 20971520 OR sha IS NULL OR sha!~'^[a-f0-9]{64}$' OR mime IS NULL OR mime<>ALL(ARRAY['application/pdf','image/png','image/jpeg']) OR filename IS NULL OR filename!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' OR (mime='application/pdf' AND filename!~'\.pdf$') OR (mime='image/png' AND filename!~'\.png$') OR (mime='image/jpeg' AND filename!~'\.(jpg|jpeg)$') OR length(btrim(coalesce(p_intent->>'title',''))) NOT BETWEEN 1 AND 300 OR (p_intent->>'doc_type') IS NULL OR (p_intent->>'doc_type')<>ALL(ARRAY['ROTULO','LAUDO','CERTIFICADO_ANALISE','FICHA_TECNICA','ATO_REGISTRO','PARECER_CONTABIL','OUTRO']) THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_INVALID' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents WHERE dossier_id=d.id AND content_sha256=sha AND deleted_at IS NULL) THEN RAISE EXCEPTION 'REGULATORY_DOCUMENT_DUPLICATE' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.product_dossier_uploads WHERE dossier_id=d.id AND sha256=sha AND state IN ('RESERVED','VERIFIED')) THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_PENDING' USING ERRCODE='PT409'; END IF;
 INSERT INTO platform_private.product_dossier_uploads(id,actor_id,product_id,dossier_id,intent,storage_path,sha256,size_bytes,mime) VALUES(p_upload_id,auth.uid(),p_product_id,d.id,p_intent,'dossiers/'||d.id||'/'||p_upload_id||'/'||filename,sha,sz,mime) RETURNING * INTO u;
 RETURN to_jsonb(u)-'actor_id'-'intent';
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_access(p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE u platform_private.product_dossier_uploads; BEGIN
 SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id;
 PERFORM platform_private.product_dossier_manage_scope(u.product_id);
 IF u.id IS NULL OR u.actor_id<>auth.uid() OR u.state='CANCELLED' THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF u.state<>'COMMITTED' AND NOT EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=u.dossier_id AND deleted_at IS NULL AND status IN ('DRAFT','PENDING_REVIEW')) THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE='55006'; END IF;
 RETURN to_jsonb(u)-'actor_id'-'intent';
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_attest(p_upload_id uuid,p_sha256 text,p_size bigint,p_mime text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM platform_private.require_service_role();
 UPDATE platform_private.product_dossier_uploads SET state='VERIFIED',updated_at=clock_timestamp() WHERE id=p_upload_id AND state IN ('RESERVED','VERIFIED') AND sha256=p_sha256 AND size_bytes=p_size AND mime=p_mime;
 IF NOT FOUND THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_INTEGRITY' USING ERRCODE='22023'; END IF;
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_finalize(p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE u platform_private.product_dossier_uploads; d public.microorganism_regulatory_dossiers; BEGIN
 SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id;
 PERFORM platform_private.product_dossier_manage_scope(u.product_id);
 SELECT * INTO d FROM public.microorganism_regulatory_dossiers WHERE id=u.dossier_id FOR UPDATE;
 SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id FOR UPDATE;
 PERFORM platform_private.product_dossier_manage_scope(u.product_id,d.microorganism_id);
 IF u.actor_id<>auth.uid() THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF u.state='COMMITTED' THEN RETURN jsonb_build_object('product_id',u.product_id,'document_id',u.id,'state','COMMITTED'); END IF;
 IF d.status NOT IN ('DRAFT','PENDING_REVIEW') OR u.state<>'VERIFIED' OR NOT EXISTS(SELECT 1 FROM public.product_regulatory_dossier_links WHERE product_id=u.product_id AND dossier_id=d.id) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fiscal-regulatorio' AND name=u.storage_path) THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_NOT_READY' USING ERRCODE='55006'; END IF;
 INSERT INTO public.microorganism_regulatory_documents(id,dossier_id,doc_type,title,storage_path,content_sha256,issuer,issued_at,valid_until,uploaded_by) VALUES(u.id,u.dossier_id,u.intent->>'doc_type',u.intent->>'title',u.storage_path,u.sha256,nullif(u.intent->>'issuer',''),nullif(u.intent->>'issued_at','')::date,nullif(u.intent->>'valid_until','')::date,auth.uid());
 UPDATE public.microorganism_regulatory_dossiers SET technical_review_status='PENDING',regulatory_review_status='PENDING',fiscal_review_status='PENDING',updated_by=auth.uid() WHERE id=d.id;
 UPDATE platform_private.product_dossier_uploads SET state='COMMITTED',updated_at=clock_timestamp() WHERE id=u.id;
 RETURN jsonb_build_object('product_id',u.product_id,'document_id',u.id,'state','COMMITTED');
END $$;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_pending(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM platform_private.product_dossier_manage_scope(p_product_id);
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(u)-'actor_id'-'intent'),'[]'::jsonb) FROM platform_private.product_dossier_uploads u WHERE product_id=p_product_id AND actor_id=auth.uid() AND state IN ('RESERVED','VERIFIED'));
END $$;
-- Internal binary transport: no browser-origin read/write grants for this lane.
-- Preserve canonical company Storage reader; add platform authority only for exact linked documents.
CREATE OR REPLACE FUNCTION platform_private.product_regulatory_storage_read_allowed(p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE org uuid; BEGIN
 IF NOT public.fn_regulatory_storage_path_ok(p_path) THEN RETURN false; END IF;
 IF public.is_platform_superadmin(auth.uid()) THEN
 PERFORM platform_private.catalog_metadata_require_actor();
 RETURN EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents x JOIN public.product_regulatory_dossier_links l ON l.dossier_id=x.dossier_id WHERE x.storage_path=p_path AND x.deleted_at IS NULL);
 END IF;
 IF NOT public.fn_regulatory_can_read() THEN RETURN false; END IF;
 org:=platform_private.catalog_tenant_actor('read_catalog');
 RETURN EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents x JOIN public.microorganism_regulatory_dossiers d ON d.id=x.dossier_id JOIN public.microrganismos m ON m.id=d.microorganism_id WHERE x.storage_path=p_path AND x.storage_bucket='fiscal-regulatorio' AND x.deleted_at IS NULL AND d.deleted_at IS NULL AND m.owner_organization_id=org AND split_part(p_path,'/',2)=d.id::text AND split_part(p_path,'/',3)=x.id::text);
 EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
-- Canonical product detail already recomputes facts; bind CRT to the product's company, not platform profile.
DO $$ DECLARE body text; BEGIN body:=pg_get_functiondef('platform_private.rpc_regulatory_product_dossier_detail(uuid,uuid)'::regprocedure);
 body:=replace(body,'public.fn_fiscal_company_crt()','(SELECT s.crt FROM public.company_fiscal_settings s WHERE s.organization_id=v_org LIMIT 1)'); EXECUTE body; END $$;
-- Typed INVOKER entrypoints: private cores alone own mutation authority.
CREATE OR REPLACE FUNCTION public.platform_product_dossier_management_list(p_search text DEFAULT '') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_management_list(p_search) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_management_list(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_management_list(text) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_management_list(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_management_list(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_management_context(p_product_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_management_context(p_product_id) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_management_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_management_context(uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_management_context(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_management_context(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_management_create(p_product_id uuid,p_microorganism_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_management_create(p_product_id,p_microorganism_id) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_management_create(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_management_create(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_management_create(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_management_create(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_management_save(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_patch jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_management_save(p_product_id,p_dossier_id,p_expected_updated_at,p_patch) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_management_save(uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_management_save(uuid,uuid,timestamptz,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_management_save(uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_management_save(uuid,uuid,timestamptz,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_management_checklist(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_item_key text,p_state text,p_justification text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_management_checklist(p_product_id,p_dossier_id,p_expected_updated_at,p_item_key,p_state,p_justification) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_management_checklist(uuid,uuid,timestamptz,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_management_checklist(uuid,uuid,timestamptz,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_management_checklist(uuid,uuid,timestamptz,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_management_checklist(uuid,uuid,timestamptz,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_management_submit(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_management_submit(p_product_id,p_dossier_id,p_expected_updated_at) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_management_submit(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_management_submit(uuid,uuid,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_management_submit(uuid,uuid,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_management_submit(uuid,uuid,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_upload_prepare(p_product_id uuid,p_dossier_id uuid,p_expected_updated_at timestamptz,p_upload_id uuid,p_intent jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_upload_prepare(p_product_id,p_dossier_id,p_expected_updated_at,p_upload_id,p_intent) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_prepare(uuid,uuid,timestamptz,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_upload_prepare(uuid,uuid,timestamptz,uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_prepare(uuid,uuid,timestamptz,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_prepare(uuid,uuid,timestamptz,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_upload_access(p_upload_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_upload_access(p_upload_id) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_upload_access(uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_access(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_access(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_upload_finalize(p_upload_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_upload_finalize(p_upload_id) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_finalize(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_upload_finalize(uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_finalize(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_finalize(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_upload_pending(p_product_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_upload_pending(p_product_id) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_pending(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_product_dossier_upload_pending(uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_pending(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_pending(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_upload_attest(p_upload_id uuid,p_sha256 text,p_size bigint,p_mime text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_upload_attest(p_upload_id,p_sha256,p_size,p_mime) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_attest(uuid,text,bigint,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.platform_product_dossier_upload_attest(uuid,text,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_attest(uuid,text,bigint,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_attest(uuid,text,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION platform_private.product_dossier_manage_scope(uuid,uuid),platform_private.product_dossier_lock(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
