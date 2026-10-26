# Pedido B2B com pendência contábil honesta — pacote INATIVO (revisão 8cad/38 — domínio único de lock de crédito, 26/10/2026)

Somente revisão. Nunca aplicar em produção sem revisão independente e liberação pelo auditor. Nenhum SQL hospedado foi executado e nada foi publicado.

## O que o pacote faz
- Compõe o b5 (`final-integrated-manual-20261024`) byte-exato, sem o gate contábil de instalação, mais um overlay, numa única transação (PRE → DDL → POST).
- Base: LIVE após 30dc8243 (`c2_order_actor_scope` `54c4327d…`); entrada comercial/catálogo 30dc8243 são fixados por hash e não são alterados.
- Emissor não validado: o create externo grava `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1` (`accounting_validated=false`, `issuer_state` real, sem CNPJ/razão/atestado). Aprovação, crédito, selagem, cobrança, produção, NF e entrega ficam negadas (`C2_ACCOUNTING_PENDING`) até a promoção.
- Promoção (única transição pendente → V1): `public.c2_promote_accounting_pending_order_v1` agora é wrapper SECURITY INVOKER sobre o core privado `platform_private.c2_promote_accounting_pending_order_core` (SECURITY DEFINER). O core resolve ator comercial interno e organização ANTES de qualquer lock, trava apenas linha da própria organização (`WHERE id=… AND snapshot.organization_id=org FOR UPDATE`), revalida autoridade sob lock, exige CAS `updated_at`, status permitido, emissor VALIDATED atual, ticket txid e grava auditoria. Pedido inexistente e alheio recebem a mesma negação.
- Writer `c2_owner_order_create_allowed`: corpo v4 revisado substitui o LIVE `SELECT false`.

## Hashes do candidato (MD5 `pg_get_functiondef`)
- `platform_private.c2_external_origin_assert(jsonb,uuid,uuid)` → `999e5e9fd9887595e252523fb2142726`
- `platform_private.b2b_internal_order_snapshot_guard()` → `9cad2aaa995277b913f8b40816fea504`
- `public.approve_partner_order(uuid,text,date)` → `664f63441c92a6716f0117362255ec9e` (antes `3b0ba480…`; única mudança: lock de crédito)
- `public.generate_b2b_receivable_secure(uuid)` → `c49cc7ccedbcb28cba9b816b7e47c521`
- `platform_private.c2_owner_order_create_allowed(uuid,uuid)` → `5f0a08d1d4f8d8c5a7ae58e24c71071e`
- `platform_private.c2_external_origin_contract_valid(jsonb)` → `369fd07cd9c659b87941b9a3bf972868`
- `platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid)` → `05938c5e9abf096d560e57aad10af69f`
- `platform_private.c2_accounting_pending_guard()` → `49ba72a6d607f729dc40179ac9d5d30e`
- `platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)` → `68aa322da9dd403beb776cfb333b1e27`
- `public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)` → `3df7e1a806fb080283ad1ebad20d212c`

Pins b5/LIVE, restauração e rollback: `expected.json`. Manifesto: `SHA256SUMS`.

## Domínio único do lock de crédito (revisão 8cad/38)
- Falha: `approve_partner_order` usava `hashtext('b2b_credit:'||partner)` (int4) e `create_partner_order_secure`/`tg_partner_orders_credit_guard` usam `hashtextextended(...,0)` (int8): chaves diferentes (produção, parceiro 7e52de9a: 1059961474 × 6409308924409657986). A aprovação calculava a exposição sem serializar com a criação; só o trigger no UPDATE serializava, depois da decisão.
- Correção mínima: aprovação passa a usar a chave canônica `hashtextextended('b2b_credit:'||partner,0)` e revalida papel/escopo depois da espera. Nada mais muda em create, trigger, crédito, fiscal ou cobrança.
- Writers de exposição capturados: create, approve, trigger (agora uma chave só). `simulate_b2b_payment_plan_secure` só lê. `generate_b2b_receivable_secure` não usa lock de crédito (linha→recibo). `approve_b2b_credit` NÃO está capturado — ver `LIVE-DEPENDENCIES.md`.
- Ordem: create = idempotência → crédito → INSERT de linha nova; approve = linha do pedido → crédito → UPDATE (trigger reentra na mesma chave). Nenhum caminho capturado segura crédito e espera linha existente; sem ciclo. Testado nas duas ordens sem `40P01`.
- Rollback (`rollback.sql.review`) e `restore-live.sql.review` voltam ao corpo anterior com a chave divergente: é reversão de código e reintroduz a corrida de decisão (o trigger continua serializando no UPDATE).

## Arquivos
`preflight.sql` (READ ONLY), `candidate.sql.review`, `postflight.sql` (READ ONLY; inclui ACL do wrapper/core e INVOKER/DEFINER), `rollback.sql.review` (contenção parcial: volta aos corpos b5 + writer false, mantém histórico; pedidos pendentes ficam congelados — não é retorno à baseline), `restore-live.sql.review` (retorno completo ao LIVE pré-implantação; aborta se houver qualquer linha com snapshot externo), `overlay.diff` (gerado por `assemble.py` a partir dos corpos finais; nunca editado à mão), `assemble.py`, `src/`, `test-local.py`, `results-local.txt`, `LIVE-DEPENDENCIES.md`.

## Testes locais — 82/82 PASS (`results-local.txt`)
PostgreSQL descartável e Auth sintética; NÃO é JWT/RLS hospedado nem validação contábil. Inclui: PRE/POST, falha POST atômica, 30dc8243 preservado, A DRAFT pendente sem títulos/parcelas/vínculos/NF, idempotência/conflito/concorrência, notificações só para A, negações A/B/técnico/plano/item/revogação, B com fixture MG sintética VALIDATED (HOMOLOGATION), promoção (B, comprador e DRAFT negados; CAS; sucesso com fixture; auditoria; segunda negada), **duas conexões: A segura o lock do próprio pedido, a promoção de B é negada em ~0,03 s sem esperar e a de A espera (lock_timeout)**, wrapper INVOKER/core DEFINER, rollback e restore.

## Frontend (fora do pacote SQL, no código do app)
- `usePartnerOrdersAdmin` usa `useScopedPortalQuery` (chave com escopo de ator e de requisição; respostas tardias descartadas); realtime só com escopo pronto, canal único por escopo e invalidação apenas das chaves daquele ator.
- `PedidosB2B`/`SolicitacoesB2B` fecham detalhe e diálogos ao trocar ator/tenant/papéis/época ou revogar.
- `useCreatePartnerOrder`: após criar, estado `pending`/`validated`/`unknown`; erro de leitura ou contrato desconhecido vira aviso explícito (sem sucesso validado e sem reenvio).
- Botão "Liberar após regularização contábil" no detalhe do pedido pendente, com confirmação contextual; chama somente o wrapper com o `updated_at` atual. Não valida cadastro fiscal: o servidor recusa enquanto não estiver validado. Sem o pacote instalado, a chamada mostra "ainda não disponível no servidor".
- Testes: `src/test/pedidos/partnerOrdersAdminScope.test.tsx` (transporte sintético).

## Limites
A real continua DRAFT; nenhuma atestação foi simulada em produção. Classificação fiscal MG e NF-e/SEFAZ não tocadas. Em produção, falta comprovar `USAGE` de `authenticated` no schema `platform_private` (ver `LIVE-DEPENDENCIES.md`) e testar com JWT/RLS reais A/B.
