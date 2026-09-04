-- H8-A3 — multiple_permissive_policies: remoção APENAS de policies permissivas
-- literalmente redundantes (staging ikaauvsflpmamgxmkhoq).
--
-- Escopo deliberadamente mínimo. Só é removida a policy que satisfaz TODAS as condições:
--   * mesma tabela, mesmo comando (cmd), mesma lista de roles, mesma classe PERMISSIVE;
--   * expressão USING idêntica caractere a caractere à da policy mantida;
--   * expressão WITH CHECK idêntica (ambas nulas neste caso).
-- Para policies permissivas equivalentes, `a OR a` ≡ `a`: o conjunto de linhas visível
-- por perfil é rigorosamente o mesmo antes e depois, em SELECT/INSERT/UPDATE/DELETE.
--
-- Os demais 115 grupos apontados pelo Advisor têm expressões DIFERENTES e não são
-- consolidados aqui: fundi-los mudaria a lógica de autorização e exige revisão por
-- domínio (pendência formal registrada no relatório H8-A, para H8-B).
--
-- Auditoria: private.h8a_policy_audit (fase H8-A3) com a definição completa removida.

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

DO $h8a3$
DECLARE
    par     record;
    r_drop  record;
    r_keep  record;
    n_drop  int := 0;
BEGIN
    FOR par IN
        SELECT * FROM (VALUES
            ('partner_product_prices', 'ppp_select', 'partner_product_prices_select'),
            ('talhao_safras', 'Portal: Ler safras dos talhões acessíveis', 'Authenticated users can read talhao_safras')
        ) AS t(tabela, alvo, mantida)
    LOOP
        SELECT * INTO r_drop FROM pg_policies
         WHERE schemaname = 'public' AND tablename = par.tabela AND policyname = par.alvo;
        SELECT * INTO r_keep FROM pg_policies
         WHERE schemaname = 'public' AND tablename = par.tabela AND policyname = par.mantida;

        IF r_drop IS NULL OR r_keep IS NULL THEN
            RAISE EXCEPTION 'H8A3 ABORT: par %/% não encontrado em %', par.alvo, par.mantida, par.tabela;
        END IF;
        IF r_drop.cmd IS DISTINCT FROM r_keep.cmd
           OR r_drop.permissive IS DISTINCT FROM r_keep.permissive
           OR r_drop.permissive <> 'PERMISSIVE'
           OR r_drop.roles IS DISTINCT FROM r_keep.roles
           OR coalesce(r_drop.qual, '') IS DISTINCT FROM coalesce(r_keep.qual, '')
           OR coalesce(r_drop.with_check, '') IS DISTINCT FROM coalesce(r_keep.with_check, '') THEN
            RAISE EXCEPTION 'H8A3 ABORT: % não é redundante de % em %', par.alvo, par.mantida, par.tabela;
        END IF;

        INSERT INTO private.h8a_policy_audit
               (fase, tabela, policy, qual_antes, qual_depois, check_antes, check_depois)
        VALUES ('H8-A3', par.tabela, par.alvo, r_drop.qual, NULL, r_drop.with_check, NULL);

        EXECUTE format('DROP POLICY %I ON public.%I', par.alvo, par.tabela);
        n_drop := n_drop + 1;
    END LOOP;

    IF n_drop <> 2 THEN
        RAISE EXCEPTION 'H8A3 ABORT: esperadas 2 remoções, obtidas %', n_drop;
    END IF;
END
$h8a3$;

-- Pós-condições
DO $h8a3_post$
DECLARE
    identicas int;
    total int;
BEGIN
    SELECT count(*) INTO identicas FROM (
        SELECT tablename, cmd, roles, coalesce(qual,''), coalesce(with_check,'')
          FROM pg_policies
         WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
         GROUP BY 1,2,3,4,5 HAVING count(*) > 1) x;
    IF identicas <> 0 THEN
        RAISE EXCEPTION 'H8A3 POST ABORT: ainda há % grupo(s) de policies idênticas', identicas;
    END IF;

    SELECT count(*) INTO total FROM pg_policies WHERE schemaname = 'public';
    IF total <> 541 THEN
        RAISE EXCEPTION 'H8A3 POST ABORT: total de policies inesperado (%)', total;
    END IF;

    -- as policies mantidas continuam existindo e cobrindo SELECT para authenticated
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                    AND tablename='partner_product_prices' AND policyname='partner_product_prices_select'
                    AND cmd='SELECT' AND 'authenticated' = ANY(roles)) THEN
        RAISE EXCEPTION 'H8A3 POST ABORT: cobertura de partner_product_prices perdida';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                    AND tablename='talhao_safras' AND policyname='Authenticated users can read talhao_safras'
                    AND cmd='SELECT' AND 'authenticated' = ANY(roles)) THEN
        RAISE EXCEPTION 'H8A3 POST ABORT: cobertura de talhao_safras perdida';
    END IF;
END
$h8a3_post$;
