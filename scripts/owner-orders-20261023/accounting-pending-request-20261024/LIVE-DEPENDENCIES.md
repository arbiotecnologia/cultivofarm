# Dependências LIVE ainda não capturadas (consultas READ ONLY para o proprietário)

Rodar no SQL Editor de `swzpzcwiasxmjutrmvkm` (somente leitura). Devolver o JSON.

```sql
BEGIN READ ONLY;
SELECT json_agg(json_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),
  'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY 1)
FROM pg_proc p WHERE p.oid IN (
 'platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure,
 'platform_private.b2b_commercial_context()'::regprocedure,
 'platform_private.entitlements_for_user(uuid)'::regprocedure,
 'platform_private.c2_order_internal_recipients(uuid)'::regprocedure,
 'platform_private.c2_order_partner_recipients(uuid)'::regprocedure,
 'public.fn_b2b_status_is_operational(public.partner_order_status)'::regprocedure,
 'public.fn_resolve_b2b_cart(uuid,jsonb,date)'::regprocedure);
-- Estado instalado (b5 ainda não instalado deve dar false/NULL):
SELECT to_regprocedure('platform_private.c2_external_origin_assert(jsonb,uuid,uuid)') IS NOT NULL AS b5_installed,
       EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='c2_external_origin_snapshot' AND NOT attisdropped) AS b5_column,
       (SELECT json_agg(tgname ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND NOT tgisinternal) AS partner_orders_triggers,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='partner_orders_status_check') AS status_check,
       (SELECT json_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid='public.partner_order_status'::regtype) AS status_enum;
COMMIT;
```
Se alguma assinatura não existir, a consulta falha no `::regprocedure`; nesse caso remova-a e informe qual faltou.
Motivo: o harness usa esses corpos a partir de capturas anteriores (23–24/10); `b2b_commercial_context` e `entitlements_for_user` decidem o writer revisado, e os destinatários decidem o isolamento de notificações.

## Revisão 07739e5c — wrapper INVOKER/core privado
O wrapper `public.c2_promote_accounting_pending_order_v1` (INVOKER) chama `platform_private.c2_promote_accounting_pending_order_core`. Confirmar em READ ONLY antes da instalação:
```sql
BEGIN READ ONLY;
SELECT has_schema_privilege('authenticated','platform_private','USAGE') AS authenticated_usage_platform_private;
COMMIT;
```
Se `false`, o pacote NÃO deve conceder USAGE por conta própria; trazer o resultado para revisão (a promoção ficaria indisponível, não insegura).

## Lock de crédito — dependência não capturada (revisão 8cad/38)
`public.approve_b2b_credit` também decide crédito e não consta da captura. Consulta READ ONLY:
```sql
SELECT p.oid::regprocedure AS sig, md5(pg_get_functiondef(p.oid)) AS md5, pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p WHERE p.proname IN ('approve_b2b_credit') OR pg_get_functiondef(p.oid) ~ 'b2b_credit:' ORDER BY 1;
```
Se algum corpo usar `hashtext('b2b_credit:'…)` ou decidir exposição sem a chave canônica, precisa entrar no mesmo domínio antes da liberação.
