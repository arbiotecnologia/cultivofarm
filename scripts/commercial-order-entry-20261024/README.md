# Venda do comercial para a carteira da própria empresa — pacote INATIVO (24/10/2026)

Escopo autorizado pelo proprietário: comercial interno registra pedido SOMENTE para parceiros com
`commercial_owner_organization_id = h15_actor_organization()`. Não amplia roles, não libera o writer
de compra própria, não valida contabilidade.

## LIVE capturado (base `current-base-reconciliation-20261024/origin/baseline`)
- `c2_order_actor_scope` (`6802c693…`) é o guard comum de `simulate_b2b_payment_plan_secure` e `create_partner_order_secure`; para internos delega a `assert_b2b_partner_scope`, que exige `org_partner = alvo` → carteira negada (`forbidden_partner`).
- Trigger `b2b_internal_order_snapshot_guard` (filho canônico) exige emissor VALIDATED e reaplica `b2b_internal_assert_origin` (partner/cliente da org). A DRAFT → `B2B_INTERNAL_ISSUER_NOT_VALIDATED`. `ready_for_production`/status operacional → `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`.
- Writer de compra própria `c2_owner_order_create_allowed` = `SELECT false` (`a0417d…`).

## Mudança (`src/functions.sql`, montado por `assemble.py`)
1. `platform_private.c2_internal_order_target_reason(uid, partner)` (privado, sem EXECUTE authenticated): ator interno comercial exclusivo LIVE (`b2b_internal_commercial_actor`: admin/gestor_comercial, acesso pronto, sem papel B2B externo), `b2b_actor_scope.profile_ok`, feature `pedidos_b2b`, org canônica, parceiro ativo/não excluído da carteira e cliente vinculado da mesma org.
2. `c2_order_actor_scope`: ramo novo só para esse ator → `42501 C2_INTERNAL_TARGET_DENIED:<motivo>`. Demais ramos byte-iguais ao LIVE (externo, cumulativo, técnico, financeiro, multiperfil interno+externo).
3. `public.c2_internal_order_entry_capability_v1()` leitura: `contract`, `organization_id`, `profile_ok`, `order_create`, `reason`, `partners[{partner_id, razao_social, commercial_owner_organization_id}]` com owner lido da linha.

## Bloqueio concreto remanescente
`get_partner_catalog_secure(uuid)` (lido por `p_catalog_v2`) também exige `org_partner`; seu corpo LIVE não está capturado neste material. Sem ele não há catálogo para o alvo. Por isso a capacidade devolve `order_create=false, reason=catalog_reader_pending` mesmo instalada. Próximo passo: captura READ ONLY do corpo LIVE e patch mínimo usando o mesmo `target_reason`. Mesmo então, A segue `issuer_not_validated` até a validação contábil real.

## Arquivos
`preflight.sql` (READ ONLY), `candidate.sql.review` (transação única PRE→DDL→POST), `postflight.sql` (READ ONLY), `rollback.sql.review` (restaura corpo LIVE exato, remove funções novas, preserva pedidos/histórico), `expected.json` (MD5), `test-local.py`.
MD5 candidato: scope `54c4327d63f48e39f598129ff9dd8f09`, target_reason `07d7c9002cbfe17497c9ee4a92d5a928`, capability `88b3cd5499bf3f674601851f7dab848d`.

## Evidência local (PostgreSQL descartável, Auth sintética — NÃO é JWT/RLS hosted)
`python3 scripts/commercial-order-entry-20261024/test-local.py` → 30 PASS: baseline negado; PRE/POST; falha POST injetada atômica; A só P, B só Q; externos/técnico/cumulativo/produtor `actor_not_allowed`; A→parceiro B e B→parceiro A negados sem efeitos; técnico e externo (`C2_OWNER_ORDER_CLOSED`) idênticos ao LIVE; hash obrigatório; replay idempotente sem novas escritas; conflito; origem interna server-side, readiness false; nenhum título/parcela/vínculo; DRAFT → capacidade fechada e create `B2B_INTERNAL_ISSUER_NOT_VALIDATED`; perfil inativo; papel revogado; multiperfil sem bypass; rollback com falha atômica, rollback restaura hash LIVE, writer false.

## Frontend (ativo, fail-closed)
Rota `/comercial/pedidos-b2b/novo` (admin/gestor_comercial, feature `pedidos_b2b`) lê só a capacidade; sem RPC instalada mostra `contract_not_installed`. Quando permitido, lista apenas alvos do servidor, recusa `?parceiro=` estrangeiro e monta `NovoPedido` como rota filha com `key` de escopo (ator/org/papéis/parceiro/época) — remontagem limpa carrinho, preço, plano, hash e chave de idempotência. Painel de Pedidos B2B só mostra "Registrar venda" com contrato permitido.
