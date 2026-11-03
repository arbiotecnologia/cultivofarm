-- ============================================================================================
-- 02 — MANUTENÇÃO LIMITADA: descarte da cadeia de TESTE SEM EMPRESA (decisão do proprietário 01/11/2026)
-- GERADO por build.py a partir de maint_template.sql + pins LIVE do pacote consolidado (não editar o .review).
-- CANDIDATO .review — NÃO EXECUTADO em banco hospedado. Executar SOMENTE após revisão, como owner das tabelas,
-- ANTES de 00-pre-global/01-migrate (cujo PRE exige a cadeia ausente).
--
-- Escopo fechado (IDs/contagens exatos; qualquer divergência aborta tudo):
--   raízes: OS 4a5af44d…, programação 8896d700…, lote cd49ce12…, envase bca8a46a…, estoque 000cd77c…, entrega 20d66f88…
--   filhos: 9 entrega_checklist (por entrega_id), 1 comprovante cee1b253… (gerado, sem arquivo/snapshot),
--           2 movimentações 619cde9e…/3f40d033…, 1 CQ 51cf7c0c…  => 19 linhas
-- Garantias:
--   * uma transação; locks ACCESS EXCLUSIVE nas 11 tabelas antes de qualquer validação;
--   * sem CASCADE, sem DISABLE TRIGGER ALL, sem session_replication_role, sem GUC/JWT falso;
--   * apenas 8 gatilhos nominais (pin da definição exata) são suspensos e reabilitados no MESMO TX;
--     gates de estoque, refresh da esteira, checklist e comprovante permanecem ATIVOS;
--   * conjunto completo dos {{N_TRIGGERS}} gatilhos das 11 tabelas (nome+tgtype+definição+corpo md5) exatamente o capturado
--     em 02/11/2026 (captura-manutencao-20261102.json); sem regras; event triggers só se pinados (lista vazia => aborta);
--   * papel executor em allowlist ({{MAINT_ROLES}}), sem JWT (auth.uid() NULL, claims vazias);
--   * ordem de locks igual ao gate: singleton cf_user_guards_v1.state FOR UPDATE primeiro, depois as 11 tabelas;
--   * varredura FK pareada por (tabela,id) do manifesto, alvo FK = id do pai; FK composta ou alvo != id => aborta;
--   * POST: linhas fora do escopo (11 tabelas + filhas por FK), corpos de funções, ACL/RLS/policies idênticos ao PRE;
--   * prova antes do COMMIT: catálogo de gatilhos idêntico ao snapshot inicial; nenhum desabilitado;
--   * repetição: registro concluído + cadeia ausente => nada excluído; ausência sem registro aborta;
--   * nenhum bypass persistente: só o registro privado de auditoria é criado.
-- ============================================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- A. pré-voo ANTES de qualquer DDL (CREATE TABLE/ALTER TABLE disparam event triggers)
DO $pre$
DECLARE allowed constant text[] := ARRAY[{{MAINT_ROLES_SQL}}]::text[];
        evt_pins constant jsonb := '{{EVENT_TRIGGER_PINS}}'::jsonb; r record;
        v_uid text;
BEGIN
  IF current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION 'maint:replication_role_not_origin'; END IF;
  IF NOT (current_user::text = ANY(allowed)) OR NOT (session_user::text = ANY(allowed)) THEN
    RAISE EXCEPTION 'maint:role_not_allowlisted:%/%', current_user, session_user; END IF;
  IF coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}') NOT IN ('{}','null')
     OR nullif(current_setting('request.jwt.claim.sub', true),'') IS NOT NULL
     OR nullif(current_setting('request.jwt.claim.role', true),'') IS NOT NULL THEN RAISE EXCEPTION 'maint:jwt_context_present'; END IF;
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'SELECT auth.uid()::text' INTO v_uid;
    IF v_uid IS NOT NULL THEN RAISE EXCEPTION 'maint:auth_uid_not_null'; END IF;
  END IF;
  -- event triggers: TODO gatilho de evento não desabilitado precisa coincidir com o pin completo
  -- (nome, evento, evtenabled, evttags ordenadas/NULL, assinatura da função, md5 do corpo); desconhecido aborta.
  -- Nunca desativa event triggers: apenas audita a composição revisada.
  FOR r IN SELECT e.evtname::text AS evtname, e.evtevent::text AS evtevent, e.evtenabled::text AS evtenabled,
                  CASE WHEN e.evttags IS NULL THEN 'null'::jsonb ELSE (SELECT jsonb_agg(t ORDER BY t) FROM unnest(e.evttags) t) END AS tags,
                  p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig, md5(pg_get_functiondef(e.evtfoid)) AS fmd5
           FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid WHERE e.evtenabled <> 'D' LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(evt_pins) q WHERE q->>'evtname'=r.evtname AND q->>'evtevent'=r.evtevent
                   AND q->>'evtenabled'=r.evtenabled AND coalesce(q->'evttags','null'::jsonb)=r.tags
                   AND q->>'function_signature'=r.sig AND q->>'function_md5'=r.fmd5) THEN
      RAISE EXCEPTION 'maint:event_trigger_unreviewed:%:%:%:%', r.evtname, r.evtevent, r.evtenabled, r.tags; END IF;
  END LOOP;
  IF to_regclass('cf_user_guards_v1.state') IS NULL THEN RAISE EXCEPTION 'maint:gate_singleton_missing'; END IF;
END $pre$;

-- B. ordem de locks do gate de estoque: singleton primeiro (espera limitada), depois tabelas
SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_locks l WHERE l.locktype='transactionid' AND l.pid=pg_backend_pid() AND l.granted) THEN
    RAISE EXCEPTION 'maint:gate_singleton_not_locked'; END IF;
END $g$;

-- C. registro privado: ACL somente do dono (allowlist); default ACL registrado; qualquer outro beneficiário é revogado e reprovado
CREATE TABLE IF NOT EXISTS platform_private.chain_purge_maintenance_ledger(
  id bigserial PRIMARY KEY, purge_key text NOT NULL, step text NOT NULL, detail jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp());
DO $r$
DECLARE allowed constant text[] := ARRAY[{{MAINT_ROLES_SQL}}]::text[]; g record; rl text;
BEGIN
  IF NOT ((SELECT pg_get_userbyid(relowner)::text FROM pg_class WHERE oid='platform_private.chain_purge_maintenance_ledger'::regclass) = ANY(allowed)) THEN
    RAISE EXCEPTION 'maint:ledger_owner_not_allowlisted'; END IF;
  EXECUTE 'REVOKE ALL ON platform_private.chain_purge_maintenance_ledger FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON SEQUENCE platform_private.chain_purge_maintenance_ledger_id_seq FROM PUBLIC';
  FOREACH rl IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=rl) THEN
      EXECUTE format('REVOKE ALL ON platform_private.chain_purge_maintenance_ledger FROM %I', rl);
      EXECUTE format('REVOKE ALL ON SEQUENCE platform_private.chain_purge_maintenance_ledger_id_seq FROM %I', rl);
    END IF;
  END LOOP;
  FOR g IN SELECT DISTINCT c.oid::regclass::text AS obj, c.relkind, a.grantee FROM pg_class c, aclexplode(c.relacl) a
            WHERE c.oid IN ('platform_private.chain_purge_maintenance_ledger'::regclass,'platform_private.chain_purge_maintenance_ledger_id_seq'::regclass)
              AND a.grantee <> c.relowner LOOP
    EXECUTE format('REVOKE ALL ON %s %s FROM %s', CASE g.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, g.obj,
                   CASE g.grantee WHEN 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
              WHERE c.oid IN ('platform_private.chain_purge_maintenance_ledger'::regclass,'platform_private.chain_purge_maintenance_ledger_id_seq'::regclass)
                AND a.grantee <> c.relowner) THEN RAISE EXCEPTION 'maint:ledger_acl_not_owner_only'; END IF;
  FOREACH rl IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=rl)
       AND has_table_privilege(rl,'platform_private.chain_purge_maintenance_ledger','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'maint:ledger_privilege_leak:%', rl; END IF;
  END LOOP;
END $r$;

LOCK TABLE public.entrega_checklist, public.entrega_comprovantes, public.entrega_termos, public.entregas,
           public.estoque_movimentacoes, public.estoque_produto, public.envase, public.controle_qualidade,
           public.lotes, public.programacao_producao, public.ordens_servico IN ACCESS EXCLUSIVE MODE;

-- D. auxiliares TEMPORÁRIOS (removidos antes do COMMIT; sem EXECUTE para ninguém além do dono)
CREATE FUNCTION platform_private.__maint_rows_digest(p_rel text) RETURNS text LANGUAGE plpgsql SET search_path = '' AS $f$
DECLARE v text; v_short text := split_part(p_rel, '.', 2); has_id boolean;
BEGIN
  v_short := trim(both '"' from v_short);
  has_id := EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=p_rel::regclass AND a.attname='id' AND NOT a.attisdropped AND a.atttypid='uuid'::regtype);
  IF has_id THEN
    EXECUTE format('SELECT md5(coalesce(string_agg(md5(to_jsonb(x)::text), '','' ORDER BY x.id::text), '''')) FROM %s x
                     WHERE NOT EXISTS (SELECT 1 FROM pg_temp.tc_maint_manifest m WHERE m.rel=$1 AND m.id=x.id)', p_rel) INTO v USING v_short;
  ELSE
    EXECUTE format('SELECT md5(coalesce(string_agg(h, '','' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM %s x) s', p_rel) INTO v;
  END IF;
  RETURN v;
END $f$;
CREATE FUNCTION platform_private.__maint_meta_digest(p_tables text[]) RETURNS jsonb LANGUAGE sql SET search_path = '' AS $f$
  SELECT jsonb_build_object(
    'functions', (SELECT md5(string_agg(p.oid::regprocedure::text || ':' || md5(CASE WHEN p.prokind IN ('f','p') THEN pg_catalog.pg_get_functiondef(p.oid) ELSE p.prosrc END)
                                         || ':' || coalesce(p.proacl::text,''), ',' ORDER BY p.oid::regprocedure::text))
                    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname IN ('public','platform_private','cf_user_guards_v1','auth') AND p.prokind IN ('f','p')
                     AND p.proname NOT LIKE '\_\_maint\_%'),
    'tables', (SELECT jsonb_object_agg(c.relname, jsonb_build_object('acl', coalesce(c.relacl::text,''), 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
                   'policies', (SELECT md5(coalesce(string_agg(pl.polname::text||':'||pl.polcmd::text||':'||pl.polpermissive::text||':'||coalesce(pg_catalog.pg_get_expr(pl.polqual,pl.polrelid),'')
                                ||':'||coalesce(pg_catalog.pg_get_expr(pl.polwithcheck,pl.polrelid),''), ',' ORDER BY pl.polname),'')) FROM pg_catalog.pg_policy pl WHERE pl.polrelid=c.oid)))
                 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname = ANY(p_tables)));
$f$;
REVOKE ALL ON FUNCTION platform_private.__maint_rows_digest(text), platform_private.__maint_meta_digest(text[]) FROM PUBLIC;

DO $maint$
DECLARE
  k constant text := 'chain-sem-empresa-20261101';
  c_os constant uuid := '4a5af44d-ea5a-4810-8b99-ea601fad8547';
  c_pp constant uuid := '8896d700-5697-4346-9970-c76373cfb232';
  c_lt constant uuid := 'cd49ce12-9d06-459c-b874-3c8d3a275423';
  c_ev constant uuid := 'bca8a46a-77a8-435c-ae67-b0ece207d91a';
  c_ep constant uuid := '000cd77c-506c-4cdf-b2bd-7233aff8efeb';
  c_en constant uuid := '20d66f88-b3dd-4a6f-93ac-6ecf03c7468d';
  c_pr constant uuid := 'cee1b253-be2e-4f62-8b56-0ea15d8e4ec6';
  c_cq constant uuid := '51cf7c0c-be1b-4007-8882-a26a5399a2a0';
  c_mv constant uuid[] := ARRAY['619cde9e-3199-4b3a-bb35-de4bc2f9132c','3f40d033-36f0-4dc2-bf01-750f10433fb6']::uuid[];
  scope_tables constant text[] := ARRAY['entrega_checklist','entrega_comprovantes','entrega_termos','entregas','estoque_movimentacoes',
    'estoque_produto','envase','controle_qualidade','lotes','programacao_producao','ordens_servico'];
  -- 8 gatilhos suspensos (nomes); definições/funções conferidas pelos pins md5 abaixo
  susp constant text[] := ARRAY['controle_qualidade|aa_manual_cq_write_fence_v1','controle_qualidade|trg_cq_resultado_imutavel',
    'estoque_movimentacoes|trg_estoque_mov_append_only','entregas|zz_delivery_mutation_closed','envase|trg_envase_material_imutavel',
    'estoque_produto|a00_stock_p1_tenant_guard','estoque_produto|trg_estoque_produto_guard','lotes|aa_manual_lot_delete_v1'];
  c_ck constant uuid[] := ARRAY[{{CHECKLIST_IDS}}]::uuid[];
  scope_tables_q text[];
  v_ck uuid[]; v_out_before jsonb; v_out_after jsonb; v_meta_before jsonb; v_meta_after jsonb; v_fk_rels text[]; v_found text[]; v_n bigint; v_present bigint; v_done boolean; v_rows jsonb; v_before jsonb; v_after jsonb;
  r record; s text; p text[]; v_guard int := 0;
BEGIN
  IF current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION 'maint:replication_role_not_origin'; END IF;
  scope_tables_q := ARRAY(SELECT 'public.'||quote_ident(x) FROM unnest(scope_tables) x);

  -- 0. idempotência / repetição
  SELECT (SELECT count(*) FROM public.ordens_servico WHERE id=c_os)+(SELECT count(*) FROM public.programacao_producao WHERE id=c_pp)
        +(SELECT count(*) FROM public.lotes WHERE id=c_lt)+(SELECT count(*) FROM public.envase WHERE id=c_ev)
        +(SELECT count(*) FROM public.estoque_produto WHERE id=c_ep)+(SELECT count(*) FROM public.entregas WHERE id=c_en)
        +(SELECT count(*) FROM public.entrega_comprovantes WHERE id=c_pr)+(SELECT count(*) FROM public.controle_qualidade WHERE id=c_cq)
        +(SELECT count(*) FROM public.estoque_movimentacoes WHERE id=ANY(c_mv))
        +(SELECT count(*) FROM public.entrega_checklist WHERE entrega_id=c_en) INTO v_present;
  v_done := EXISTS (SELECT 1 FROM platform_private.chain_purge_maintenance_ledger WHERE purge_key=k AND step='committed');
  IF v_done AND v_present = 0 THEN
    INSERT INTO platform_private.chain_purge_maintenance_ledger(purge_key,step,detail) VALUES (k,'replay_noop',jsonb_build_object('deleted',0));
    RAISE NOTICE 'maint:already_purged_noop'; RETURN;
  END IF;
  IF v_done THEN RAISE EXCEPTION 'maint:ledger_committed_but_rows_present:%', v_present; END IF;
  IF v_present <> 19 THEN RAISE EXCEPTION 'maint:scope_count_mismatch:expected_19_got_%', v_present; END IF;

  -- 1. callbacks: conjunto EXATO dos {{N_TRIGGERS}} gatilhos capturados (md5 de pg_get_triggerdef e pg_get_functiondef), todos 'O', sem regras
  CREATE TEMP TABLE tc_maint_trg_pins(rel text, tgname text, tgtype int, tmd5 text, fmd5 text) ON COMMIT DROP;
  INSERT INTO tc_maint_trg_pins VALUES {{TRIGGER_PINS}};
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname=ANY(scope_tables) AND NOT t.tgisinternal
                AND NOT EXISTS (SELECT 1 FROM tc_maint_trg_pins p WHERE p.rel=c.relname AND p.tgname=t.tgname)) THEN
    RAISE EXCEPTION 'maint:trigger_set_drift:unexpected'; END IF;
  FOR r IN SELECT p.*, t.oid AS toid, t.tgfoid, t.tgenabled, t.tgtype AS live_type FROM tc_maint_trg_pins p
             LEFT JOIN pg_trigger t ON t.tgrelid=('public.'||p.rel)::regclass AND t.tgname=p.tgname AND NOT t.tgisinternal LOOP
    IF r.toid IS NULL THEN RAISE EXCEPTION 'maint:trigger_set_drift:missing:%.%', r.rel, r.tgname; END IF;
    IF r.tgenabled <> 'O' THEN RAISE EXCEPTION 'maint:trigger_not_enabled_before:%.%', r.rel, r.tgname; END IF;
    IF r.live_type <> r.tgtype THEN RAISE EXCEPTION 'maint:trigger_type_drift:%.%', r.rel, r.tgname; END IF;
    IF md5(pg_get_triggerdef(r.toid)) <> r.tmd5 THEN RAISE EXCEPTION 'maint:trigger_definition_drift:%.%', r.rel, r.tgname; END IF;
    IF md5(pg_get_functiondef(r.tgfoid)) <> r.fmd5 THEN RAISE EXCEPTION 'maint:trigger_function_drift:%.%', r.rel, r.tgname; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_rewrite w JOIN pg_class c ON c.oid=w.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname=ANY(scope_tables) AND w.rulename <> '_RETURN') THEN
    RAISE EXCEPTION 'maint:rule_present'; END IF;
  FOREACH s IN ARRAY susp LOOP p := string_to_array(s, '|');
    IF NOT EXISTS (SELECT 1 FROM tc_maint_trg_pins WHERE rel=p[1] AND tgname=p[2]) THEN RAISE EXCEPTION 'maint:suspended_not_pinned:%', s; END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('rel',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'foid',t.tgfoid::regprocedure::text,
         'type',t.tgtype,'def',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text, t.tgname) INTO v_before
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=ANY(scope_tables) AND NOT t.tgisinternal;

  -- 2. revalidação exata de vínculos e estado (sob os locks)
  IF NOT EXISTS (SELECT 1 FROM public.ordens_servico WHERE id=c_os AND organization_id IS NULL) THEN RAISE EXCEPTION 'maint:os_not_tenantless'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programacao_producao WHERE id=c_pp AND organization_id IS NULL AND ordem_servico_id=c_os) THEN RAISE EXCEPTION 'maint:programacao_link'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lotes WHERE id=c_lt AND organization_id IS NULL AND programacao_id=c_pp) THEN RAISE EXCEPTION 'maint:lote_link'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.envase WHERE id=c_ev AND lote_id=c_lt AND organization_id IS NULL) THEN RAISE EXCEPTION 'maint:envase_link'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.estoque_produto WHERE id=c_ep AND lote_id=c_lt AND envase_id=c_ev) THEN RAISE EXCEPTION 'maint:estoque_link'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entregas WHERE id=c_en AND organization_id IS NULL AND lote_id=c_lt AND ordem_servico_id=c_os
                  AND receivable_id IS NULL AND partner_order_id IS NULL AND reentrega_origem_id IS NULL
                  AND status::text <> 'cancelada' AND coalesce(comprovante_status::text,'') NOT IN ('confirmado','dispensado')) THEN
    RAISE EXCEPTION 'maint:entrega_state'; END IF;
  SELECT array_agg(id ORDER BY id) INTO v_ck FROM public.entrega_checklist WHERE entrega_id=c_en;
  IF v_ck IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(c_ck) x) THEN RAISE EXCEPTION 'maint:checklist_set'; END IF;
  -- impressão digital de CADA uma das 19 linhas (md5(to_jsonb(linha)::text), manifesto LIVE)
  FOR r IN SELECT * FROM (VALUES {{ROW_PINS}}) m(t, id, fp) LOOP
    EXECUTE format('SELECT md5(to_jsonb(x)::text) FROM public.%I x WHERE x.id = $1', r.t) INTO s USING r.id::uuid;
    IF s IS DISTINCT FROM r.fp THEN RAISE EXCEPTION 'maint:row_fingerprint_drift:%:%', r.t, r.id; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.entrega_comprovantes WHERE entrega_id=c_en) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.entrega_comprovantes x WHERE x.id=c_pr AND x.entrega_id=c_en AND x.status::text='gerado'
                     AND NOT coalesce(x.metadata ? 'comprovante_snapshot_v1', false)
                     AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(to_jsonb(x)) e WHERE (e.key LIKE '%path%' OR e.key LIKE '%arquivo%' OR e.key LIKE 'assinatura_digital%') AND e.value IS NOT NULL)) THEN
    RAISE EXCEPTION 'maint:proof_state'; END IF;
  IF (SELECT array_agg(id ORDER BY id) FROM public.estoque_movimentacoes WHERE lote_id=c_lt OR estoque_produto_id=c_ep)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(c_mv) x) THEN RAISE EXCEPTION 'maint:movement_set'; END IF;
  IF (SELECT array_agg(id) FROM public.controle_qualidade WHERE lote_id=c_lt) IS DISTINCT FROM ARRAY[c_cq] THEN RAISE EXCEPTION 'maint:quality_set'; END IF;
  IF EXISTS (SELECT 1 FROM public.entregas WHERE id<>c_en AND (lote_id=c_lt OR ordem_servico_id=c_os OR comprovante_id=c_pr)) THEN RAISE EXCEPTION 'maint:foreign_entrega'; END IF;

  -- 3. manifesto (tabela,id) e varredura FK PAREADA: só é interna a linha filha cujo par (tabela_filha,id) está no manifesto;
  --    o valor referenciado precisa estar no manifesto DA TABELA-ALVO da FK. FK composta ou alvo != id aborta.
  CREATE TEMP TABLE tc_maint_manifest(rel text NOT NULL, id uuid NOT NULL, PRIMARY KEY(rel,id)) ON COMMIT DROP;
  INSERT INTO tc_maint_manifest VALUES ('ordens_servico',c_os),('programacao_producao',c_pp),('lotes',c_lt),('envase',c_ev),
    ('estoque_produto',c_ep),('entregas',c_en),('entrega_comprovantes',c_pr),('controle_qualidade',c_cq);
  INSERT INTO tc_maint_manifest SELECT 'estoque_movimentacoes', x FROM unnest(c_mv) x;
  INSERT INTO tc_maint_manifest SELECT 'entrega_checklist', x FROM unnest(v_ck) x;
  IF (SELECT count(*) FROM tc_maint_manifest) <> 19 THEN RAISE EXCEPTION 'maint:manifest_size'; END IF;
  FOR r IN SELECT k2.conname, k2.conrelid, k2.confrelid, cardinality(k2.conkey) AS nk FROM pg_constraint k2
            WHERE k2.contype='f' AND k2.confrelid IN (SELECT ('public.'||t)::regclass FROM unnest(scope_tables) t) LOOP
    IF r.nk <> 1 THEN RAISE EXCEPTION 'maint:composite_fk_unsupported:%.%', r.conrelid::regclass, r.conname; END IF;
  END LOOP;
  FOR r IN SELECT k2.conname, k2.conrelid::regclass AS rel, cn.nspname AS cns, cc.relname AS crel, pc.relname AS prel, a.attname AS col, pa.attname AS pcol,
                  EXISTS (SELECT 1 FROM pg_attribute ia WHERE ia.attrelid=k2.conrelid AND ia.attname='id' AND NOT ia.attisdropped AND ia.atttypid='uuid'::regtype) AS child_has_id
             FROM pg_constraint k2
             JOIN pg_class cc ON cc.oid=k2.conrelid JOIN pg_namespace cn ON cn.oid=cc.relnamespace
             JOIN pg_class pc ON pc.oid=k2.confrelid
             JOIN pg_attribute a ON a.attrelid=k2.conrelid AND a.attnum=k2.conkey[1]
             JOIN pg_attribute pa ON pa.attrelid=k2.confrelid AND pa.attnum=k2.confkey[1]
            WHERE k2.contype='f' AND k2.confrelid IN (SELECT ('public.'||t)::regclass FROM unnest(scope_tables) t) LOOP
    IF r.pcol <> 'id' THEN RAISE EXCEPTION 'maint:fk_target_not_id_unsupported:%.%', r.rel, r.conname; END IF;
    v_fk_rels := array_append(v_fk_rels, quote_ident(r.cns)||'.'||quote_ident(r.crel));
    IF r.cns = 'public' AND r.child_has_id THEN
      EXECUTE format('SELECT count(*) FROM %s x WHERE x.%I IN (SELECT m.id FROM tc_maint_manifest m WHERE m.rel=$1)
                        AND NOT EXISTS (SELECT 1 FROM tc_maint_manifest m2 WHERE m2.rel=$2 AND m2.id=x.id)', r.rel, r.col)
        INTO v_n USING r.prel, r.crel;
    ELSE
      EXECUTE format('SELECT count(*) FROM %s x WHERE x.%I IN (SELECT m.id FROM tc_maint_manifest m WHERE m.rel=$1)', r.rel, r.col)
        INTO v_n USING r.prel;
    END IF;
    IF v_n > 0 THEN RAISE EXCEPTION 'maint:external_dependency:%.%=%', r.rel, r.col, v_n; END IF;
  END LOOP;

  -- 3b. invariância: impressão digital de TODAS as linhas fora do manifesto (11 tabelas + filhas por FK) e metadados
  SELECT jsonb_object_agg(rel, h) INTO v_out_before FROM (
    SELECT q.rel, platform_private.__maint_rows_digest(q.rel) AS h FROM (SELECT DISTINCT unnest(scope_tables_q || v_fk_rels) rel) q) z;
  v_meta_before := platform_private.__maint_meta_digest(scope_tables);

  -- 4. snapshot integral das 19 linhas
  SELECT jsonb_build_object(
    'checklist',(SELECT jsonb_agg(to_jsonb(x)) FROM public.entrega_checklist x WHERE x.entrega_id=c_en),
    'comprovante',(SELECT to_jsonb(x) FROM public.entrega_comprovantes x WHERE x.id=c_pr),
    'entrega',(SELECT to_jsonb(x) FROM public.entregas x WHERE x.id=c_en),
    'movimentacoes',(SELECT jsonb_agg(to_jsonb(x)) FROM public.estoque_movimentacoes x WHERE x.id=ANY(c_mv)),
    'estoque',(SELECT to_jsonb(x) FROM public.estoque_produto x WHERE x.id=c_ep),
    'envase',(SELECT to_jsonb(x) FROM public.envase x WHERE x.id=c_ev),
    'cq',(SELECT to_jsonb(x) FROM public.controle_qualidade x WHERE x.id=c_cq),
    'lote',(SELECT to_jsonb(x) FROM public.lotes x WHERE x.id=c_lt),
    'programacao',(SELECT to_jsonb(x) FROM public.programacao_producao x WHERE x.id=c_pp),
    'os',(SELECT to_jsonb(x) FROM public.ordens_servico x WHERE x.id=c_os)) INTO v_rows;
  INSERT INTO platform_private.chain_purge_maintenance_ledger(purge_key,step,detail)
  VALUES (k,'pre',jsonb_build_object('rows',v_rows,'triggers_before',v_before,'out_of_scope_digest',v_out_before,'meta_digest',v_meta_before,
          'event_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',evtname,'event',evtevent)),'[]') FROM pg_event_trigger WHERE evtenabled<>'D'),
          'default_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('ns',defaclnamespace::regnamespace::text,'type',defaclobjtype,'acl',defaclacl::text)),'[]')
                           FROM pg_default_acl WHERE defaclnamespace IN (0,'platform_private'::regnamespace)),
          'executor',jsonb_build_object('current_user',current_user,'session_user',session_user)));

  -- 5. suspensão nominal (somente os 8 gatilhos pinados; mesma transação, sob ACCESS EXCLUSIVE)
  FOREACH s IN ARRAY susp LOOP p := string_to_array(s,'|');
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', p[1], p[2]); END LOOP;

  -- 6. exclusões por ID exato, filhos primeiro; cada uma confere a contagem afetada
  DELETE FROM public.entrega_checklist WHERE id=ANY(v_ck) AND entrega_id=c_en; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>9 THEN RAISE EXCEPTION 'maint:del_checklist:%',v_n; END IF;
  -- comprovante + entrega no MESMO comando: as ações FK (SET NULL entregas.comprovante_id / checagem entrega_id) rodam
  -- ao fim do comando, quando a entrega já não existe => nenhum gatilho de UPDATE de entregas é disparado
  WITH dp AS (DELETE FROM public.entrega_comprovantes WHERE id=c_pr AND entrega_id=c_en RETURNING 1),
       de AS (DELETE FROM public.entregas WHERE id=c_en RETURNING 1)
  SELECT (SELECT count(*) FROM dp)*10 + (SELECT count(*) FROM de) INTO v_n;
  IF v_n <> 11 THEN RAISE EXCEPTION 'maint:del_proof_entrega:%', v_n; END IF;
  WHILE EXISTS (SELECT 1 FROM public.estoque_movimentacoes WHERE id=ANY(c_mv)) LOOP
    v_guard := v_guard + 1; IF v_guard > 3 THEN RAISE EXCEPTION 'maint:movement_cycle'; END IF;
    DELETE FROM public.estoque_movimentacoes m WHERE m.id=ANY(c_mv)
       AND NOT EXISTS (SELECT 1 FROM public.estoque_movimentacoes o WHERE o.movimentacao_origem_id=m.id AND o.id<>m.id);
  END LOOP;
  DELETE FROM public.estoque_produto WHERE id=c_ep; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>1 THEN RAISE EXCEPTION 'maint:del_estoque'; END IF;
  DELETE FROM public.envase WHERE id=c_ev; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>1 THEN RAISE EXCEPTION 'maint:del_envase'; END IF;
  DELETE FROM public.controle_qualidade WHERE id=c_cq; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>1 THEN RAISE EXCEPTION 'maint:del_cq'; END IF;
  DELETE FROM public.lotes WHERE id=c_lt; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>1 THEN RAISE EXCEPTION 'maint:del_lote'; END IF;
  DELETE FROM public.programacao_producao WHERE id=c_pp; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>1 THEN RAISE EXCEPTION 'maint:del_programacao'; END IF;
  DELETE FROM public.ordens_servico WHERE id=c_os; GET DIAGNOSTICS v_n=ROW_COUNT; IF v_n<>1 THEN RAISE EXCEPTION 'maint:del_os'; END IF;

  -- 7. restauração e prova antes do COMMIT
  FOREACH s IN ARRAY susp LOOP p := string_to_array(s,'|');
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', p[1], p[2]); END LOOP;
  SELECT jsonb_agg(jsonb_build_object('rel',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'foid',t.tgfoid::regprocedure::text,
         'type',t.tgtype,'def',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text, t.tgname) INTO v_after
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=ANY(scope_tables) AND NOT t.tgisinternal;
  IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'post:trigger_catalog_not_restored'; END IF;
  IF current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION 'post:replication_role'; END IF;
  SELECT (SELECT count(*) FROM public.ordens_servico WHERE id=c_os)+(SELECT count(*) FROM public.programacao_producao WHERE id=c_pp)
        +(SELECT count(*) FROM public.lotes WHERE id=c_lt)+(SELECT count(*) FROM public.envase WHERE id=c_ev)
        +(SELECT count(*) FROM public.estoque_produto WHERE id=c_ep)+(SELECT count(*) FROM public.entregas WHERE id=c_en)
        +(SELECT count(*) FROM public.entrega_comprovantes WHERE id=c_pr)+(SELECT count(*) FROM public.controle_qualidade WHERE id=c_cq)
        +(SELECT count(*) FROM public.estoque_movimentacoes WHERE id=ANY(c_mv))
        +(SELECT count(*) FROM public.entrega_checklist WHERE id=ANY(v_ck)) INTO v_present;
  IF v_present <> 0 THEN RAISE EXCEPTION 'post:rows_remaining:%', v_present; END IF;
  SELECT jsonb_object_agg(rel, h) INTO v_out_after FROM (
    SELECT q.rel, platform_private.__maint_rows_digest(q.rel) AS h FROM (SELECT DISTINCT unnest(scope_tables_q || v_fk_rels) rel) q) z;
  IF v_out_after IS DISTINCT FROM v_out_before THEN RAISE EXCEPTION 'post:out_of_scope_rows_changed'; END IF;
  v_meta_after := platform_private.__maint_meta_digest(scope_tables);
  IF v_meta_after IS DISTINCT FROM v_meta_before THEN RAISE EXCEPTION 'post:functions_acl_policies_changed'; END IF;
  INSERT INTO platform_private.chain_purge_maintenance_ledger(purge_key,step,detail)
  VALUES (k,'committed',jsonb_build_object('deleted',19,'triggers_restored',true,'out_of_scope_invariant',true,'meta_invariant',true));
END $maint$;
DROP FUNCTION platform_private.__maint_rows_digest(text);
DROP FUNCTION platform_private.__maint_meta_digest(text[]);
DO $z$ BEGIN
  IF to_regprocedure('platform_private.__maint_rows_digest(text)') IS NOT NULL OR to_regprocedure('platform_private.__maint_meta_digest(text[])') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled <> 'O'
                   AND c.relname IN ('entrega_checklist','entrega_comprovantes','entrega_termos','entregas','estoque_movimentacoes',
                     'estoque_produto','envase','controle_qualidade','lotes','programacao_producao','ordens_servico')) THEN
    RAISE EXCEPTION 'post:helpers_or_triggers_not_restored'; END IF;
END $z$;
COMMIT;
