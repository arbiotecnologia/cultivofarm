-- Postcheck H2 — somente leitura. Falha (raise) se algum invariante quebrar.
\pset pager off

-- 1) Nenhuma policy de storage aberta a qualquer autenticado sem vínculo
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND COALESCE(qual, with_check,'') LIKE '%visit-pdfs%'
     AND COALESCE(qual, with_check,'') !~* 'has_role';
  IF n > 0 THEN RAISE EXCEPTION 'H2-001 FALHA: % policies abertas em visit-pdfs', n; END IF;
  RAISE NOTICE 'H2-001 OK: visit-pdfs restrito a papéis internos';
END $$;

-- 2) Nenhum bucket público além de `logos`
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM storage.buckets WHERE public AND id <> 'logos';
  IF n > 0 THEN RAISE EXCEPTION 'H2-002 FALHA: % buckets públicos inesperados', n; END IF;
  RAISE NOTICE 'H2-002 OK: apenas `logos` é público';
END $$;

-- 3) Todas as tabelas public com RLS
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  IF n > 0 THEN RAISE EXCEPTION 'H2-003 FALHA: % tabelas sem RLS', n; END IF;
  RAISE NOTICE 'H2-003 OK: RLS habilitado em todas as tabelas public';
END $$;

-- 4) SECURITY DEFINER: search_path fixo e anon apenas nas RPCs públicas de validação
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.prosecdef
     AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF n > 0 THEN RAISE EXCEPTION 'H2-004 FALHA: % funções SECDEF sem search_path', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND p.proname NOT IN ('rpc_validar_comprovante_entrega','rpc_validar_rastreio_produto');
  IF n > 0 THEN RAISE EXCEPTION 'H2-005 FALHA: % SECDEF executáveis por anon', n; END IF;
  RAISE NOTICE 'H2-004/005 OK: SECDEF endurecidas';
END $$;

-- 5) Isolamento por tenant preservado nas tabelas núcleo
DO $$
DECLARE t text; n int;
BEGIN
  FOREACH t IN ARRAY ARRAY['ordens_servico','entregas','clientes','fazendas','talhoes','partner_orders'] LOOP
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname='public' AND tablename=t AND cmd IN ('SELECT','ALL')
       AND btrim(COALESCE(qual,'')) IN ('true','(true)');
    IF n > 0 THEN RAISE EXCEPTION 'H2-006 FALHA: % com policy irrestrita', t; END IF;
  END LOOP;
  RAISE NOTICE 'H2-006 OK: tabelas núcleo sem leitura irrestrita';
END $$;
