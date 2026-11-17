-- GERADO por build_seed.py; não editar.
-- LIMPEZA QA (HML vrlcdwmlytukrjezrrnf, postgres, transação única). Exige o DIGEST aprovado no dry-run:
--   SET app.qa_cleanup_digest = '<digest do 06a>';  (na mesma sessão, antes deste script)
-- Escopo: só linhas ligadas por coluna uuid aos 5 usuários, 3 parceiros, 2 assinaturas, 4 overrides e manifesto. Qualquer recusa
-- (tabela protegida, outro tenant, ator QA em linha de negócio, fixture proibida, referência só textual, volume) aborta.
-- Planos/versões/catálogo/tenants nunca entram. Relaxa SÓ gatilhos de DELETE das tabelas atingidas para os hashes exatos e
-- restaura def/md5 antes do COMMIT. auth.* intocado (contas saem pelo painel Auth depois).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN IF session_user <> 'postgres' OR to_regprocedure('platform_private.homolog_validation_block_receivable_insert()') IS NULL
  OR to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'QA_CLEAN_REFUSED: alvo/sessão'; END IF;
 IF to_regnamespace('qa_b2bfin') IS NULL THEN CREATE SCHEMA qa_b2bfin; REVOKE ALL ON SCHEMA qa_b2bfin FROM PUBLIC;
  CREATE TABLE qa_b2bfin.manifest(kind text NOT NULL, label text, tbl regclass NOT NULL, id uuid NOT NULL, PRIMARY KEY (tbl, id)); END IF;
END $$;
{{LIB}}
{{DISCOVER}}
DO $$ DECLARE d text; BEGIN
 IF EXISTS (SELECT 1 FROM qa_refuse) THEN RAISE EXCEPTION 'QA_CLEAN_REFUSED: % recusa(s) — ver 06a', (SELECT count(*) FROM qa_refuse); END IF;
 SELECT md5(coalesce(string_agg(x, ',' ORDER BY x), '')) INTO d FROM (SELECT DISTINCT tbl::text || ':' || rowhash x FROM qa_hit) q;
 IF d IS DISTINCT FROM current_setting('app.qa_cleanup_digest', true) THEN RAISE EXCEPTION 'QA_CLEAN_REFUSED: digest % difere do aprovado no dry-run', d; END IF;
END $$;
INSERT INTO qa_b2bfin.ticket VALUES (txid_current(), 'cleanup');
INSERT INTO qa_b2bfin.rowmark SELECT rowhash, tbl FROM qa_hit ON CONFLICT DO NOTHING;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT DISTINCT t.tgfoid::regprocedure f FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN (SELECT tbl FROM qa_hit) AND (t.tgtype & 8) <> 0 AND (t.tgtype & 1) <> 0 LOOP
  PERFORM qa_b2bfin.relax(c.f); END LOOP; END $$;
DO $$ DECLARE pass int; t regclass; n bigint; c record; BEGIN
 FOR pass IN 1..12 LOOP
  FOR t IN SELECT DISTINCT tbl FROM qa_hit LOOP
   BEGIN EXECUTE format('DELETE FROM %s x WHERE md5(to_jsonb(x)::text) IN (SELECT rowhash FROM qa_hit WHERE tbl = %L::regclass)', t, t);
   EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  END LOOP;
 END LOOP;
 FOR c IN SELECT a.attrelid::regclass t, a.attname col, format_type(a.atttypid, NULL) ty FROM pg_attribute a JOIN pg_class r ON r.oid = a.attrelid JOIN pg_namespace s ON s.oid = r.relnamespace
   WHERE r.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped AND s.nspname IN ('public','platform_private') AND format_type(a.atttypid, NULL) IN ('uuid','uuid[]') LOOP
  EXECUTE format('SELECT count(*) FROM %s x JOIN qa_seed s ON %s', c.t, CASE c.ty WHEN 'uuid' THEN format('x.%I = s.id', c.col) ELSE format('s.id = ANY (x.%I)', c.col) END) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'QA_CLEAN_INCOMPLETE: % linhas ainda referenciam a semente em %.% (rollback integral)', n, c.t, c.col; END IF;
 END LOOP;
END $$;
SELECT 'QA_CLEAN_DELETED' k, jsonb_object_agg(tbl::text, n) v FROM (SELECT tbl, count(DISTINCT rowhash) n FROM qa_hit GROUP BY tbl) x;
SELECT 'QA_CLEAN_RESTORED' k, qa_b2bfin.restore_all() v;
DROP SCHEMA qa_b2bfin CASCADE;
SELECT 'QA_CLEAN_PASS' k, (SELECT count(*) FROM auth.users WHERE id IN ('7d15eddb-38b6-43dd-bbf5-43936155321d','5db79a8e-82af-419d-ae66-87a98c02fbec','c3ed723f-1017-478e-99b2-25b48b3ab77e','1d0ea582-1d46-4152-8fbe-f425c74942c1','51652ab6-da23-4a3d-8f29-417af15cc761')) contas_auth_a_remover_no_painel;
COMMIT;
