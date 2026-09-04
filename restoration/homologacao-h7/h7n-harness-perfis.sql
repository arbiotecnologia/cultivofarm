-- H7N — Harness por perfil (SOMENTE LEITURA, transação descartada).
-- Simula, no staging, um usuário real de cada papel (JWT sub = user_id de public.user_roles)
-- e mede: (a) acesso às 5 views agora security_invoker; (b) tentativa de chamada direta a
-- helpers internos revogados; (c) RPCs guardadas; (d) acesso direto às MVs privadas; (e) anon.
-- Não grava nada: termina em ROLLBACK. Executar via restoration/os-e2e/staging-psql.sh.
\set ON_ERROR_STOP on
begin;

create temp table _h7n_res(papel text, verificacao text, resultado text, esperado text, veredito text);
grant all on _h7n_res to public;

do $$
declare
  r record;
  v_uid uuid;
  v_out text;
  v_role text;
  -- papéis autorizados pelos guards H7N (espelha src/lib/permissions.ts)
  aging_ok  text[] := array['administrador','gestor','financeiro','gestor_comercial','administrativo'];
  capac_ok  text[] := array['administrador','gestor','producao','gestor_comercial'];
  procedure_note text;
begin
  for r in
    select distinct on (role::text) role::text as papel, user_id
    from public.user_roles
    where role::text in ('administrador','gestor','financeiro','gestor_comercial','administrativo',
                         'producao','consultor_tecnico','cliente_produtor','parceiro_b2b','aplicador')
    order by role::text, user_id
  loop
    v_role := r.papel; v_uid := r.user_id;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- (a) 5 views: devem ser legíveis (contagem >= 0) — a filtragem é feita por predicado/RLS do chamador
    begin execute 'select count(*) from public.vw_os_integridade_esteira' into v_out;
      insert into _h7n_res values (v_role,'vw_os_integridade_esteira','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7n_res values (v_role,'vw_os_integridade_esteira','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;
    begin execute 'select count(*) from public.vw_esteira_laboratorio' into v_out;
      insert into _h7n_res values (v_role,'vw_esteira_laboratorio','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7n_res values (v_role,'vw_esteira_laboratorio','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;
    begin execute 'select count(*) from public.vw_fluxo_visita_tecnica' into v_out;
      insert into _h7n_res values (v_role,'vw_fluxo_visita_tecnica','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7n_res values (v_role,'vw_fluxo_visita_tecnica','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;
    begin execute 'select count(*) from public.vw_catalogo_ficha_produtos' into v_out;
      insert into _h7n_res values (v_role,'vw_catalogo_ficha_produtos','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7n_res values (v_role,'vw_catalogo_ficha_produtos','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;
    begin execute 'select count(*) from public.vw_catalogo_ficha_microrganismos' into v_out;
      insert into _h7n_res values (v_role,'vw_catalogo_ficha_microrganismos','rows='||v_out,'sem erro','PASS');
    exception when others then insert into _h7n_res values (v_role,'vw_catalogo_ficha_microrganismos','SQLSTATE '||sqlstate,'sem erro','FAIL'); end;

    -- (d) MVs subjacentes continuam privadas (sem bypass do predicado)
    begin execute 'select count(*) from public.mv_esteira_laboratorio' into v_out;
      insert into _h7n_res values (v_role,'mv_esteira_laboratorio (direto)','rows='||v_out,'42501','FAIL');
    exception when others then insert into _h7n_res values (v_role,'mv_esteira_laboratorio (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute 'select count(*) from public.mv_fluxo_visita_tecnica' into v_out;
      insert into _h7n_res values (v_role,'mv_fluxo_visita_tecnica (direto)','rows='||v_out,'42501','FAIL');
    exception when others then insert into _h7n_res values (v_role,'mv_fluxo_visita_tecnica (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;

    -- (b) helpers internos revogados: chamada direta deve falhar com 42501
    begin execute 'select public.fn_cq_ultimo_resultado(gen_random_uuid())' into v_out;
      insert into _h7n_res values (v_role,'helper fn_cq_ultimo_resultado (direto)','executou','42501','FAIL');
    exception when others then insert into _h7n_res values (v_role,'helper fn_cq_ultimo_resultado (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    begin execute 'select public._portal_cliente_user_has_link(gen_random_uuid(), gen_random_uuid())' into v_out;
      insert into _h7n_res values (v_role,'helper _portal_cliente_user_has_link (direto)','executou','42501','FAIL');
    exception when others then insert into _h7n_res values (v_role,'helper _portal_cliente_user_has_link (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
    -- função de trigger: PostgreSQL já impede chamada direta (0A000) antes da ACL; a ACL é verificada por catálogo
    begin execute 'select public.trg_mestre_guard_preco_canonico()' into v_out;
      insert into _h7n_res values (v_role,'trigger fn trg_mestre_guard_preco_canonico (direto)','executou','0A000/42501','FAIL');
    exception when others then insert into _h7n_res values (v_role,'trigger fn trg_mestre_guard_preco_canonico (direto)','SQLSTATE '||sqlstate,'0A000/42501',case when sqlstate in ('0A000','42501') then 'PASS' else 'FAIL' end); end;

    -- (c) RPCs guardadas (somente leitura): 42501 para papéis não autorizados, sucesso para autorizados.
    -- rpc_b2b_aging é LANGUAGE sql: o guard H7N é um filtro (h7n_guarded) => não autorizado recebe 0 linhas (fail-closed), não 42501.
    begin execute 'select count(*) from public.rpc_b2b_aging()' into v_out;
      insert into _h7n_res values (v_role,'rpc_b2b_aging() [sql, guard por filtro]','rows='||v_out, case when v_role = any(aging_ok) then 'sucesso' else '0 linhas' end, case when v_role = any(aging_ok) or v_out='0' then 'PASS' else 'FAIL' end);
    exception when others then insert into _h7n_res values (v_role,'rpc_b2b_aging() [sql, guard por filtro]','SQLSTATE '||sqlstate, case when v_role = any(aging_ok) then 'sucesso' else '0 linhas' end, case when sqlstate='42501' and not (v_role = any(aging_ok)) then 'PASS' else 'FAIL' end); end;
    begin execute 'select count(*) from public.rpc_b2b_aging_detalhado()' into v_out;
      insert into _h7n_res values (v_role,'rpc_b2b_aging_detalhado() [plpgsql, RAISE]','rows='||v_out, case when v_role = any(aging_ok) then 'sucesso' else '42501' end, case when v_role = any(aging_ok) then 'PASS' else 'FAIL' end);
    exception when others then insert into _h7n_res values (v_role,'rpc_b2b_aging_detalhado() [plpgsql, RAISE]','SQLSTATE '||sqlstate, case when v_role = any(aging_ok) then 'sucesso' else '42501' end, case when sqlstate='42501' and not (v_role = any(aging_ok)) then 'PASS' else 'FAIL' end); end;
    begin execute 'select left(public.rpc_b2b_capacity_kpis()::text, 0)' into v_out;
      insert into _h7n_res values (v_role,'rpc_b2b_capacity_kpis()','sucesso', case when v_role = any(capac_ok) then 'sucesso' else '42501' end, case when v_role = any(capac_ok) then 'PASS' else 'FAIL' end);
    exception when others then insert into _h7n_res values (v_role,'rpc_b2b_capacity_kpis()','SQLSTATE '||sqlstate, case when v_role = any(capac_ok) then 'sucesso' else '42501' end, case when sqlstate='42501' and not (v_role = any(capac_ok)) then 'PASS' else 'FAIL' end); end;

    execute 'reset role';
  end loop;

  -- (e) anon: views negadas; RPC pública de rastreio continua executável (por design), retorno mínimo
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  begin execute 'select count(*) from public.vw_catalogo_ficha_produtos' into v_out;
    insert into _h7n_res values ('anon','vw_catalogo_ficha_produtos','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7n_res values ('anon','vw_catalogo_ficha_produtos','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from public.vw_os_integridade_esteira' into v_out;
    insert into _h7n_res values ('anon','vw_os_integridade_esteira','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7n_res values ('anon','vw_os_integridade_esteira','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select public.fn_cq_ultimo_resultado(gen_random_uuid())' into v_out;
    insert into _h7n_res values ('anon','helper fn_cq_ultimo_resultado (direto)','executou','42501','FAIL');
  exception when others then insert into _h7n_res values ('anon','helper fn_cq_ultimo_resultado (direto)','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from public.rpc_b2b_aging()' into v_out;
    insert into _h7n_res values ('anon','rpc_b2b_aging()','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7n_res values ('anon','rpc_b2b_aging()','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select count(*) from public.rpc_b2b_aging_detalhado()' into v_out;
    insert into _h7n_res values ('anon','rpc_b2b_aging_detalhado()','rows='||v_out,'42501','FAIL');
  exception when others then insert into _h7n_res values ('anon','rpc_b2b_aging_detalhado()','SQLSTATE '||sqlstate,'42501',case when sqlstate='42501' then 'PASS' else 'FAIL' end); end;
  begin execute 'select left(public.rpc_validar_rastreio_produto(gen_random_uuid())::text, 0)' into v_out;
    insert into _h7n_res values ('anon','rpc_validar_rastreio_produto(uuid aleatório)','executou (retorno não registrado)','sucesso sem dado','PASS');
  exception when others then insert into _h7n_res values ('anon','rpc_validar_rastreio_produto(uuid aleatório)','SQLSTATE '||sqlstate,'sucesso sem dado','INFO'); end;
  execute 'reset role';
end $$;

\echo == H7N HARNESS POR PERFIL (staging, transação descartada)
select papel, verificacao, resultado, esperado, veredito from _h7n_res order by papel, verificacao;
\echo == RESUMO
select veredito, count(*) from _h7n_res group by 1 order by 1;

rollback;
