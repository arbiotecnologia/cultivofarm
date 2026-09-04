-- H7O — Harness por perfil (transação descartada; nada persiste).
-- Pressupõe as quatro migrations H7O aplicadas (ou concatenadas antes deste arquivo, dentro da mesma transação).
-- Simula um usuário real de cada papel (JWT sub = user_id de public.user_roles) e mede:
--   (P1) guardas 42501 nas 8 funções sensíveis + preservação de cron (auth.uid() NULL) e trigger (pg_trigger_depth>0);
--   (P2) helpers revogados (chamada direta → 42501) e fluxo público que os usa internamente continua funcionando;
--        communication_provider_settings sem grant (→ 42501);
--   (P3) rate-limit anon de rpc_validar_comprovante_entrega (token/origem), anti-enumeração e tabelas privadas inacessíveis;
--   (P4) security_invoker=true nas 5 views (catálogo) + anon negado;
--   (X)  acesso cruzado: cada papel só recebe o que src/lib/permissions.ts prevê.
-- Executar via restoration/os-e2e/staging-psql.sh -f <este arquivo>.
\set ON_ERROR_STOP on
begin;

create temp table _h7o_res(papel text, verificacao text, resultado text, esperado text, veredito text);
grant all on _h7o_res to public;

do $$
declare
  r record;
  v_uid uuid;
  v_out text;
  v_json jsonb;
  v_role text;
  v_i int;
  v_first_block int;
  v_calls int;
  v_msg_blocked_random text;
  v_msg_blocked_real text;
  v_real_token uuid;
  v_np uuid := null;
  -- papéis autorizados (espelha src/lib/permissions.ts e os helpers is_financial_staff / is_operational_staff)
  fin_ok    text[] := array['administrador','gestor','financeiro'];
  op_ok     text[] := array['administrador','gestor','administrativo','consultor_tecnico','tecnico_agronomo','aplicador','producao','operador_onfarm'];
  aging_ok  text[] := array['administrador','gestor','financeiro','gestor_comercial','administrativo'];
  v_roles text[];
  v_origin_calls int := 0;
  is_fin boolean; is_op boolean; is_aging boolean; is_cli_scope boolean;
begin
  -- ===================== catálogo (independe de papel) =====================
  select string_agg(c.relname, ',') into v_out
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
     and not exists (select 1 from unnest(coalesce(c.reloptions,'{}'::text[])) o where lower(o) in ('security_invoker=true','security_invoker=on'));
  insert into _h7o_res values ('catálogo','P4 5 views security_invoker=true', coalesce('faltando: '||v_out,'todas invoker'), 'todas invoker', case when v_out is null then 'PASS' else 'FAIL' end);

  select count(*) into v_i from pg_proc p
   where p.oid in ('public.fn_generate_recurring_title(uuid,date,boolean)'::regprocedure,'public.recalc_partner_risk_score(uuid)'::regprocedure,
                   'public.check_cliente_dependencies(uuid)'::regprocedure,'public.check_fazenda_dependencies(uuid)'::regprocedure,
                   'public.check_talhao_dependencies(uuid)'::regprocedure,'public.rpc_validar_integridade_esteira(text,uuid)'::regprocedure,
                   'public.rpc_b2b_aging(uuid)'::regprocedure,'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure)
     and p.prosecdef and p.prosrc like '%42501%' and not has_function_privilege('anon', p.oid, 'EXECUTE');
  insert into _h7o_res values ('catálogo','P1 8 funções DEFINER com guarda 42501 e sem anon', v_i::text, '8', case when v_i = 8 then 'PASS' else 'FAIL' end);

  select count(*) into v_i from pg_proc p
   where p.oid = 'public.rpc_validar_integridade_esteira(uuid,text,text)'::regprocedure and p.prosrc not like '%H7O%';
  insert into _h7o_res values ('catálogo','P1 overload (uuid,text,text) intocada', v_i::text, '1', case when v_i = 1 then 'PASS' else 'FAIL' end);

  select count(*) into v_i from (values
    ('public._assert_visita_editavel(uuid)'),('public._comunicacao_require_admin()'),
    ('public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)'),('public.can_checkin_technical_visit(uuid,uuid)'),
    ('public.can_user_access_cliente(uuid,uuid)'),('public.can_view_bi_operacional(uuid)'),('public.fn_cockpit_assert_operador()'),
    ('public.fn_entrega_assert_confirmador(text)'),('public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)'),
    ('public.fn_estoque_pode_operar(uuid,text)'),('public.generate_production_orders_from_partner(uuid)'),
    ('public.get_b2b_user_role_for_partner(uuid,uuid)'),('public.is_operational_staff(uuid)'),('public.is_valid_b2b_partner_user(uuid,uuid)'),
    ('public.is_visit_org_manager(uuid,uuid)'),('public.log_report_view(text,jsonb)'),('public.rpc_gerar_alertas_operacionais()'),
    ('public.rpc_recalcular_prioridade_alerta(uuid)'),('public.rpc_substituir_etiqueta_produto(uuid,text)')) s(sig)
   where not has_function_privilege('authenticated', s.sig, 'EXECUTE') and not has_function_privilege('anon', s.sig, 'EXECUTE');
  insert into _h7o_res values ('catálogo','P2 19 assinaturas sem EXECUTE authenticated/anon', v_i::text, '19', case when v_i = 19 then 'PASS' else 'FAIL' end);

  insert into _h7o_res values ('catálogo','P2 rpc_regulatory_sod_override preservada (entrada admin)',
    case when has_function_privilege('authenticated','public.rpc_regulatory_sod_override(uuid,text)','EXECUTE') then 'executável' else 'revogada' end,
    'executável', case when has_function_privilege('authenticated','public.rpc_regulatory_sod_override(uuid,text)','EXECUTE') then 'PASS' else 'FAIL' end);

  select count(*) into v_i from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname in ('public_validation_rate_pepper','public_validation_rate_policy','public_validation_rate_counters')
     and c.relrowsecurity
     and not has_table_privilege('anon', c.oid, 'SELECT') and not has_table_privilege('authenticated', c.oid, 'SELECT')
     and not has_table_privilege('anon', c.oid, 'INSERT') and not has_table_privilege('authenticated', c.oid, 'INSERT');
  insert into _h7o_res values ('catálogo','P3 3 tabelas private com RLS e sem grants app', v_i::text, '3', case when v_i = 3 then 'PASS' else 'FAIL' end);

  select count(*) into v_i from pg_extension e where e.extname = 'pg_cron';
  if v_i = 1 then
    execute $q$select count(*) from cron.job where jobname = 'h7o-prune-public-validation-rate-limit'$q$ into v_i;
    insert into _h7o_res values ('catálogo','P3 job de poda agendado', v_i::text, '1', case when v_i = 1 then 'PASS' else 'FAIL' end);
    execute $q$select count(*) from cron.job where jobname = 'recurring-financial-daily'$q$ into v_i;
    insert into _h7o_res values ('catálogo','P1 cron recurring-financial-daily preservado', v_i::text, '1', case when v_i = 1 then 'PASS' else 'FAIL' end);
  else
    insert into _h7o_res values ('catálogo','P3 job de poda agendado', 'pg_cron ausente', '1', 'INFO');
  end if;

  select count(*) into v_i from pg_trigger where tgname = 'trg_recalc_risk_on_ar_change' and tgenabled <> 'D';
  insert into _h7o_res values ('catálogo','P1 trigger trg_recalc_risk_on_ar_change preservado', v_i::text, '1', case when v_i = 1 then 'PASS' else 'FAIL' end);

  insert into _h7o_res values ('catálogo','P2 communication_provider_settings sem grant anon/authenticated',
    case when has_table_privilege('anon','public.communication_provider_settings','SELECT') or has_table_privilege('authenticated','public.communication_provider_settings','SELECT') then 'grant presente' else 'sem grant' end,
    'sem grant', case when has_table_privilege('anon','public.communication_provider_settings','SELECT') or has_table_privilege('authenticated','public.communication_provider_settings','SELECT') then 'FAIL' else 'PASS' end);

  -- ===================== sessão interna (cron): auth.uid() IS NULL =====================
  begin
    perform public.fn_generate_recurring_title(gen_random_uuid(), current_date, false);
    insert into _h7o_res values ('interno/cron','fn_generate_recurring_title (auth.uid() NULL)','executou','≠42501','PASS');
  exception when others then
    insert into _h7o_res values ('interno/cron','fn_generate_recurring_title (auth.uid() NULL)','SQLSTATE '||sqlstate,'≠42501', case when sqlstate = '42501' then 'FAIL' else 'PASS' end);
  end;

  -- ===================== trigger: pg_trigger_depth() > 0 com usuário NÃO financeiro =====================
  select user_id into v_uid from public.user_roles where role::text = 'cliente_produtor' order by user_id limit 1;
  create temp table _h7o_trg(x int);
  create function pg_temp._h7o_trg_fn() returns trigger language plpgsql as $t$
    begin perform public.recalc_partner_risk_score(gen_random_uuid()); return new; end $t$;
  create trigger _h7o_trg after insert on _h7o_trg for each row execute function pg_temp._h7o_trg_fn();
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  begin
    insert into _h7o_trg values (1);
    insert into _h7o_res values ('interno/trigger','recalc_partner_risk_score via trigger (uid não financeiro)','executou','≠42501','PASS');
  exception when others then
    insert into _h7o_res values ('interno/trigger','recalc_partner_risk_score via trigger (uid não financeiro)','SQLSTATE '||sqlstate,'≠42501', case when sqlstate = '42501' then 'FAIL' else 'PASS' end);
  end;
  perform set_config('request.jwt.claims', '', true);

  -- ===================== por papel =====================
  for r in
    select distinct on (role::text) role::text as papel, user_id
    from public.user_roles
    where role::text in ('administrador','gestor','financeiro','gestor_comercial','administrativo','producao',
                         'consultor_tecnico','tecnico_agronomo','aplicador','operador_onfarm',
                         'cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico')
    order by role::text, user_id
  loop
    v_role := r.papel; v_uid := r.user_id;
    select array_agg(ur.role::text order by ur.role::text) into v_roles from public.user_roles ur where ur.user_id = v_uid;
    v_role := r.papel || case when array_length(v_roles,1) > 1 then ' (+'||array_to_string(array_remove(v_roles, r.papel), ',')||')' else '' end;
    is_fin := v_roles && fin_ok; is_op := v_roles && op_ok; is_aging := v_roles && aging_ok;
    -- can_user_access_cliente(uid, qualquer) é TRUE para administrador/gestor/gestor_comercial (escopo total de clientes; /clientes rw em permissions.ts)
    is_cli_scope := is_op or (v_roles && array['gestor_comercial']);
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- P1 (financeiro)
    begin perform public.fn_generate_recurring_title(gen_random_uuid(), current_date, true);
      insert into _h7o_res values (v_role,'P1 fn_generate_recurring_title','executou', case when is_fin then '≠42501' else '42501' end, case when is_fin then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 fn_generate_recurring_title','SQLSTATE '||sqlstate, case when is_fin then '≠42501' else '42501' end,
        case when (is_fin) = (sqlstate <> '42501') then 'PASS' else 'FAIL' end); end;
    begin perform public.recalc_partner_risk_score(gen_random_uuid());
      insert into _h7o_res values (v_role,'P1 recalc_partner_risk_score','executou', case when is_fin then '≠42501' else '42501' end, case when is_fin then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 recalc_partner_risk_score','SQLSTATE '||sqlstate, case when is_fin then '≠42501' else '42501' end,
        case when (is_fin) = (sqlstate <> '42501') then 'PASS' else 'FAIL' end); end;

    -- P1 (operacional / escopo)
    begin select public.check_cliente_dependencies(gen_random_uuid()) into v_json;
      insert into _h7o_res values (v_role,'P1 check_cliente_dependencies','json '||coalesce(left(v_json::text,40),'null'), case when is_cli_scope then 'sucesso' else '42501' end, case when is_cli_scope then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 check_cliente_dependencies','SQLSTATE '||sqlstate, case when is_cli_scope then 'sucesso' else '42501' end,
        case when sqlstate = '42501' and not (is_cli_scope) then 'PASS' else 'FAIL' end); end;
    begin select public.check_fazenda_dependencies(gen_random_uuid()) into v_json;
      insert into _h7o_res values (v_role,'P1 check_fazenda_dependencies','json', case when is_op then 'sucesso' else '42501' end, case when is_op then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 check_fazenda_dependencies','SQLSTATE '||sqlstate, case when is_op then 'sucesso' else '42501' end,
        case when sqlstate = '42501' and not (is_op) then 'PASS' else 'FAIL' end); end;
    begin select public.check_talhao_dependencies(gen_random_uuid()) into v_json;
      insert into _h7o_res values (v_role,'P1 check_talhao_dependencies','json', case when is_op then 'sucesso' else '42501' end, case when is_op then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 check_talhao_dependencies','SQLSTATE '||sqlstate, case when is_op then 'sucesso' else '42501' end,
        case when sqlstate = '42501' and not (is_op) then 'PASS' else 'FAIL' end); end;
    begin select public.rpc_validar_integridade_esteira('os_padrao', gen_random_uuid()) into v_json;
      insert into _h7o_res values (v_role,'P1 rpc_validar_integridade_esteira(text,uuid)','json', case when is_op then '≠42501' else '42501' end, case when is_op then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 rpc_validar_integridade_esteira(text,uuid)','SQLSTATE '||sqlstate, case when is_op then '≠42501' else '42501' end,
        case when (is_op) = (sqlstate <> '42501') then 'PASS' else 'FAIL' end); end;

    -- P1 (B2B financeiro: agora 42501 em vez de 0 linhas)
    begin execute 'select count(*) from public.rpc_b2b_aging(null)' into v_out;
      insert into _h7o_res values (v_role,'P1 rpc_b2b_aging(null) [plpgsql, RAISE]','rows='||v_out, case when is_aging then 'sucesso' else '42501' end, case when is_aging then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 rpc_b2b_aging(null) [plpgsql, RAISE]','SQLSTATE '||sqlstate, case when is_aging then 'sucesso' else '42501' end,
        case when sqlstate = '42501' and not (is_aging) then 'PASS' else 'FAIL' end); end;
    begin execute 'select count(*) from public.rpc_b2b_partner_profitability(current_date - 30, current_date, null)' into v_out;
      insert into _h7o_res values (v_role,'P1 rpc_b2b_partner_profitability [plpgsql, RAISE]','rows='||v_out, case when is_aging then 'sucesso' else '42501' end, case when is_aging then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'P1 rpc_b2b_partner_profitability [plpgsql, RAISE]','SQLSTATE '||sqlstate, case when is_aging then 'sucesso' else '42501' end,
        case when sqlstate = '42501' and not (is_aging) then 'PASS' else 'FAIL' end); end;
    -- regressão H7N: rpc_b2b_aging_detalhado inalterada
    begin execute 'select count(*) from public.rpc_b2b_aging_detalhado()' into v_out;
      insert into _h7o_res values (v_role,'H7N rpc_b2b_aging_detalhado() (regressão)','rows='||v_out, case when is_aging then 'sucesso' else '42501' end, case when is_aging then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _h7o_res values (v_role,'H7N rpc_b2b_aging_detalhado() (regressão)','SQLSTATE '||sqlstate, case when is_aging then 'sucesso' else '42501' end,
        case when sqlstate = '42501' and not (is_aging) then 'PASS' else 'FAIL' end); end;

    -- P2: helpers revogados — chamada direta deve falhar com 42501 para TODOS os papéis
    begin execute format('select public.is_operational_staff(%L::uuid)', v_uid) into v_out;
      insert into _h7o_res values (v_role,'P2 helper is_operational_staff (direto)','executou','42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P2 helper is_operational_staff (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute format('select public.can_user_access_cliente(%L::uuid, gen_random_uuid())', v_uid) into v_out;
      insert into _h7o_res values (v_role,'P2 helper can_user_access_cliente(uuid,uuid) (direto)','executou','42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P2 helper can_user_access_cliente(uuid,uuid) (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute 'select public.fn_cockpit_assert_operador()' into v_out;
      insert into _h7o_res values (v_role,'P2 helper fn_cockpit_assert_operador (direto)','executou','42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P2 helper fn_cockpit_assert_operador (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute 'select public.rpc_substituir_etiqueta_produto(gen_random_uuid(), ''h7o'')' into v_out;
      insert into _h7o_res values (v_role,'P2 rpc_substituir_etiqueta_produto (direto)','executou','42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P2 rpc_substituir_etiqueta_produto (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute 'select public.rpc_gerar_alertas_operacionais()' into v_out;
      insert into _h7o_res values (v_role,'P2 rpc_gerar_alertas_operacionais (direto)','executou','42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P2 rpc_gerar_alertas_operacionais (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    -- P2: fluxo público que usa helper revogado internamente (DEFINER→owner) continua OK
    begin execute 'select public.can_user_access_cliente(gen_random_uuid())' into v_out;
      insert into _h7o_res values (v_role,'P2 overload pública can_user_access_cliente(uuid) preservada','executou ('||v_out||')','sucesso','PASS');
    exception when others then insert into _h7o_res values (v_role,'P2 overload pública can_user_access_cliente(uuid) preservada','SQLSTATE '||sqlstate,'sucesso','FAIL'); end;

    -- P2: tabela de configurações de provedores sem grant
    begin execute 'select count(*) from public.communication_provider_settings' into v_out;
      insert into _h7o_res values (v_role,'P2 communication_provider_settings (select)','rows='||v_out,'42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P2 communication_provider_settings (select)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;

    -- P3: tabelas privadas inacessíveis; RPC pública continua respondendo a authenticated
    begin execute 'select count(*) from private.public_validation_rate_counters' into v_out;
      insert into _h7o_res values (v_role,'P3 private.public_validation_rate_counters (select)','rows='||v_out,'42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P3 private.public_validation_rate_counters (select)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute 'select private.fn_public_validation_rate_check(gen_random_uuid())' into v_out;
      insert into _h7o_res values (v_role,'P3 private.fn_public_validation_rate_check (direto)','executou','42501','FAIL');
    exception when others then insert into _h7o_res values (v_role,'P3 private.fn_public_validation_rate_check (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    v_origin_calls := v_origin_calls + 1;
    begin select public.rpc_validar_comprovante_entrega(gen_random_uuid()) into v_json;
      insert into _h7o_res values (v_role,'P3 rpc_validar_comprovante_entrega (1ª chamada)', case when v_json ? 'retry_after_seconds' then 'limitado' else 'resposta normal' end,'resposta normal', case when v_json ? 'retry_after_seconds' then 'FAIL' else 'PASS' end);
    exception when others then insert into _h7o_res values (v_role,'P3 rpc_validar_comprovante_entrega (1ª chamada)','SQLSTATE '||sqlstate,'resposta normal','FAIL'); end;

    -- P4: views legíveis por authenticated (invoker) — regressão H7N
    begin execute 'select count(*) from public.vw_catalogo_ficha_produtos' into v_out;
      insert into _h7o_res values (v_role,'P4 vw_catalogo_ficha_produtos','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7o_res values (v_role,'P4 vw_catalogo_ficha_produtos','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;
    begin execute 'select count(*) from public.vw_esteira_laboratorio' into v_out;
      insert into _h7o_res values (v_role,'P4 vw_esteira_laboratorio','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7o_res values (v_role,'P4 vw_esteira_laboratorio','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  end loop;

  -- ===================== anon =====================
  -- token real (se existir) lido ANTES de assumir anon, para o teste de anti-enumeração
  select ec.validation_token into v_real_token from public.entrega_comprovantes ec where ec.validation_token is not null and ec.validation_public_enabled limit 1;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);

  -- helpers/RPCs guardadas negadas ao anon
  begin execute 'select public.fn_generate_recurring_title(gen_random_uuid(), current_date, true)' into v_out;
    insert into _h7o_res values ('anon','P1 fn_generate_recurring_title','executou','42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P1 fn_generate_recurring_title','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from public.rpc_b2b_aging(null)' into v_out;
    insert into _h7o_res values ('anon','P1 rpc_b2b_aging','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P1 rpc_b2b_aging','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select public.check_cliente_dependencies(gen_random_uuid())' into v_out;
    insert into _h7o_res values ('anon','P1 check_cliente_dependencies','executou','42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P1 check_cliente_dependencies','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select public.is_operational_staff(gen_random_uuid())' into v_out;
    insert into _h7o_res values ('anon','P2 helper is_operational_staff (direto)','executou','42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P2 helper is_operational_staff (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from public.communication_provider_settings' into v_out;
    insert into _h7o_res values ('anon','P2 communication_provider_settings (select)','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P2 communication_provider_settings (select)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from private.public_validation_rate_counters' into v_out;
    insert into _h7o_res values ('anon','P3 private.public_validation_rate_counters (select)','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P3 private.public_validation_rate_counters (select)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from public.vw_catalogo_ficha_produtos' into v_out;
    insert into _h7o_res values ('anon','P4 vw_catalogo_ficha_produtos','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7o_res values ('anon','P4 vw_catalogo_ficha_produtos','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;

  -- P3: rate-limit por TOKEN (mesmo token aleatório repetido): política token = 10/60s → bloqueio na 11ª chamada
  v_uid := gen_random_uuid(); v_first_block := null; v_calls := 0;
  for v_i in 1..12 loop
    v_calls := v_calls + 1; v_origin_calls := v_origin_calls + 1;
    select public.rpc_validar_comprovante_entrega(v_uid) into v_json;
    if v_json ? 'retry_after_seconds' and v_first_block is null then v_first_block := v_i; v_msg_blocked_random := v_json->>'mensagem'; end if;
  end loop;
  insert into _h7o_res values ('anon','P3 rate-limit por token: 1º bloqueio na chamada nº', coalesce(v_first_block::text,'nenhum'), '11', case when v_first_block = 11 then 'PASS' else 'FAIL' end);
  insert into _h7o_res values ('anon','P3 resposta limitada: valido=false + retry_after_seconds>0',
    coalesce((v_json->>'valido')||' / '||(v_json->>'retry_after_seconds'),'n/a'), 'false / >0',
    case when (v_json->>'valido')='false' and (v_json->>'retry_after_seconds')::int > 0 then 'PASS' else 'FAIL' end);
  insert into _h7o_res values ('anon','P3 resposta limitada não vaza campos do comprovante',
    case when v_json ?| array['status','numero_formulario','validation_hash','data_confirmacao'] then 'vazou' else 'mínima' end, 'mínima',
    case when v_json ?| array['status','numero_formulario','validation_hash','data_confirmacao'] then 'FAIL' else 'PASS' end);

  -- P3: rate-limit por ORIGEM (tokens distintos): política origem = 30/60s → bloqueio na 31ª chamada da sessão
  v_first_block := null;
  for v_i in 1..40 loop
    exit when v_first_block is not null;
    v_calls := v_calls + 1; v_origin_calls := v_origin_calls + 1;
    select public.rpc_validar_comprovante_entrega(gen_random_uuid()) into v_json;
    if v_json ? 'retry_after_seconds' then v_first_block := v_origin_calls; end if;
  end loop;
  -- a origem é a mesma ('unknown' sem request.headers) para TODAS as chamadas da sessão (papéis + anon): política origem = 30/60s
  insert into _h7o_res values ('anon','P3 rate-limit por origem: 1º bloqueio na chamada nº (sessão, todas as origens iguais)', coalesce(v_first_block::text,'nenhum'), '31', case when v_first_block = 31 then 'PASS' else 'FAIL' end);

  -- P3: anti-enumeração — sob bloqueio de origem, token REAL e token aleatório recebem exatamente a mesma resposta
  if v_real_token is not null then
    select public.rpc_validar_comprovante_entrega(v_real_token) into v_json;
    v_msg_blocked_real := v_json::text;
    select public.rpc_validar_comprovante_entrega(gen_random_uuid()) into v_json;
    insert into _h7o_res values ('anon','P3 anti-enumeração sob bloqueio (token real == token aleatório)',
      case when v_msg_blocked_real = v_json::text then 'idênticas' else 'diferentes' end, 'idênticas',
      case when v_msg_blocked_real = v_json::text then 'PASS' else 'FAIL' end);
  else
    insert into _h7o_res values ('anon','P3 anti-enumeração sob bloqueio (token real == token aleatório)','sem comprovante público no staging','idênticas','INFO');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- P3: contadores armazenam apenas hashes (nenhum token em claro)
  select count(*) into v_i from private.public_validation_rate_counters c where octet_length(c.bucket_hash) <> 32;
  insert into _h7o_res values ('catálogo','P3 contadores apenas HMAC-SHA256 (32 bytes)', v_i::text||' fora do padrão', '0', case when v_i = 0 then 'PASS' else 'FAIL' end);
  select count(*) into v_i from private.public_validation_rate_counters c where c.blocked > 0;
  insert into _h7o_res values ('catálogo','P3 auditoria agregada: buckets com blocked>0', v_i::text, '>=2', case when v_i >= 2 then 'PASS' else 'FAIL' end);
  select private.fn_public_validation_rate_prune(interval '0 seconds') into v_i;
  insert into _h7o_res values ('catálogo','P3 poda executa (linhas removidas)', v_i::text, '>=1', case when v_i >= 1 then 'PASS' else 'FAIL' end);
end $$;

\echo == H7O HARNESS POR PERFIL (staging, transação descartada)
select papel, verificacao, resultado, esperado, veredito from _h7o_res order by papel, verificacao;
\echo == RESUMO
select veredito, count(*) from _h7o_res group by 1 order by 1;
\echo == FALHAS
select papel, verificacao, resultado, esperado from _h7o_res where veredito = 'FAIL' order by 1,2;

rollback;
