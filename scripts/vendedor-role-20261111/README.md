# Perfil interno Vendedor — pacote revisável (NÃO instalado)

Ordem: 01-pre (SET app.expected_ref='swzpzcwiasxmjutrmvkm') → 02a (enum, transação própria) → 02b → 03-post → patch Edge `create-user` (TENANT_USER_ROLES += "vendedor") → homologação JWT real.
Rollback: 04 (recusa com atribuições ativas; preserva histórico; enum não é removível).

Inventário: não existe vínculo real vendedor→parceiro (só `commercial_owner_organization_id`, texto livre `consultor_responsavel` e `partner_users` de membros externos). Criado vínculo novo, negação por padrão, atribuição/revogação só por administrador ativo da mesma empresa, com motivo, auditoria e histórico imutável.

Não altera: `b2b_internal_commercial_actor`, aprovação comercial/financeira/crédito, planos/condições, cobrança, estoque, entregas, fiscal, emitente ou envios.

BLOCKED: lançar pedido e responder cotação pelo Vendedor. Os escritores canônicos (`create_partner_order_secure`, `respond_b2b_order_quote_secure`) aceitam só administrador/gestor_comercial e o pacote de entrada interna está INATIVO; corpos LIVE não foram capturados nesta execução (credencial Supabase expirada). Requer captura LIVE + delta separado que use `platform_private.seller_partner_in_portfolio`. A capability declara `order_create=false`, `quote_respond=false`; a tela mostra isso.

Evidência: `python3 test_local_pg.py` → 33 PASS (`evidence/attempt-001.json`, com SHA-256). Auth sintética: não prova JWT/RLS reais.
