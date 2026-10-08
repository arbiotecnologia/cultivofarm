-- Somente no canônico; ROLE/claims SQL não são prova JWT/API/browser.
-- Fixtures de domínio apenas, nenhuma alteração de organização/usuário/vínculo.
-- A exceção final reverte TUDO; nunca remover nem capturar essa exceção.
DO $$
DECLARE
 a uuid := 'cbdc4ef3-005a-4674-8ea3-4410c7d7d212';
 b uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
 oa uuid := '8f57c7dd-0557-4041-b401-7a00f7244626';
 ob uuid := '007bb519-cba0-4704-be2c-cb93ad010048';
 ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid();
 pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid();
 run text := 'TEMPORARY_AUDIT_' || gen_random_uuid()::text;
 actor uuid; ownc uuid; otherc uuid; ownp uuid; otherp uuid;
 n integer; positive integer := 0; denied integer := 0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'canonical_project_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=a AND organization_id=oa AND ativo AND senha_provisoria=false)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=b AND organization_id=ob AND ativo AND senha_provisoria=false) THEN RAISE EXCEPTION 'actor_baseline_changed'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','iat',extract(epoch FROM clock_timestamp())::bigint)::text,true);
 INSERT INTO public.clientes(id,nome,nome_fantasia,codigo_cliente) VALUES(ca,run,run,run||'_A');
 INSERT INTO public.partner_accounts(id,razao_social,client_id) VALUES(pa,run,ca);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','iat',extract(epoch FROM clock_timestamp())::bigint)::text,true);
 INSERT INTO public.clientes(id,nome,nome_fantasia,codigo_cliente) VALUES(cb,run,run,run||'_B');
 INSERT INTO public.partner_accounts(id,razao_social,client_id) VALUES(pb,run,cb);
 FOREACH actor IN ARRAY ARRAY[a,b] LOOP
  ownc:=CASE WHEN actor=a THEN ca ELSE cb END; otherc:=CASE WHEN actor=a THEN cb ELSE ca END;
  ownp:=CASE WHEN actor=a THEN pa ELSE pb END; otherp:=CASE WHEN actor=a THEN pb ELSE pa END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','iat',extract(epoch FROM clock_timestamp())::bigint)::text,true);
  SELECT count(*) INTO n FROM public.clientes WHERE id=ownc; IF n<>1 THEN RAISE EXCEPTION 'own_client_failed'; END IF; positive:=positive+1;
  SELECT count(*) INTO n FROM public.partner_accounts WHERE id=ownp; IF n<>1 THEN RAISE EXCEPTION 'own_partner_failed'; END IF; positive:=positive+1;
  UPDATE public.partner_accounts SET observacoes=run WHERE id=ownp; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'own_update_failed'; END IF; positive:=positive+1;
  SELECT count(*) INTO n FROM public.clientes WHERE id=otherc; IF n<>0 THEN RAISE EXCEPTION 'cross_client_read'; END IF; denied:=denied+1;
  SELECT count(*) INTO n FROM public.partner_accounts WHERE id=otherp; IF n<>0 THEN RAISE EXCEPTION 'cross_partner_read'; END IF; denied:=denied+1;
  UPDATE public.partner_accounts SET observacoes=run WHERE id=otherp; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'cross_partner_update'; END IF; denied:=denied+1;
  UPDATE public.clientes SET nome=run WHERE id=otherc; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'cross_client_update'; END IF; denied:=denied+1;
  BEGIN
   UPDATE public.partner_accounts SET client_id=otherc WHERE id=ownp;
   RAISE EXCEPTION 'cross_reparent_accepted';
  EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 END LOOP;
 RAISE EXCEPTION 'COMMERCIAL_CONTEXT_ROLLBACK run=% clients=%,% partners=%,% positive=% denied=%',run,ca,cb,pa,pb,positive,denied;
END $$;