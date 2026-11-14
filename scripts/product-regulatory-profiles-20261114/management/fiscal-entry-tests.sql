-- Disposable fixture only: identities are synthetic, not hosted JWTs.
SELECT set_config('test.actor','00000000-0000-4000-8000-000000000002',false);
INSERT INTO public.microorganism_regulatory_dossiers(id,microorganism_id,version,status)
VALUES('00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000030',90,'DRAFT');
INSERT INTO public.microorganism_regulatory_documents(id,dossier_id,doc_type,title,storage_path,content_sha256)
VALUES('00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000090','ROTULO','legacy fixture','dossiers/00000000-0000-4000-8000-000000000090/00000000-0000-4000-8000-000000000091/test.png',repeat('a',64));
DO $$ DECLARE legacy uuid:='00000000-0000-4000-8000-000000000090'; own uuid; v jsonb; BEGIN
 SELECT dossier_id INTO own FROM public.product_regulatory_dossier_links WHERE product_id='00000000-0000-4000-8000-000000000020';
 IF platform_private.product_dossier_row_read(legacy) THEN RAISE EXCEPTION 'legacy disclosed'; END IF; RAISE NOTICE 'PASS unlinked legacy row denied';
 IF public.rpc_regulatory_dossier_detail('00000000-0000-4000-8000-000000000030') IS NOT NULL THEN RAISE EXCEPTION 'legacy detail disclosed'; END IF; RAISE NOTICE 'PASS legacy detail null';
 IF public.fn_microorganism_regulatory_facts('00000000-0000-4000-8000-000000000030') IS NOT NULL THEN RAISE EXCEPTION 'legacy facts disclosed'; END IF; RAISE NOTICE 'PASS legacy facts null';
 IF platform_private.product_regulatory_storage_read_allowed('dossiers/00000000-0000-4000-8000-000000000090/00000000-0000-4000-8000-000000000091/test.png') THEN RAISE EXCEPTION 'legacy file disclosed'; END IF; RAISE NOTICE 'PASS legacy private file denied';
 IF NOT platform_private.product_dossier_row_read(own) THEN RAISE EXCEPTION 'owner denied'; END IF; RAISE NOTICE 'PASS linked owner still reads';
 v:=public.rpc_microorganism_regulatory_overview();
 IF jsonb_array_length(v)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE x->>'codigo'='3' OR x->'facts'<>'null'::jsonb OR x->>'dossier_status'<>'NONE') THEN RAISE EXCEPTION 'overview leaked'; END IF; RAISE NOTICE 'PASS overview owner-only without legacy facts';
 PERFORM set_config('test.actor','00000000-0000-4000-8000-000000000003',false);
 IF platform_private.product_dossier_row_read(own) THEN RAISE EXCEPTION 'foreign disclosed'; END IF; RAISE NOTICE 'PASS foreign product denied';
 v:=public.rpc_microorganism_regulatory_overview();
 IF jsonb_array_length(v)<>1 OR v->0->>'codigo'<>'3' THEN RAISE EXCEPTION 'foreign overview leaked'; END IF; RAISE NOTICE 'PASS tenant switch scopes overview';
 PERFORM set_config('test.actor','00000000-0000-4000-8000-000000000001',false);
 IF platform_private.product_dossier_row_read(own) THEN RAISE EXCEPTION 'superadmin disclosed'; END IF; RAISE NOTICE 'PASS superadmin-only denied';
 END $$;
-- Exercise the restrictive policies installed by the owner delta with SQL roles.
ALTER TABLE public.microorganism_regulatory_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microorganism_regulatory_documents ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA platform_private,auth TO authenticated;
GRANT SELECT ON public.microorganism_regulatory_dossiers,public.microorganism_regulatory_documents TO authenticated;
CREATE POLICY fixture_reader ON public.microorganism_regulatory_dossiers FOR SELECT TO authenticated USING (true);
CREATE POLICY fixture_reader ON public.microorganism_regulatory_documents FOR SELECT TO authenticated USING (true);
SELECT set_config('test.actor','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id='00000000-0000-4000-8000-000000000090') THEN RAISE EXCEPTION 'legacy RLS leak'; END IF; RAISE NOTICE 'PASS restrictive RLS hides legacy';
 IF EXISTS(SELECT 1 FROM public.microorganism_regulatory_documents WHERE id='00000000-0000-4000-8000-000000000091') THEN RAISE EXCEPTION 'legacy doc RLS leak'; END IF; RAISE NOTICE 'PASS restrictive RLS hides legacy documents';
 END $$;
RESET ROLE;