-- Canonical target: swzpzcwiasxmjutrmvkm. No storage.objects/buckets mutation.
-- Claims SQL are not real JWT/API authentication. Final exception reverts all fixtures.
DO $$
DECLARE
 ua uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
 ub uuid := 'cbdc4ef3-005a-4674-8ea3-4410c7d7d212';
 oa uuid; ob uuid; ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid(); rb uuid:=gen_random_uuid();
 run_id text:='TEMPORARY_AUDIT_STORAGE1_'||gen_random_uuid();
 actor uuid; own_e uuid; other_e uuid; own_r uuid; other_r uuid; org uuid; other_org uuid;
 action text; bad text; own_n int:=0; denied_n int:=0;
BEGIN
 SELECT organization_id INTO oa FROM public.profiles WHERE user_id=ua AND ativo IS TRUE;
 SELECT organization_id INTO ob FROM public.profiles WHERE user_id=ub AND ativo IS TRUE;
 IF oa IS NULL OR ob IS NULL OR oa=ob THEN RAISE EXCEPTION 'STORAGE1_ACTORS_UNAVAILABLE'; END IF;
 INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES(ca,run_id||'_A',run_id||'_A',oa),(cb,run_id||'_B',run_id||'_B',ob);
 INSERT INTO public.entregas(id,cliente_id,organization_id,status) VALUES(ea,ca,oa,'separado'),(eb,cb,ob,'separado');
 INSERT INTO public.registros_consultor(id,cliente_id,status) VALUES(ra,ca,'rascunho'),(rb,cb,'rascunho');
 SET LOCAL ROLE authenticated;
 FOREACH actor IN ARRAY ARRAY[ua,ub] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  own_e:=CASE WHEN actor=ua THEN ea ELSE eb END; other_e:=CASE WHEN actor=ua THEN eb ELSE ea END;
  own_r:=CASE WHEN actor=ua THEN ra ELSE rb END; other_r:=CASE WHEN actor=ua THEN rb ELSE ra END;
  org:=CASE WHEN actor=ua THEN oa ELSE ob END; other_org:=CASE WHEN actor=ua THEN ob ELSE oa END;
  FOREACH action IN ARRAY ARRAY['select','insert','update','delete'] LOOP
   IF public.storage1_delivery_allowed('entregas/'||own_e||'/comprovantes/a.pdf',action) IS NOT TRUE THEN RAISE EXCEPTION 'STORAGE1_OWN_DELIVERY_DENIED %',action; END IF; own_n:=own_n+1;
   IF public.storage1_delivery_allowed('entregas/'||other_e||'/comprovantes/a.pdf',action) IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_CROSS_DELIVERY_LEAK'; END IF; denied_n:=denied_n+1;
   IF public.storage1_consultor_allowed(org||'/'||own_r||'/foto/a.jpg',action) IS NOT TRUE THEN RAISE EXCEPTION 'STORAGE1_OWN_CONSULTOR_DENIED %',action; END IF; own_n:=own_n+1;
   IF public.storage1_consultor_allowed(org||'/'||other_r||'/foto/a.jpg',action) IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_FORGED_PREFIX_LEAK'; END IF; denied_n:=denied_n+1;
   IF public.storage1_consultor_allowed(other_org||'/'||other_r||'/foto/a.jpg',action) IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_CROSS_CONSULTOR_LEAK'; END IF; denied_n:=denied_n+1;
   IF public.storage1_application_allowed(ca||'/'||gen_random_uuid()||'/a.jpg',action) IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_MISSING_APP_LEAK'; END IF; denied_n:=denied_n+1;
  END LOOP;
  FOREACH bad IN ARRAY ARRAY['/entregas/a.pdf','entregas//a.pdf','entregas/../a.pdf','entregas/./a.pdf',E'entregas\\a.pdf','entregas/%2e%2e/a.pdf','entregas/%252e/a.pdf','entregas/a.pdf/','entregas/'||chr(10)||'/a.pdf'] LOOP
   IF public.storage1_path_strict(bad) IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_TRAVERSAL_ACCEPTED'; END IF; denied_n:=denied_n+1;
  END LOOP;
  IF public.storage1_delivery_allowed('entregas/'||own_e||'/a.pdf',NULL) IS NOT FALSE OR public.storage1_consultor_allowed(org||'/'||own_r||'/foto/a.jpg',NULL) IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_NULL_ACTION'; END IF; denied_n:=denied_n+2;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF public.storage1_delivery_allowed('entregas/'||ea||'/a.pdf','select') IS NOT FALSE THEN RAISE EXCEPTION 'STORAGE1_NO_UID_LEAK'; END IF; denied_n:=denied_n+1;
 RAISE EXCEPTION 'STORAGE1_EXPECTED_ROLLBACK own=% denied=% manifest=%',own_n,denied_n,jsonb_build_object('run_id',run_id,'clientes',ARRAY[ca,cb],'entregas',ARRAY[ea,eb],'registros',ARRAY[ra,rb]);
END $$;