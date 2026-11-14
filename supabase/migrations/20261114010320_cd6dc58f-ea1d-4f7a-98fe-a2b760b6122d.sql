BEGIN;
-- An explicit documentary assignment, never populated from names/composition.
CREATE TABLE public.product_regulatory_dossier_links (
 product_id uuid PRIMARY KEY REFERENCES public.produtos(id) ON DELETE RESTRICT,
 dossier_id uuid NOT NULL UNIQUE REFERENCES public.microorganism_regulatory_dossiers(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_regulatory_dossier_links TO authenticated;
GRANT ALL ON public.product_regulatory_dossier_links TO service_role;
ALTER TABLE public.product_regulatory_dossier_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_dossier_owner_read ON public.product_regulatory_dossier_links FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=product_id AND p.owner_organization_id=public.h15_actor_organization()) AND public.fn_regulatory_can_read());
CREATE OR REPLACE FUNCTION platform_private.product_dossier_link_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.produtos; m public.microrganismos;
BEGIN
 SELECT * INTO p FROM public.produtos WHERE id=NEW.product_id FOR SHARE;
 SELECT z.* INTO m FROM public.microrganismos z JOIN public.microorganism_regulatory_dossiers d ON d.microorganism_id=z.id
 WHERE d.id=NEW.dossier_id AND d.deleted_at IS NULL FOR SHARE OF z,d;
 IF p.id IS NULL OR m.id IS NULL OR p.owner_organization_id IS DISTINCT FROM m.owner_organization_id
 OR NOT (m.product_id=p.id OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p.id AND f.microrganismo_id=m.id AND f.owner_organization_id=p.owner_organization_id)) THEN
  RAISE EXCEPTION 'PRODUCT_DOSSIER_LINK_INVALID' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.dossier_id IS DISTINCT FROM OLD.dossier_id) THEN
  RAISE EXCEPTION 'PRODUCT_DOSSIER_LINK_IMMUTABLE' USING ERRCODE='42501'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_link_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER product_dossier_link_integrity BEFORE INSERT OR UPDATE ON public.product_regulatory_dossier_links
FOR EACH ROW EXECUTE FUNCTION platform_private.product_dossier_link_integrity();

CREATE OR REPLACE FUNCTION platform_private.regulatory_product_scope(p_micro uuid,p_product uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 IF NOT public.fn_regulatory_can_read() THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_org:=platform_private.catalog_tenant_actor('read_catalog');
 IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_micro AND m.owner_organization_id=v_org) THEN
  RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_product IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.produtos p JOIN public.microrganismos m ON m.id=p_micro
 WHERE p.id=p_product AND p.owner_organization_id=v_org AND NOT p.e_insumo
 AND (m.product_id=p.id OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p.id AND f.microrganismo_id=m.id AND f.owner_organization_id=v_org))) THEN
  RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION platform_private.regulatory_product_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_regulatory_microorganism_products(p_microorganism_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_result jsonb;
BEGIN
 v_org:=platform_private.regulatory_product_scope(p_microorganism_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'nome',p.nome,'codigo',p.codigo,'ativo',p.ativo,
  'dossier_status',coalesce(d.status,'NONE')) ORDER BY p.nome,p.id),'[]'::jsonb) INTO v_result
 FROM public.produtos p JOIN public.microrganismos m ON m.id=p_microorganism_id
 LEFT JOIN public.product_regulatory_dossier_links l ON l.product_id=p.id
 LEFT JOIN public.microorganism_regulatory_dossiers d ON d.id=l.dossier_id AND d.deleted_at IS NULL
 WHERE p.owner_organization_id=v_org AND NOT p.e_insumo
 AND (m.product_id=p.id OR EXISTS(SELECT 1 FROM public.formulacoes f WHERE f.produto_id=p.id AND f.microrganismo_id=m.id AND f.owner_organization_id=v_org));
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.rpc_regulatory_microorganism_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_microorganism_products(uuid) TO authenticated;

-- Build the existing canonical facts for an exact dossier, not a micro's preferred version.
DO $copy$
DECLARE v text;
BEGIN
 v:=pg_get_functiondef('public.fn_microorganism_regulatory_facts(uuid)'::regprocedure);
 IF position('WHERE microorganism_id = p_microorganism_id AND deleted_at IS NULL' in v)=0 THEN RAISE EXCEPTION 'REGULATORY_FACTS_DRIFT'; END IF;
 v:=replace(v,'public.fn_microorganism_regulatory_facts(p_microorganism_id uuid)','platform_private.product_dossier_facts(p_dossier_id uuid)');
 v:=replace(v,'WHERE microorganism_id = p_microorganism_id AND deleted_at IS NULL','WHERE id = p_dossier_id AND deleted_at IS NULL');
 EXECUTE v;
END $copy$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_facts(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_product_dossier_detail(p_microorganism_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; d public.microorganism_regulatory_dossiers; p public.product_fiscal_profiles; facts jsonb; gate jsonb;
BEGIN
 IF p_product_id IS NULL THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_org:=platform_private.regulatory_product_scope(p_microorganism_id,p_product_id);
 SELECT z.* INTO d FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers z ON z.id=l.dossier_id
 JOIN public.microrganismos m ON m.id=z.microorganism_id AND m.owner_organization_id=v_org
 WHERE l.product_id=p_product_id AND z.deleted_at IS NULL;
 IF d.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.product_fiscal_profiles WHERE product_id=p_product_id AND is_active;
 facts:=platform_private.product_dossier_facts(d.id);
 gate:=public.fn_fiscal_item_profile_gate_eval('MICROORGANISM',public.fn_fiscal_company_crt(),p.is_active,p.profile_status,
 p.accounting_validated_at,p.accounting_notes,p.fiscal_description,p.commercial_unit,p.taxable_unit,p.ncm,p.origin_code,
 p.cfop_in_state,p.cfop_interstate,p.icms_cst,p.icms_csosn,p.pis_cst,p.cofins_cst,facts);
 RETURN jsonb_build_object('product_id',p_product_id,'dossier',to_jsonb(d),'gate',gate,
 'documents',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.uploaded_at,x.id) FROM public.microorganism_regulatory_documents x
 WHERE x.dossier_id=d.id AND x.deleted_at IS NULL),'[]'::jsonb),
 'checklist',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.item_key) FROM public.microorganism_regulatory_checklist x WHERE x.dossier_id=d.id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.rpc_regulatory_product_dossier_detail(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_product_dossier_detail(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_regulatory_product_document_access(p_microorganism_id uuid,p_product_id uuid,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; x public.microorganism_regulatory_documents;
BEGIN
 IF p_product_id IS NULL OR p_document_id IS NULL THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_org:=platform_private.regulatory_product_scope(p_microorganism_id,p_product_id);
 SELECT doc.* INTO x FROM public.product_regulatory_dossier_links l JOIN public.microorganism_regulatory_dossiers d ON d.id=l.dossier_id
 JOIN public.microrganismos m ON m.id=d.microorganism_id AND m.owner_organization_id=v_org
 JOIN public.microorganism_regulatory_documents doc ON doc.dossier_id=d.id
 WHERE l.product_id=p_product_id AND d.deleted_at IS NULL AND doc.deleted_at IS NULL AND doc.id=p_document_id;
 IF x.id IS NULL OR x.storage_bucket<>'fiscal-regulatorio' OR NOT public.fn_regulatory_storage_path_ok(x.storage_path)
 OR split_part(x.storage_path,'/',2)<>x.dossier_id::text OR split_part(x.storage_path,'/',3)<>x.id::text THEN
  RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('document_id',x.id,'dossier_id',x.dossier_id,'product_id',p_product_id,'bucket',x.storage_bucket,
 'path',x.storage_path,'sha256',x.content_sha256);
END $$;
REVOKE ALL ON FUNCTION public.rpc_regulatory_product_document_access(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_product_document_access(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.product_regulatory_storage_read_allowed(p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 IF NOT public.fn_regulatory_can_read() OR NOT public.fn_regulatory_storage_path_ok(p_path) THEN RETURN false; END IF;
 v_org:=platform_private.catalog_tenant_actor('read_catalog');
 RETURN v_org IS NOT NULL AND EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents x
 JOIN public.microorganism_regulatory_dossiers d ON d.id=x.dossier_id
 JOIN public.microrganismos m ON m.id=d.microorganism_id
 WHERE x.storage_path=p_path AND x.storage_bucket='fiscal-regulatorio' AND x.deleted_at IS NULL AND d.deleted_at IS NULL
 AND m.owner_organization_id=v_org AND split_part(p_path,'/',2)=d.id::text AND split_part(p_path,'/',3)=x.id::text);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.product_regulatory_storage_read_allowed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.product_regulatory_storage_read_allowed(text) TO authenticated;
CREATE POLICY product_regulatory_private_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='fiscal-regulatorio' AND public.product_regulatory_storage_read_allowed(name));
CREATE POLICY product_regulatory_private_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING(bucket_id<>'fiscal-regulatorio' OR public.product_regulatory_storage_read_allowed(name));
COMMIT;