CREATE OR REPLACE FUNCTION platform_private.product_dossier_row_read(p_dossier uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; d public.microorganism_regulatory_dossiers;
BEGIN
 org:=platform_private.catalog_tenant_actor('read_catalog');
 SELECT * INTO d FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier AND deleted_at IS NULL;
 IF d.id IS NULL OR d.product_id IS NULL THEN RETURN false; END IF;
 RETURN org=platform_private.product_dossier_read_scope(d.product_id,d.microorganism_id);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_row_read(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_row_read(uuid) TO authenticated;
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('public.rpc_regulatory_dossier_detail(uuid)'::regprocedure);
 IF position('IF v_d.id IS NULL THEN RETURN NULL; END IF;' in body)=0 THEN RAISE EXCEPTION 'REGULATORY_LEGACY_GUARD_DRIFT'; END IF;
 body:=replace(body,'IF v_d.id IS NULL THEN RETURN NULL; END IF;','IF v_d.id IS NULL OR NOT platform_private.product_dossier_row_read(v_d.id) THEN RETURN NULL; END IF;');
 EXECUTE body;
END $$;
CREATE OR REPLACE FUNCTION public.rpc_microorganism_regulatory_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; v jsonb;
BEGIN
 org:=platform_private.catalog_tenant_actor('read_catalog');
 IF org IS NULL OR NOT public.fn_regulatory_can_read() THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('microorganism_id',m.id,'codigo',m.codigo,'nome',m.nome,'tipo',m.tipo,'ativo',m.ativo,'concentracao_label',m.concentracao_label,
 'facts',NULL,'checklist_total',0,'checklist_confirmed',0,'checklist_pending',0,'progress_pct',0,'dossier_status','NONE','profile_status',NULL,
 'fiscally_ready',false,'technical_ready',false,'regulatory_ready',false,'quarantined',false,'pendencies','[]'::jsonb,'not_applicable','[]'::jsonb) ORDER BY m.codigo,m.id),'[]'::jsonb)
 INTO v FROM public.microrganismos m WHERE m.ativo AND m.owner_organization_id=org;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.rpc_microorganism_regulatory_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_microorganism_regulatory_overview() TO authenticated,service_role;