-- H9-C1 — Menor privilégio em duas funções SECURITY DEFINER de escrita sem autorização.
-- Alvo exclusivo: homologação ikaauvsflpmamgxmkhoq. Produção PROIBIDA nesta fase.
--
-- Evidência (H9-C, sessão authenticated de baixo privilégio, transação revertida):
--   * public.check_partner_order_sla() executou integralmente sem qualquer verificação
--     de auth.uid()/papel, gravando em public.alertas_operacionais. Consumidor real:
--     apenas o job cron "check-partner-order-sla" (*/30 * * * *), executado como postgres.
--   * public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) ultrapassou o gate de ambiente e
--     alcançou a leitura/atualização de public.fiscal_xml_runs sem verificar usuário ou
--     papel (erro final apenas FISCAL_XML_RUN_NOT_FOUND). Consumidor real: apenas a Edge
--     Function fiscal-xml-engine, que a invoca com o cliente service_role.
--
-- Correção mínima e reversível: remover o EXECUTE desnecessário de authenticated/anon/PUBLIC.
-- Nenhuma assinatura, corpo, consumidor, RLS, cron, Auth ou Storage é alterado.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.check_partner_order_sla() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_partner_order_sla() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_partner_order_sla() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid, text, jsonb) FROM authenticated;

-- Consumidores legítimos preservados explicitamente (idempotente).
GRANT EXECUTE ON FUNCTION public.check_partner_order_sla() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid, text, jsonb) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005000000', 'h9c1_least_privilege_secdef_v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
