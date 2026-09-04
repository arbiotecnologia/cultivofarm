-- H8-A1 — Remoção controlada de índices duplicados (staging ikaauvsflpmamgxmkhoq).
--
-- Critério de equivalência: definição normalizada de pg_get_indexdef (sem o nome do
-- índice) idêntica na MESMA tabela — o que já cobre colunas/expressões, ordem, opclass,
-- collation, método, predicado parcial e unicidade. Nenhum índice é removido por nome.
--
-- Preservados obrigatoriamente: índices de PRIMARY KEY, índices que sustentam constraint
-- (pg_constraint.conindid), índices inválidos e índices citados por script de verificação
-- versionado (`idx_produto_etiquetas_envase`, `idx_produto_etiquetas_lote`,
-- `ux_recurring_generation_success`, `ux_fi_idempotency_key`).
-- Por isso o grupo duplicado de `public.formulacoes` NÃO é tocado: os dois índices são
-- exigidos por constraints distintas.
--
-- Fail-fast: aborta se o índice a remover não existir, for de constraint/PK, for inválido
-- ou se o índice remanescente informado não tiver definição normalizada idêntica.
-- Auditoria: private.h8a_index_audit (schema privado, sem exposição ao Data API).

-- Transação controlada pelo aplicador (h8a-apply.sh / h7o-apply.mjs): sem BEGIN/COMMIT aqui.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.h8a_index_audit (
    id            bigserial PRIMARY KEY,
    fase          text NOT NULL,
    objeto        text NOT NULL,
    acao          text NOT NULL,
    definicao     text NOT NULL,
    substituto    text,
    executado_em  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON SCHEMA private FROM anon, authenticated, PUBLIC;
REVOKE ALL ON private.h8a_index_audit FROM anon, authenticated, PUBLIC;

DO $h8a1$
DECLARE
    par     record;
    v_drop  regclass;
    v_keep  regclass;
    v_defd  text;
    v_defk  text;
    v_norm  text := ' INDEX [^ ]+ ON ';
    n_drop  int := 0;
BEGIN
    FOR par IN
        SELECT * FROM (VALUES
            ('idx_api_due','idx_ap_inst_due'),
            ('idx_api_status','idx_ap_inst_status'),
            ('idx_ari_due','idx_ar_inst_due'),
            ('idx_ari_status','idx_ar_inst_status'),
            ('idx_alertas_notif_alerta','idx_alertas_notificacoes_alerta_id'),
            ('idx_catalog_sources_entity','idx_catalog_technical_sources_entidade'),
            ('idx_entregas_ordem_servico_id','idx_entregas_os_manual'),
            ('idx_entregas_os','idx_entregas_os_manual'),
            ('idx_entregas_ordem_servico_onfarm_id','idx_entregas_os_onfarm'),
            ('idx_entregas_os_onfarm_id','idx_entregas_os_onfarm'),
            ('idx_entregas_oso','idx_entregas_os_onfarm'),
            ('idx_fd_owner','idx_findocs_owner'),
            ('idx_fin_docs_owner','idx_findocs_owner'),
            ('fi_idempotency_uq','ux_fi_idempotency_key'),
            ('ux_lotes_programacao_id','idx_lotes_programacao_id_unique'),
            ('idx_notif_op_usuario','idx_notif_op_usuario_lido_created'),
            ('idx_partner_orders_payment_status','idx_partner_orders_payment_approval'),
            ('idx_partner_users_user','idx_partner_users_user_id'),
            ('idx_portal_solicitacoes_consultor_status','idx_portal_solic_consultor'),
            ('idx_produto_etiquetas_lote_id','idx_produto_etiquetas_lote'),
            ('idx_produto_etiquetas_envase_id','idx_produto_etiquetas_envase'),
            ('produto_etiquetas_trace_idx','idx_produto_etiquetas_trace_token'),
            ('uq_recurring_log_success','ux_recurring_generation_success'),
            ('idx_registros_consultor_consultor_status','idx_registros_consultor_resp_status'),
            ('idx_registros_consultor_recomendacoes_registro_id','idx_rec_registro_id'),
            ('idx_visita_diagnosticos_registro','idx_visita_diagnosticos_registro_id'),
            ('idx_checkin_data','idx_visitas_checkin_data_hora'),
            ('idx_checkin_solicitacao','idx_visitas_checkin_solicitacao_id'),
            ('idx_visitas_checkin_client_uuid','visitas_checkin_client_uuid_uq'),
            ('visitas_checkin_client_uuid_uniq','visitas_checkin_client_uuid_uq'),
            ('idx_visitas_checkin_registro_consultor_id','idx_visitas_checkin_registro_consultor'),
            ('idx_visitas_logs_registro','idx_visitas_logs_registro_consultor')
        ) AS t(alvo, mantido)
    LOOP
        SELECT c.oid INTO v_drop FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = par.alvo AND c.relkind = 'i';
        SELECT c.oid INTO v_keep FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = par.mantido AND c.relkind = 'i';

        IF v_drop IS NULL THEN
            RAISE EXCEPTION 'H8A1 ABORT: índice alvo % não existe', par.alvo;
        END IF;
        IF v_keep IS NULL THEN
            RAISE EXCEPTION 'H8A1 ABORT: índice remanescente % não existe', par.mantido;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = v_drop
                    AND (i.indisprimary OR NOT i.indisvalid)) THEN
            RAISE EXCEPTION 'H8A1 ABORT: % é primária ou inválida', par.alvo;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = v_drop) THEN
            RAISE EXCEPTION 'H8A1 ABORT: % sustenta constraint', par.alvo;
        END IF;
        IF (SELECT indrelid FROM pg_index WHERE indexrelid = v_drop)
           <> (SELECT indrelid FROM pg_index WHERE indexrelid = v_keep) THEN
            RAISE EXCEPTION 'H8A1 ABORT: % e % não são da mesma tabela', par.alvo, par.mantido;
        END IF;

        v_defd := regexp_replace(pg_get_indexdef(v_drop), v_norm, ' INDEX ON ');
        v_defk := regexp_replace(pg_get_indexdef(v_keep), v_norm, ' INDEX ON ');
        IF v_defd IS DISTINCT FROM v_defk THEN
            RAISE EXCEPTION 'H8A1 ABORT: definições não equivalentes (% vs %)', par.alvo, par.mantido;
        END IF;

        INSERT INTO private.h8a_index_audit (fase, objeto, acao, definicao, substituto)
        VALUES ('H8-A1', par.alvo, 'DROP_INDEX', pg_get_indexdef(v_drop), par.mantido);

        EXECUTE format('DROP INDEX public.%I', par.alvo);
        n_drop := n_drop + 1;
    END LOOP;

    IF n_drop <> 32 THEN
        RAISE EXCEPTION 'H8A1 ABORT: esperados 32 índices removidos, obtidos %', n_drop;
    END IF;
END
$h8a1$;

-- Pós-condições: apenas o grupo de `formulacoes` (dois índices de constraint) pode
-- permanecer duplicado, e todos os índices remanescentes devem existir.
DO $h8a1_post$
DECLARE
    grupos int;
    grupos_nao_constraint int;
BEGIN
    SELECT count(*) INTO grupos FROM (
        SELECT i.indrelid, regexp_replace(pg_get_indexdef(i.indexrelid), ' INDEX [^ ]+ ON ', ' INDEX ON ') d
          FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
         GROUP BY 1, 2 HAVING count(*) > 1) g;

    SELECT count(*) INTO grupos_nao_constraint FROM (
        SELECT i.indrelid, regexp_replace(pg_get_indexdef(i.indexrelid), ' INDEX [^ ]+ ON ', ' INDEX ON ') d
          FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid)
         GROUP BY 1, 2 HAVING count(*) > 1) g2;

    IF grupos <> 1 THEN
        RAISE EXCEPTION 'H8A1 POST ABORT: esperado 1 grupo duplicado remanescente (formulacoes), obtido %', grupos;
    END IF;
    IF grupos_nao_constraint <> 0 THEN
        RAISE EXCEPTION 'H8A1 POST ABORT: ainda há % grupo(s) duplicado(s) sem constraint', grupos_nao_constraint;
    END IF;
    IF (SELECT count(DISTINCT objeto) FROM private.h8a_index_audit WHERE fase = 'H8-A1') <> 32 THEN
        RAISE EXCEPTION 'H8A1 POST ABORT: auditoria incompleta';
    END IF;
END
$h8a1_post$;
