-- SQL/RLS proof with existing identities, not an Auth/browser proof.
-- Every fixture and candidate policy is reverted by the final exception.
-- No persistent organizations, subscriptions, users or external calls.
DO $audit$
DECLARE
  actor_a uuid; actor_b uuid; org_a uuid; org_b uuid;
  client_a uuid := gen_random_uuid(); client_b uuid := gen_random_uuid();
  row_a uuid := gen_random_uuid(); row_b uuid := gen_random_uuid();
  before_cross integer; after_own integer; after_cross integer;
  changed integer; insert_denied boolean := false;
  reparent_denied boolean := false; rpc_denied boolean := false;
  deleted integer; own_updated integer; b_own integer; b_cross integer;
BEGIN
  PERFORM set_config('lock_timeout','3s',true);
  PERFORM set_config('statement_timeout','30s',true);
  SELECT p.user_id,p.organization_id INTO actor_a,org_a
  FROM public.profiles p JOIN public.user_roles r USING(user_id)
  WHERE r.role='administrador' AND p.ativo AND p.organization_id IS NOT NULL
    AND platform_private.platform_actor_access_ready(p.user_id)
    AND public._saas_user_has_feature(p.user_id,'visitas_tecnicas')
  ORDER BY p.user_id LIMIT 1;
  SELECT p.user_id,p.organization_id INTO actor_b,org_b
  FROM public.profiles p JOIN public.user_roles r USING(user_id)
  WHERE r.role='administrador' AND p.ativo AND p.organization_id<>org_a
    AND platform_private.platform_actor_access_ready(p.user_id)
  ORDER BY p.user_id LIMIT 1;
  IF actor_a IS NULL OR actor_b IS NULL THEN
    RAISE EXCEPTION 'A05_PREFLIGHT_NO_ELIGIBLE_REAL_IDENTITIES';
  END IF;
  INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id)
  VALUES(client_a,'AUDIT-RBAC-A05-A',client_a::text,org_a),
        (client_b,'AUDIT-RBAC-A05-B',client_b::text,org_b);
  INSERT INTO public.registros_consultor(id,cliente_id,created_by,consultor_responsavel,codigo_visita)
  VALUES(row_a,client_a,actor_a,actor_a,row_a::text),
        (row_b,client_b,actor_b,actor_b,row_b::text);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO before_cross FROM public.registros_consultor WHERE id=row_b;
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='registros_consultor' AND policyname='audit_a05_tenant_isolation') THEN
  EXECUTE 'CREATE POLICY audit_a05_candidate ON public.registros_consultor AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=registros_consultor.cliente_id AND c.organization_id=public.h15_actor_organization())) WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id=registros_consultor.cliente_id AND c.organization_id=public.h15_actor_organization()))';
  END IF;
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_partner_user_papel(uuid,text) FROM PUBLIC,anon,authenticated';
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO after_own FROM public.registros_consultor WHERE id=row_a;
  SELECT count(*) INTO after_cross FROM public.registros_consultor WHERE id=row_b;
  UPDATE public.registros_consultor SET observacoes_tecnicas='AUDIT-RBAC-A05' WHERE id=row_b;
  GET DIAGNOSTICS changed=ROW_COUNT;
  DELETE FROM public.registros_consultor WHERE id=row_b;
  GET DIAGNOSTICS deleted=ROW_COUNT;
  UPDATE public.registros_consultor SET observacoes_tecnicas='AUDIT-RBAC-A05-OWN' WHERE id=row_a;
  GET DIAGNOSTICS own_updated=ROW_COUNT;
  BEGIN
    UPDATE public.registros_consultor SET cliente_id=client_b WHERE id=row_a;
  EXCEPTION WHEN insufficient_privilege THEN reparent_denied:=true;
  END;
  BEGIN
    PERFORM public.set_partner_user_papel(gen_random_uuid(),'gestor');
  EXCEPTION WHEN insufficient_privilege THEN rpc_denied:=true;
  END;
  BEGIN
    INSERT INTO public.registros_consultor(cliente_id,created_by,consultor_responsavel,codigo_visita)
    VALUES(client_b,actor_a,actor_a,gen_random_uuid()::text);
  EXCEPTION WHEN insufficient_privilege THEN insert_denied:=true;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_b,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO b_own FROM public.registros_consultor WHERE id=row_b;
  SELECT count(*) INTO b_cross FROM public.registros_consultor WHERE id=row_a;
  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'A03_A05_ROLLBACK_RESULT before_cross=%, own=%, cross=%, cross_update=%, cross_delete=%, own_update=%, forged_insert_denied=%, reparent_denied=%, rpc_denied=%, b_own=%, b_cross=%',before_cross,after_own,after_cross,changed,deleted,own_updated,insert_denied,reparent_denied,rpc_denied,b_own,b_cross;
END
$audit$;