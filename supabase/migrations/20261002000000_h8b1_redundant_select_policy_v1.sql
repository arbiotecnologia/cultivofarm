-- H8-B1 — multiple_permissive_policies: remoção de UMA policy permissiva de SELECT
-- comprovadamente subsumida por uma policy FOR ALL idêntica (staging ikaauvsflpmamgxmkhoq).
--
-- Prova de equivalência:
--   public.cliente_documentos possui, para o mesmo role {authenticated} e mesma classe
--   PERMISSIVE:
--     * "Staff can manage client documents"  (FOR ALL)   USING X  WITH CHECK X
--     * "Staff can view all client documents" (FOR SELECT) USING X (mesma expressão X,
--       caractere a caractere após normalização de espaços)
--   Em SELECT, a policy FOR ALL já contribui exatamente a mesma expressão X ao OR
--   permissivo. Logo `X OR X ≡ X`: o conjunto de linhas visível por perfil é rigorosamente
--   o mesmo antes e depois, e nenhuma outra operação (INSERT/UPDATE/DELETE) é tocada.
--
-- Nenhuma outra ocorrência de multiple_permissive_policies é alterada: as demais têm
-- expressões distintas por perfil e a consolidação mudaria a lógica de autorização
-- (pendência documentada no relatório H8-B).
--
-- Auditoria: private.h8a_policy_audit (fase H8-B1) com a definição completa removida.

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

DO $h8b1$
DECLARE
    r_drop record;
    r_all  record;
BEGIN
    SELECT * INTO r_drop FROM pg_policies
     WHERE schemaname='public' AND tablename='cliente_documentos'
       AND policyname='Staff can view all client documents';
    SELECT * INTO r_all FROM pg_policies
     WHERE schemaname='public' AND tablename='cliente_documentos'
       AND policyname='Staff can manage client documents';

    IF r_drop IS NULL OR r_all IS NULL THEN
        RAISE EXCEPTION 'H8B1 ABORT: par de policies esperado não encontrado';
    END IF;
    IF r_drop.cmd <> 'SELECT' OR r_all.cmd <> 'ALL' THEN
        RAISE EXCEPTION 'H8B1 ABORT: comandos inesperados (% / %)', r_drop.cmd, r_all.cmd;
    END IF;
    IF r_drop.permissive <> 'PERMISSIVE' OR r_all.permissive <> 'PERMISSIVE' THEN
        RAISE EXCEPTION 'H8B1 ABORT: classe de policy inesperada';
    END IF;
    IF r_drop.roles IS DISTINCT FROM r_all.roles THEN
        RAISE EXCEPTION 'H8B1 ABORT: roles divergentes';
    END IF;
    IF regexp_replace(coalesce(r_drop.qual,''), '\s+', ' ', 'g')
       IS DISTINCT FROM regexp_replace(coalesce(r_all.qual,''), '\s+', ' ', 'g') THEN
        RAISE EXCEPTION 'H8B1 ABORT: USING não é idêntico ao da policy FOR ALL';
    END IF;
    IF coalesce(r_drop.with_check,'') <> '' THEN
        RAISE EXCEPTION 'H8B1 ABORT: policy alvo possui WITH CHECK inesperado';
    END IF;

    INSERT INTO private.h8a_policy_audit
           (fase, tabela, policy, qual_antes, qual_depois, check_antes, check_depois)
    VALUES ('H8-B1', 'cliente_documentos', 'Staff can view all client documents',
            r_drop.qual, NULL, r_drop.with_check, NULL);

    DROP POLICY "Staff can view all client documents" ON public.cliente_documentos;
END
$h8b1$;

-- Pós-condições
DO $h8b1_post$
DECLARE
    n_select int;
    n_total  int;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                AND tablename='cliente_documentos'
                AND policyname='Staff can view all client documents') THEN
        RAISE EXCEPTION 'H8B1 POST ABORT: policy alvo ainda existe';
    END IF;
    -- cobertura de leitura do staff preservada pela policy FOR ALL
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                    AND tablename='cliente_documentos'
                    AND policyname='Staff can manage client documents'
                    AND cmd='ALL' AND 'authenticated' = ANY(roles)) THEN
        RAISE EXCEPTION 'H8B1 POST ABORT: cobertura FOR ALL perdida';
    END IF;
    SELECT count(*) INTO n_select FROM pg_policies
     WHERE schemaname='public' AND tablename='cliente_documentos' AND cmd='SELECT';
    IF n_select <> 1 THEN
        RAISE EXCEPTION 'H8B1 POST ABORT: policies de SELECT inesperadas (%)', n_select;
    END IF;
    SELECT count(*) INTO n_total FROM pg_policies WHERE schemaname='public';
    IF n_total <> 540 THEN
        RAISE EXCEPTION 'H8B1 POST ABORT: total de policies inesperado (%)', n_total;
    END IF;
END
$h8b1_post$;
