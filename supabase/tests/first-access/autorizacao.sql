-- ============================================================
-- Testes server-side (autorização negativa) — primeiro acesso
-- Executar apenas em ambiente de teste, com autorização do proprietário.
-- Não cria usuários; usa exceções esperadas como asserção.
-- ============================================================

-- 1) Cliente autenticado NÃO pode concluir o primeiro acesso pela RPC server-side.
do $$
begin
  begin
    -- Forçando contexto não-service_role: em uma sessão autenticada real, o
    -- PostgREST define request.jwt.claim.role = 'authenticated' e a chamada
    -- abaixo DEVE falhar com platform_forbidden.
    perform public.platform_conclude_provisional_password_server(gen_random_uuid());
    raise exception 'FALHOU: RPC server-side aceitou chamada sem service_role';
  exception when insufficient_privilege then
    null; -- esperado
  when others then
    if sqlerrm like 'platform_forbidden%' then null; else raise; end if;
  end;
end $$;

-- 2) Cliente autenticado NÃO pode ler a verificação de pendência.
do $$
begin
  begin
    perform public.platform_first_access_pending(gen_random_uuid());
    raise exception 'FALHOU: verificação de pendência aceitou chamada sem service_role';
  exception when insufficient_privilege then
    null; -- esperado
  when others then
    if sqlerrm like 'platform_forbidden%' then null; else raise; end if;
  end;
end $$;

-- 3) Cliente autenticado NÃO pode mais executar a RPC antiga (MD5).
do $$
begin
  begin
    perform public.platform_conclude_provisional_password();
    raise exception 'FALHOU: RPC antiga ainda executável por cliente';
  exception when insufficient_privilege then
    null; -- esperado
  end;
end $$;

-- 4) Guarda: escrita direta na marca de primeiro acesso por cliente é bloqueada
--    (sem GUC e sem ticket). Exige usuário autenticado real com perfil próprio;
--    em sessão de serviço esta checagem não se aplica (current_user privilegiado).
--    Verificação real deve ser feita pelo app com usuário de teste autorizado.

-- 5) Ausência de segredos em logs: as funções deste fluxo não registram senha,
--    hash, token ou link. Checagem textual das definições.
do $$
declare r record;
begin
  for r in
    select pg_get_functiondef(p.oid) d
    from pg_proc p
    where p.oid in (
      'platform_private.conclude_provisional_password_server(uuid)'::regprocedure,
      'public.platform_conclude_provisional_password_server(uuid)'::regprocedure,
      'public.platform_first_access_pending(uuid)'::regprocedure
    )
  loop
    if r.d ~* 'raise log|dblink|pg_log|sendmail' then
      raise exception 'FALHOU: função registra em log';
    end if;
    if r.d ~* 'md5|encrypted_password' then
      raise exception 'FALHOU: função usa MD5/encrypted_password';
    end if;
  end loop;
end $$;
