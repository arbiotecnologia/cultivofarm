-- Canonical target required: swzpzcwiasxmjutrmvkm. Claims are SIMULATED, not JWT proof.
-- Run only with explicit authorized SQL access. No data writes or persistent fixtures.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v jsonb; f text; key text; u text;
BEGIN
 FOREACH u IN ARRAY ARRAY['a7d45277-6dec-413d-bf6b-86620c1ef39f','cbdc4ef3-005a-4674-8ea3-4410c7d7d212'] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
  FOREACH f IN ARRAY ARRAY['rpc_executivo_timeline_operacional','rpc_executivo_gargalos'] LOOP
   EXECUTE format('SELECT public.%I($1,$2)',f) INTO v USING '{}'::jsonb,20;
   IF jsonb_array_length(v->CASE WHEN f='rpc_executivo_gargalos' THEN 'gargalos' ELSE 'eventos' END)<>0 OR jsonb_array_length(v->'dados_indisponiveis')=0 THEN RAISE EXCEPTION 'CONTAINMENT_FAILED'; END IF;
   FOREACH key IN ARRAY ARRAY['organization_id','tenant_id','cliente_id','fazenda_id'] LOOP
    BEGIN EXECUTE format('SELECT public.%I($1,$2)',f) USING jsonb_build_object(key,'007bb519-cba0-4704-be2c-cb93ad010048'),20; RAISE EXCEPTION 'FORGED_FILTER_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   END LOOP;
   EXECUTE format('SELECT public.%I($1,$2)',f) INTO v USING '{}'::jsonb,-1; IF (v->>'limite')::int<>1 THEN RAISE EXCEPTION 'MIN_LIMIT'; END IF;
   EXECUTE format('SELECT public.%I($1,$2)',f) INTO v USING '{}'::jsonb,2147483647; IF (v->>'limite')::int<>(CASE WHEN f='rpc_executivo_gargalos' THEN 50 ELSE 100 END) THEN RAISE EXCEPTION 'MAX_LIMIT'; END IF;
   BEGIN EXECUTE format('SELECT public.%I($1,$2)',f) USING '[]'::jsonb,20; RAISE EXCEPTION 'INVALID_FILTER_ACCEPTED'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN PERFORM public.rpc_executivo_timeline_operacional('{"periodo":"personalizado","data_inicio":"infinity","data_fim":"infinity"}',20); RAISE EXCEPTION 'INVALID_DATE_ACCEPTED'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  BEGIN PERFORM public.rpc_executivo_timeline_operacional('{}',20); RAISE EXCEPTION 'NO_IAT_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.rpc_executivo_gargalos('{}',10); RAISE EXCEPTION 'NO_IAT_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 BEGIN PERFORM public.rpc_executivo_timeline_operacional('{}',20); RAISE EXCEPTION 'NO_AUTH_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.rpc_executivo_gargalos('{}',10); RAISE EXCEPTION 'NO_AUTH_ACCEPTED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT 'PASS focused containment assertions; NOT JWT/browser' AS result;
ROLLBACK;
