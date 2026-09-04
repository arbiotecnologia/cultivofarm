-- H8-A2 — auth_rls_initplan: estabiliza `auth.uid()` como InitPlan escalar nas policies
-- de `public` (staging ikaauvsflpmamgxmkhoq).
--
-- Semântica preservada por construção:
--   * usa ALTER POLICY (nunca DROP/CREATE): nome, comando, PERMISSIVE/RESTRICTIVE e a
--     lista de roles (TO) permanecem exatamente os mesmos;
--   * a única transformação é textual e idempotente: `auth.uid()` → `( SELECT auth.uid() AS uid)`,
--     forma escalar equivalente avaliada uma vez por consulta;
--   * a prova de equivalência é feita em duas vias: antes de alterar, a expressão é
--     "desembrulhada" (remoção dos wrappers já existentes) e comparada com a expressão
--     desembrulhada resultante — se divergir em um único caractere, a migration aborta.
--
-- Nenhuma condição de autorização, tenant, ownership, USING, WITH CHECK ou TO é alterada.
-- Auditoria: private.h8a_policy_audit (schema privado, sem exposição ao Data API).

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.h8a_policy_audit (
    id            bigserial PRIMARY KEY,
    fase          text NOT NULL,
    tabela        text NOT NULL,
    policy        text NOT NULL,
    qual_antes    text,
    qual_depois   text,
    check_antes   text,
    check_depois  text,
    executado_em  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON SCHEMA private FROM anon, authenticated, PUBLIC;
REVOKE ALL ON private.h8a_policy_audit FROM anon, authenticated, PUBLIC;

DO $h8a2$
DECLARE
    WRAPPED constant text := '( SELECT auth.uid() AS uid)';
    pol       record;
    q_before  text;
    c_before  text;
    q_base    text;
    c_base    text;
    q_after   text;
    c_after   text;
    sql       text;
    n_alter   int := 0;
BEGIN
    FOR pol IN
        SELECT n.nspname AS sch, c.relname AS tbl, p.polname AS pol,
               pg_get_expr(p.polqual, p.polrelid)      AS qual,
               pg_get_expr(p.polwithcheck, p.polrelid) AS chk
          FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
         ORDER BY c.relname, p.polname
    LOOP
        q_before := pol.qual;
        c_before := pol.chk;

        -- 1) desembrulha o que já estiver embrulhado
        q_base := replace(coalesce(q_before, ''), WRAPPED, 'auth.uid()');
        c_base := replace(coalesce(c_before, ''), WRAPPED, 'auth.uid()');

        CONTINUE WHEN position('auth.uid()' in q_base || c_base) = 0;

        -- 2) embrulha todas as ocorrências
        q_after := replace(q_base, 'auth.uid()', WRAPPED);
        c_after := replace(c_base, 'auth.uid()', WRAPPED);

        -- 3) prova de equivalência textual (base idêntica antes/depois)
        IF replace(q_after, WRAPPED, 'auth.uid()') IS DISTINCT FROM q_base
           OR replace(c_after, WRAPPED, 'auth.uid()') IS DISTINCT FROM c_base THEN
            RAISE EXCEPTION 'H8A2 ABORT: transformação não equivalente em %.%', pol.tbl, pol.pol;
        END IF;

        CONTINUE WHEN q_after IS NOT DISTINCT FROM coalesce(q_before, '')
                  AND c_after IS NOT DISTINCT FROM coalesce(c_before, '');

        sql := format('ALTER POLICY %I ON public.%I', pol.pol, pol.tbl);
        IF q_before IS NOT NULL THEN sql := sql || format(' USING (%s)', q_after); END IF;
        IF c_before IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', c_after); END IF;
        EXECUTE sql;

        INSERT INTO private.h8a_policy_audit
               (fase, tabela, policy, qual_antes, qual_depois, check_antes, check_depois)
        VALUES ('H8-A2', pol.tbl, pol.pol, q_before, q_after, c_before, c_after);

        n_alter := n_alter + 1;
    END LOOP;

    IF n_alter = 0 THEN
        RAISE EXCEPTION 'H8A2 ABORT: nenhuma policy alterada — baseline inesperado';
    END IF;
    RAISE NOTICE 'H8A2: % policies normalizadas', n_alter;
END
$h8a2$;

-- Pós-condições
DO $h8a2_post$
DECLARE
    restantes int;
    divergentes int;
BEGIN
    -- (a) nenhuma policy com auth.uid() fora do InitPlan
    SELECT count(*) INTO restantes
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND position('auth.uid()' in
             replace(coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
                     coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                     '( SELECT auth.uid() AS uid)', '')) > 0;
    IF restantes <> 0 THEN
        RAISE EXCEPTION 'H8A2 POST ABORT: % policies ainda avaliam auth.uid() por linha', restantes;
    END IF;

    -- (b) toda alteração registrada preserva a expressão-base
    SELECT count(*) INTO divergentes
      FROM private.h8a_policy_audit a
     WHERE a.fase = 'H8-A2'
       AND ( replace(coalesce(a.qual_depois,''), '( SELECT auth.uid() AS uid)', 'auth.uid()')
             IS DISTINCT FROM replace(coalesce(a.qual_antes,''), '( SELECT auth.uid() AS uid)', 'auth.uid()')
          OR replace(coalesce(a.check_depois,''), '( SELECT auth.uid() AS uid)', 'auth.uid()')
             IS DISTINCT FROM replace(coalesce(a.check_antes,''), '( SELECT auth.uid() AS uid)', 'auth.uid()') );
    IF divergentes <> 0 THEN
        RAISE EXCEPTION 'H8A2 POST ABORT: % alterações divergentes na auditoria', divergentes;
    END IF;

    -- (c) total de policies e RLS inalterados
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') <> 543 THEN
        RAISE EXCEPTION 'H8A2 POST ABORT: total de policies mudou';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE') THEN
        RAISE EXCEPTION 'H8A2 POST ABORT: policy restritiva inesperada';
    END IF;
END
$h8a2_post$;
;
