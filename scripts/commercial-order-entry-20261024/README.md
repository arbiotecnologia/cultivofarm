# Entrada de pedido pelo comercial — revisão INATIVA (24/10/2026)

## Conferência LIVE (material capturado em `credit-numeric-20261024/current-base-reconciliation-20261024/origin/baseline` e `contracts-c2-20261022/integral/replica.sql`)
1. `create_partner_order_secure` e `simulate_b2b_payment_plan_secure` chamam `c2_order_actor_scope` → `assert_b2b_partner_scope`. Para ator interno (administrador/financeiro/gestor_comercial) exige `b2b_actor_scope(uid).org_partner = p_partner_id`: **o comercial só pode pedir para o parceiro da própria organização**, nunca para outro parceiro/cliente da carteira (`forbidden_partner`). Técnico B2B → `forbidden_financial_terms`.
2. Trigger `b2b_internal_order_snapshot_guard` (INSERT): exige `company_fiscal_settings` ativa única e `VALIDATED` com atestação. A está DRAFT → `B2B_INTERNAL_ISSUER_NOT_VALIDATED`; B sem configuração → `B2B_INTERNAL_ISSUER_AMBIGUOUS`. Status operacional/readiness → `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`.
3. `c2_owner_order_create_allowed` LIVE = `SELECT false` (writer de compra própria contido).
4. Hash (`cart_hash_required`) e idempotência (`reqfp_v2`, lock por parceiro+chave) já são obrigatórios para todos os chamadores; nenhum título/cobrança/fiscal/entrega na criação.
5. Não existe leitura server-side que diga ao frontend se o comercial pode iniciar o pedido nem quais parceiros são alvo.

## Conclusão
Backend não suporta preparação segura de venda para carteira. Nenhum botão criar/enviar foi exposto. Frontend recebeu apenas leitor fail-closed (`src/lib/comercial/internalOrderEntry.ts`) e texto preciso das pendências.

## Contrato mínimo proposto (`capability.sql.review`, termina em ROLLBACK)
`c2_internal_order_entry_capability_v1()` somente leitura: mesmo critério de ator e emissor do LIVE; lista só o parceiro aceito hoje pelo servidor. Mesmo instalado, devolve `order_create=false` para A até validação contábil real.

## Decisão pendente do proprietário (não implementada)
Venda para outros parceiros/clientes da empresa exige alterar `assert_b2b_partner_scope` para internos (ex.: `commercial_owner_organization_id = h15_actor_organization()`). É mudança de autorização: revisão separada, testes A/B/JWT reais.

## Funcional vs bloqueado
- Funcional: consulta de catálogo e análise/aprovação existentes; textos explicativos.
- Bloqueado: compra própria externa (writer false), pedido comercial interno (emissor A DRAFT + escopo org_partner), venda para carteira (sem regra servidor).
