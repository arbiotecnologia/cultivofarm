-- SOMENTE LEITURA. Não é prova REST/JWT nem autorização para escrever.
SELECT 1 / CASE WHEN md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))=
 'c3f2997746f24bc2efd15db5c0ccc862' THEN 1 ELSE 0 END AS applied_scope_unchanged;
SELECT 1 / CASE WHEN NOT has_function_privilege('authenticated','public.link_partner_user(uuid,uuid,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.set_partner_user_papel(uuid,text)','EXECUTE') THEN 1 ELSE 0 END AS legacy_closed;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.proconfig,p.proacl,pg_get_userbyid(p.proowner)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('c2_partner_lifecycle','get_partner_user_lifecycle','link_partner_user');
SELECT count(*)=0 AS anon_denied FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('c2_partner_lifecycle','get_partner_user_lifecycle') AND has_function_privilege('anon',p.oid,'EXECUTE');
SELECT acao,count(*) FROM public.partner_audit_logs WHERE acao='c2_partner_lifecycle' GROUP BY acao;