-- Target swzpzcwiasxmjutrmvkm; synthetic storage rows ONLY, no metadata writes.
-- Evaluate all live authenticated/PUBLIC policies: permissive OR, restrictive AND.
-- Final exception rolls back domain fixtures and any trigger effects. Not JWT/API proof.
DO $$
DECLARE
 ua uuid:='a7d45277-6dec-413d-bf6b-86620c1ef39f'; ub uuid:='cbdc4ef3-005a-4674-8ea3-4410c7d7d212';
 inactive uuid:='28c5f1ca-32a7-4826-b1ee-8fb93c5a5ab9'; oa uuid; ob uuid;
 ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); osa uuid:=gen_random_uuid(); osb uuid:=gen_random_uuid();
 fa uuid:=gen_random_uuid(); fb uuid:=gen_random_uuid(); ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid();
 aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid(); actor uuid; org uuid; client uuid; app uuid; cross_app uuid;
 run_id text:='TEMPORARY_AUDIT_STORAGE1_COMPOSITION_'||gen_random_uuid();
 policies jsonb; pol jsonb; expr text; action text; bucket text; path text; variant text; own_n int:=0; denied_n int:=0;
 permissive_ok boolean; restrictive_ok boolean; one_ok boolean; effective boolean; expected boolean;
BEGIN
 SELECT organization_id INTO oa FROM public.profiles WHERE user_id=ua AND ativo;
 SELECT organization_id INTO ob FROM public.profiles WHERE user_id=ub AND ativo;
 IF oa IS NULL OR ob IS NULL OR oa=ob THEN RAISE EXCEPTION 'ACTORS_UNAVAILABLE'; END IF;
 SELECT jsonb_agg(to_jsonb(p)) INTO policies FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND roles && ARRAY['authenticated','public']::name[];
 INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES(ca,run_id||'_A',run_id||'_A',oa),(cb,run_id||'_B',run_id||'_B',ob);
 INSERT INTO public.fazendas(id,cliente_id,nome,organization_id) VALUES(fa,ca,run_id||'_A',oa),(fb,cb,run_id||'_B',ob);
 INSERT INTO public.talhoes(id,fazenda_id,nome,organization_id) VALUES(ta,fa,run_id||'_A',oa),(tb,fb,run_id||'_B',ob);
 INSERT INTO public.ordens_servico(id,cliente_id,fazenda_id,talhao_id,organization_id,produto_id,status,numero_os) VALUES
 (osa,ca,fa,ta,oa,'44b809ec-2e23-5d73-b6bb-b59afe728eea','finalizada',run_id||'_A'),(osb,cb,fb,tb,ob,'44b809ec-2e23-5d73-b6bb-b59afe728eea','finalizada',run_id||'_B');
 INSERT INTO public.aplicacoes(id,ordem_servico_id,organization_id) VALUES(aa,osa,oa),(ab,osb,ob);
 SET LOCAL ROLE authenticated;
 FOREACH actor IN ARRAY ARRAY[ua,ub,inactive] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
  org:=CASE WHEN actor=ub THEN ob ELSE oa END; client:=CASE WHEN actor=ub THEN cb ELSE ca END;
  app:=CASE WHEN actor=ub THEN ab ELSE aa END; cross_app:=CASE WHEN actor=ub THEN aa ELSE ab END;
  FOREACH bucket IN ARRAY ARRAY['aplicacao-evidencias','financial-reports','financial-receipts','clientes-docs'] LOOP
   FOREACH variant IN ARRAY ARRAY['own','cross','traversal','encoded','double-slash','owner-bypass'] LOOP
    path:=CASE bucket WHEN 'aplicacao-evidencias' THEN client||'/'||app||'/a.jpg' WHEN 'clientes-docs' THEN org||'/clientes/'||client||'/outro/a.pdf' ELSE org||'/'||actor||'/report.pdf' END;
    IF variant='cross' OR variant='owner-bypass' THEN
     path:=CASE bucket WHEN 'aplicacao-evidencias' THEN (CASE WHEN actor=ub THEN ca ELSE cb END)||'/'||cross_app||'/a.jpg' WHEN 'clientes-docs' THEN (CASE WHEN actor=ub THEN oa ELSE ob END)||'/clientes/'||(CASE WHEN actor=ub THEN ca ELSE cb END)||'/outro/a.pdf' ELSE (CASE WHEN actor=ub THEN oa ELSE ob END)||'/other/report.pdf' END;
    ELSIF variant='traversal' THEN path:=replace(path,'/','/../');
    ELSIF variant='encoded' THEN path:=replace(path,'/','/%2e%2e/');
    ELSIF variant='double-slash' THEN path:=replace(path,'/','//'); END IF;
    FOREACH action IN ARRAY ARRAY['SELECT','INSERT','DELETE','UPDATE'] LOOP
     permissive_ok:=false; restrictive_ok:=true;
     FOR pol IN SELECT value FROM jsonb_array_elements(policies) LOOP
      IF pol->>'cmd' NOT IN (action,'ALL') THEN CONTINUE; END IF;
      expr:=CASE WHEN action='INSERT' THEN pol->>'with_check' ELSE pol->>'qual' END;
      IF expr IS NULL THEN one_ok:=true; ELSE
       EXECUTE 'SELECT COALESCE(('||expr||'),false) FROM jsonb_populate_record(NULL::storage.objects,$1) AS objects'
       INTO one_ok USING jsonb_build_object('bucket_id',bucket,'name',path,'owner_id',actor::text);
      END IF;
      IF action='UPDATE' AND pol->>'with_check' IS NOT NULL THEN
       EXECUTE 'SELECT COALESCE(('||(pol->>'with_check')||'),false) FROM jsonb_populate_record(NULL::storage.objects,$1) AS objects'
       INTO effective USING jsonb_build_object('bucket_id',bucket,'name',path,'owner_id',actor::text);
       one_ok:=one_ok AND effective;
      END IF;
      IF pol->>'permissive'='PERMISSIVE' THEN permissive_ok:=permissive_ok OR one_ok; ELSE restrictive_ok:=restrictive_ok AND one_ok; END IF;
     END LOOP;
     effective:=permissive_ok AND restrictive_ok;
     -- Application UPDATE has no permissive policy: keep closed, do not grant it.
     expected:=actor<>inactive AND variant='own' AND NOT(bucket='aplicacao-evidencias' AND action='UPDATE');
     IF effective IS DISTINCT FROM expected THEN RAISE EXCEPTION 'COMPOSITION_MISMATCH bucket=% action=% variant=% actor=% permissive=% restrictive=% effective=% expected=%',bucket,action,variant,actor,permissive_ok,restrictive_ok,effective,expected; END IF;
     IF expected THEN own_n:=own_n+1; ELSE denied_n:=denied_n+1; END IF;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{}',true);
 IF public.aplicacao_storage_path_permitido(ca||'/'||aa||'/a.jpg','select') IS NOT FALSE THEN RAISE EXCEPTION 'NO_UID_ALLOWED'; END IF;
 RAISE EXCEPTION 'STORAGE1_COMPOSITION_EXPECTED_ROLLBACK own=% denied=% metadata_writes=0 manifest=%',own_n,denied_n,jsonb_build_object('run_id',run_id,'clientes',ARRAY[ca,cb],'fazendas',ARRAY[fa,fb],'talhoes',ARRAY[ta,tb],'os',ARRAY[osa,osb],'aplicacoes',ARRAY[aa,ab]);
END $$;