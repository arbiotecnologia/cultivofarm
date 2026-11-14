INSERT INTO platform_private.product_dossier_uploads VALUES('00000000-0000-4000-8000-000000000090','RESERVED',now(),repeat('a',64),8,'image/png','synthetic/label.png');
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$ BEGIN
 IF has_schema_privilege(current_user,'platform_private','usage') THEN RAISE EXCEPTION 'schema widened'; END IF;
 BEGIN PERFORM platform_private.product_dossier_upload_attest('00000000-0000-4000-8000-000000000090',repeat('a',64),8,'image/png'); RAISE EXCEPTION 'direct core exposed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS direct private core denied despite EXECUTE'; END;
 PERFORM public.tenant_product_dossier_upload_attest('00000000-0000-4000-8000-000000000090',repeat('a',64),8,'image/png'); RAISE NOTICE 'PASS service bridge works without schema USAGE';
 PERFORM public.platform_product_dossier_upload_attest('00000000-0000-4000-8000-000000000090',repeat('a',64),8,'image/png'); RAISE NOTICE 'PASS compatibility bridge works';
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 BEGIN PERFORM public.tenant_product_dossier_upload_attest('00000000-0000-4000-8000-000000000090',repeat('a',64),8,'image/png'); RAISE EXCEPTION 'wrong identity accepted'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS canonical service identity required'; END;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT state FROM platform_private.product_dossier_uploads)<>'VERIFIED' THEN RAISE EXCEPTION 'atesto absent'; END IF; RAISE NOTICE 'PASS attestation persisted'; END $$;
UPDATE platform_private.product_dossier_uploads SET state='CANCELLING';
INSERT INTO storage.objects VALUES('fiscal-regulatorio','synthetic/label.png');
SET ROLE service_role;
DO $$ BEGIN BEGIN PERFORM public.tenant_product_dossier_upload_cancel('00000000-0000-4000-8000-000000000090'); RAISE EXCEPTION 'removed existing bytes'; EXCEPTION WHEN SQLSTATE '55006' THEN RAISE NOTICE 'PASS cleanup waits while bytes exist'; END; END $$;
RESET ROLE;
DELETE FROM storage.objects WHERE name='synthetic/label.png';
SET ROLE service_role;
SELECT public.tenant_product_dossier_upload_cancel('00000000-0000-4000-8000-000000000090');
RESET ROLE;
DO $$ BEGIN
IF (SELECT state FROM platform_private.product_dossier_uploads)<>'CANCELLED' THEN RAISE EXCEPTION 'cancel absent'; END IF; RAISE NOTICE 'PASS cleanup finalizes only after removal';
IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('tenant_product_dossier_upload_attest','tenant_product_dossier_upload_cancel','platform_product_dossier_upload_attest','platform_product_dossier_upload_cancel') AND (has_function_privilege('authenticated',p.oid,'execute') OR has_function_privilege('anon',p.oid,'execute'))) THEN RAISE EXCEPTION 'client bridge exposed'; END IF; RAISE NOTICE 'PASS all four bridges closed to clients';
END $$;
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.tenant_product_dossier_upload_attest('00000000-0000-4000-8000-000000000090',repeat('a',64),8,'image/png'); RAISE EXCEPTION 'client executed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS authenticated caller rejected by real ACL'; END; END $$;
RESET ROLE;