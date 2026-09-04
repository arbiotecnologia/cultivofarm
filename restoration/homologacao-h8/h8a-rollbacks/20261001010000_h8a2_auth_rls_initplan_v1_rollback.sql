-- H8-A2 ROLLBACK — restaura, via ALTER POLICY, a expressão exata registrada em
-- private.h8a_policy_audit (colunas *_antes) para cada policy normalizada na fase H8-A2.
-- Nome, comando, PERMISSIVE/RESTRICTIVE e roles nunca são tocados.
-- Uso somente no staging ikaauvsflpmamgxmkhoq.

DO $h8a2_rb$
DECLARE
    a   record;
    sql text;
    n   int := 0;
BEGIN
    FOR a IN
        SELECT DISTINCT ON (tabela, policy) tabela, policy, qual_antes, check_antes
          FROM private.h8a_policy_audit
         WHERE fase = 'H8-A2'
         ORDER BY tabela, policy, id DESC
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = a.tabela AND policyname = a.policy
        ) THEN
            RAISE EXCEPTION 'H8A2 ROLLBACK ABORT: policy %.% não existe', a.tabela, a.policy;
        END IF;

        sql := format('ALTER POLICY %I ON public.%I', a.policy, a.tabela);
        IF a.qual_antes IS NOT NULL THEN sql := sql || format(' USING (%s)', a.qual_antes); END IF;
        IF a.check_antes IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', a.check_antes); END IF;
        EXECUTE sql;
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'H8A2 ROLLBACK: % policies restauradas', n;
END
$h8a2_rb$;
