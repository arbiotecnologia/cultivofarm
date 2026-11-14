-- Disposable fixture only. Canonical gate body loaded from the repository.
CREATE SCHEMA storage; CREATE TABLE storage.objects(bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ADD COLUMN e_insumo boolean DEFAULT false, ADD COLUMN ativo boolean DEFAULT true, ADD COLUMN codigo text;
ALTER TABLE public.product_fiscal_profiles ADD COLUMN accounting_notes text,ADD COLUMN fiscal_description text,ADD COLUMN commercial_unit text,ADD COLUMN taxable_unit text,ADD COLUMN origin_code text,ADD COLUMN cfop_in_state text,ADD COLUMN cfop_interstate text,ADD COLUMN icms_cst text,ADD COLUMN icms_csosn text,ADD COLUMN pis_cst text,ADD COLUMN cofins_cst text;
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY,owner_organization_id uuid NOT NULL,product_id uuid);
CREATE TABLE public.formulacoes(produto_id uuid,microrganismo_id uuid,owner_organization_id uuid);
CREATE TABLE public.microorganism_regulatory_dossiers(id uuid PRIMARY KEY,microorganism_id uuid NOT NULL,version integer,status text,deleted_at timestamptz);
CREATE TABLE public.microorganism_regulatory_documents(id uuid PRIMARY KEY,dossier_id uuid,title text,doc_type text,storage_bucket text DEFAULT 'fiscal-regulatorio',storage_path text,content_sha256 text,uploaded_at timestamptz DEFAULT now(),deleted_at timestamptz);
CREATE TABLE public.microorganism_regulatory_checklist(dossier_id uuid,item_key text,state text);
CREATE FUNCTION public.fn_regulatory_can_read() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION platform_private.catalog_tenant_actor(text) RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-4000-8000-000000000010'::uuid$$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT platform_private.catalog_tenant_actor('read_catalog')$$;
CREATE FUNCTION public.fn_fiscal_company_crt() RETURNS text LANGUAGE sql AS $$SELECT '3'::text$$;
CREATE FUNCTION public.fn_regulatory_storage_path_ok(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 ~ '^dossiers/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'$$;
-- Synthetic facts stub isolates subject selection. Gate evaluation uses original body.
CREATE FUNCTION public.fn_microorganism_regulatory_facts(p_microorganism_id uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('dossier_id',id,'status',status,'has_label_document',EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents x WHERE x.dossier_id=d.id AND x.doc_type='ROTULO' AND x.deleted_at IS NULL),'has_report_document',false) FROM public.microorganism_regulatory_dossiers d WHERE microorganism_id = p_microorganism_id AND deleted_at IS NULL LIMIT 1$$;
\i /tmp/product-dossier-gate-test.sql
\ir dossier-contract.sql
INSERT INTO public.microrganismos VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010',NULL),('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000020',NULL);
INSERT INTO public.formulacoes VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010');
INSERT INTO public.microorganism_regulatory_dossiers VALUES('00000000-0000-4000-8000-000000000110','00000000-0000-4000-8000-000000000100',1,'DRAFT',NULL),('00000000-0000-4000-8000-000000000120','00000000-0000-4000-8000-000000000100',2,'DRAFT',NULL);
DO $$DECLARE j jsonb;BEGIN
 j:=public.rpc_regulatory_microorganism_products('00000000-0000-4000-8000-000000000100');
 IF jsonb_array_length(j)<>1 OR j->0->>'dossier_status'<>'NONE' THEN RAISE EXCEPTION 'real link list failed'; END IF;
 IF public.rpc_regulatory_product_dossier_detail('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001') IS NOT NULL THEN RAISE EXCEPTION 'legacy inherited'; END IF;
 RAISE NOTICE 'PASS legacy not automatically inherited';
 BEGIN PERFORM public.rpc_regulatory_microorganism_products('00000000-0000-4000-8000-000000000200'); RAISE EXCEPTION 'foreign micro leaked'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS foreign micro denied'; END;
 BEGIN INSERT INTO public.product_regulatory_dossier_links VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000110'); RAISE EXCEPTION 'foreign link allowed'; EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS foreign documentary link denied'; END;
END$$;
INSERT INTO public.product_regulatory_dossier_links(product_id,dossier_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000120');
INSERT INTO public.microorganism_regulatory_documents(id,dossier_id,title,doc_type,storage_path,content_sha256) VALUES
('00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000120','Own label','ROTULO','dossiers/00000000-0000-4000-8000-000000000120/00000000-0000-4000-8000-000000000121/file.pdf',repeat('a',64)),
('00000000-0000-4000-8000-000000000111','00000000-0000-4000-8000-000000000110','Legacy document','ROTULO','dossiers/00000000-0000-4000-8000-000000000110/00000000-0000-4000-8000-000000000111/file.pdf',repeat('a',64));
DO $$DECLARE j jsonb;BEGIN
 j:=public.rpc_regulatory_product_dossier_detail('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001');
 IF j->'dossier'->>'id'<>'00000000-0000-4000-8000-000000000120' OR jsonb_array_length(j->'documents')<>1 OR j->'documents'->0->>'title'<>'Own label' THEN RAISE EXCEPTION 'wrong dossier/docs'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j->'gate'->'pendencies') x WHERE x->>'code'='REGULATORY_LABEL_DOCUMENT_MISSING') THEN RAISE EXCEPTION 'own label ignored'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'gate'->'pendencies') x WHERE x->>'code'='REGULATORY_REPORT_DOCUMENT_MISSING') THEN RAISE EXCEPTION 'report absence lost'; END IF;
 RAISE NOTICE 'PASS exact dossier, own docs and canonical pendencies';
 PERFORM public.rpc_regulatory_product_document_access('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000121');
 RAISE NOTICE 'PASS authorized own document locator';
 BEGIN PERFORM public.rpc_regulatory_product_document_access('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000111'); RAISE EXCEPTION 'legacy document adopted'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS other dossier document denied'; END;
 BEGIN INSERT INTO public.product_regulatory_dossier_links(product_id,dossier_id) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000110'); RAISE EXCEPTION 'duplicate link'; EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS unique product dossier'; END;
 IF public.product_regulatory_storage_read_allowed('dossiers/00000000-0000-4000-8000-000000000120/00000000-0000-4000-8000-000000000111/file.pdf') THEN RAISE EXCEPTION 'path mismatch'; END IF;
 RAISE NOTICE 'PASS private storage rejects mismatched path';
END$$;