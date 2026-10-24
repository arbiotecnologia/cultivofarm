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

## Catálogo da carteira (captura READ ONLY LIVE recebida em 24/10/2026)
- LIVE: `get_partner_catalog_secure(uuid)` MD5 `2c1944f3f95e4d2b44675306d5905b61`; V2 `(uuid,boolean)` MD5 `1391adc2133b922e2dcea4b1d3e26820`; owner `postgres`, ACLs guardadas literalmente (`catalog/live-capture.json`).
- Patch mínimo (`catalog/get_partner_catalog_secure.diff`): só a condição `forbidden_partner` aceita também o ator comercial interno exclusivo quando `c2_internal_order_target_reason` é NULL (mesmo guard de simulate/create: perfil, feature `pedidos_b2b`, org canônica, parceiro ativo da carteira). Bloqueio técnico, `forbidden_role`, `feature_not_entitled` (catálogo), visibilidade dual-tenant C1B, preços, fichas aprovadas e wrapper V2 inalterados. Candidato MD5 `b5684d350603d1db77ab9f1db0f4b253`, ACL/owner preservados.
- Capacidade: `catalog_reader_pending` só se o leitor divergir do hash revisado; novo `catalog_feature_disabled` (mesma feature `catalogo_precos`). `order_create=true` exige ainda emissor VALIDATED — no hospedado A está DRAFT ⇒ continua `issuer_not_validated` (fechado).
- Helpers LIVE capturados e instalados sem stubs (`catalog/live-helpers.json`): `c1b_catalog_visibility_scope` `cefe53f3…`, `fn_b2b_resolve_base_unit_price` `60651fe8…`, `fn_catalogo_preco_canonico` `fa5e890d…`; MD5+ACL+owner guardados em PRE/POST/rollback. Nenhum é alterado.
- Dependência de b5: a criação interna foi exercitada sobre a base LIVE reconciliada (sem b5) e passa com emissor VALIDATED, sem título/parcela/vínculo/NF. b5 corrige apenas a janela aprovação×cobrança; a capacidade promete só criação, não aprovação/cobrança.

## Fixtures contábeis (autorização do proprietário 24/10)
Somente no PostgreSQL descartável: emissor sintético identificado `FIXTURE SINTETICA MG - SEM VALIDADE JURIDICA`, UF MG, `HOMOLOGATION`, VALIDATED apenas na fixture. Não é atestação humana e não substitui cadastro real; A real (DRAFT) segue `issuer_not_validated`. Classificação NCM/CFOP/CST/benefício, regime e destinação MG interna/interestadual NÃO são resolvidas por este pacote nem pela criação do pedido; o motor fiscal não foi tocado e não há automação sem dados (RICMS/MG Anexo II: benefício depende de produto/operação/destinação). Emissão NF-e, transmissão SEFAZ e cobrança: não executadas nem homologadas.


## Arquivos
`preflight.sql` (READ ONLY), `candidate.sql.review` (transação única PRE→DDL→POST), `postflight.sql` (READ ONLY), `rollback.sql.review` (restaura corpo LIVE exato, remove funções novas, preserva pedidos/histórico), `expected.json` (MD5), `test-local.py`.
MD5 candidato: scope `54c4327d63f48e39f598129ff9dd8f09`, target_reason `07d7c9002cbfe17497c9ee4a92d5a928`, capability `e2619c71becfebf38c8d03562ff11ce2`, catálogo `b5684d350603d1db77ab9f1db0f4b253`. Rollback restaura também o catálogo LIVE exato.

## Evidência local (PostgreSQL descartável, Auth sintética — NÃO é JWT/RLS hosted)
`python3 scripts/commercial-order-entry-20261024/test-local.py` → 54 PASS (inclui helpers reais; preço por parceiro, validade expirada, volume canônico 180/L, fallback legado 30/L, sem vazamento de preço P→Q; fixture MG identificada; nenhuma NF; catálogo: LIVE reproduzido, A/B carteira própria lida e estrangeira negada, oculto por A omitido, famílias, preço, ficha só aprovada, V2/ACL intactos, técnico/externo/cumulativo/produtor byte-iguais, feature off fecha, rollback restaura): baseline negado; PRE/POST; falha POST injetada atômica; A só P, B só Q; externos/técnico/cumulativo/produtor `actor_not_allowed`; A→parceiro B e B→parceiro A negados sem efeitos; técnico e externo (`C2_OWNER_ORDER_CLOSED`) idênticos ao LIVE; hash obrigatório; replay idempotente sem novas escritas; conflito; origem interna server-side, readiness false; nenhum título/parcela/vínculo; DRAFT → capacidade fechada e create `B2B_INTERNAL_ISSUER_NOT_VALIDATED`; perfil inativo; papel revogado; multiperfil sem bypass; rollback com falha atômica, rollback restaura hash LIVE, writer false.

## Frontend (ativo, fail-closed)
Rota `/comercial/pedidos-b2b/novo` (admin/gestor_comercial, feature `pedidos_b2b`) lê só a capacidade; sem RPC instalada mostra `contract_not_installed`. Quando permitido, lista apenas alvos do servidor, recusa `?parceiro=` estrangeiro e monta `NovoPedido` como rota filha com `key` de escopo (ator/org/papéis/parceiro/época) — remontagem limpa carrinho, preço, plano, hash e chave de idempotência. Painel de Pedidos B2B só mostra "Registrar venda" com contrato permitido.
