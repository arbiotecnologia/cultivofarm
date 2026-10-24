# Pedido B2B com pendência contábil honesta — pacote INATIVO (24/10/2026)

**Objetivo:** liberar somente o fluxo canônico `simulate → create_partner_order_secure` do gestor B2B externo enquanto a contabilidade do fornecedor (A) não está validada, sem VALIDATED falso nem snapshot fiscal inventado. Aprovação, crédito, selagem econômica, cobrança, produção, NF e entrega continuam negadas no servidor até a validação real.

## Dependência de b5 (resposta direta)
Sim. A compra externa **depende** do b5 (`final-integrated-manual-20261024`, não instalado): sem ele o trigger LIVE de origem interna nega todo insert externo (`B2B_INTERNAL_ACTOR_DENIED`) e o writer LIVE é `SELECT false`. Além disso, o b5 tinha um gate contábil de **instalação** que impede instalá-lo com A DRAFT. Este pacote compõe o b5 **byte-exato** (sem esse gate) + overlay na mesma transação; o gate passa a ser por pedido.

## Mudanças (diff em `overlay.diff`)
1. `b2b_internal_order_snapshot_guard` (b5 → `9cad2aaa…`): no create externo, emissor VALIDATED → snapshot V1 inalterado; caso contrário (0 configs ou não validada) → `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1` com `issuer_state` real (`NOT_CONFIGURED`/`DRAFT`/…), `accounting_validated=false` e **sem** CNPJ/razão/issuer. >1 config ativa segue negada. Snapshot imutável salvo promoção com ticket; UPDATE também valida o NOVO snapshot.
2. `c2_external_origin_assert` (`999e5e9f…`): aceita exatamente os dois contratos via `c2_external_origin_contract_valid` (pendente proíbe chaves de emissor).
3. `approve_partner_order` (`3b0ba480…`) e `generate_b2b_receivable_secure` (`cbe44993…`): `42501 C2_ACCOUNTING_PENDING` antes de qualquer escrita.
4. Trigger novo `zz_c2_accounting_pending` (`e9e00d85…`): enquanto pendente só `em_analise_comercial`/`aguardando_cotacao`/`reprovado`/`cancelado`; nega pronto p/ produção, recebível, selagem e decisão de crédito.
5. `public.c2_promote_accounting_pending_order_v1(order, expected_updated_at)` (`22bef080…`): única transição pendente→V1; ator comercial interno da mesma org + `c2p1_settings_allowed`, CAS, emissor VALIDATED atual, ticket txid, audit em `partner_order_audit_logs`, ator original preservado; mesma negação para pedido inexistente/alheio.
6. Writer `c2_owner_order_create_allowed`: corpo v4 revisado (`5f0a08d1…`) no lugar do LIVE `SELECT false` (`a0417d…`).
Sem tabela, portal, rota ou writer novos; NovoPedido/RPCs canônicos inalterados.

## Arquivos
`preflight.sql` (b5 READ ONLY verbatim, exige writer LIVE false), `candidate.sql.review` (uma transação: b5 PRE→DDL→POST, overlay, POST próprio), `postflight.sql` (b5 POST com 5 hashes substituídos e +1 trigger, mais POST próprio), `rollback.sql.review` (restaura os 4 corpos b5 byte-exatos e writer false, remove overlay; pedidos ficam como histórico e os pendentes ficam congelados), `expected.json`, `assemble.py` (falha fechada se âncora ≠ 1), `overlay.diff`, `LIVE-DEPENDENCIES.md`.

## Testes (`python3 test-local.py`) — 41 PASS, PostgreSQL descartável, Auth sintética
A DRAFT: gestor A cria pedido pendente honesto; cliente derivado no servidor; 0 título/parcela/vínculo/NF; replay idempotente e conflito; notificações só para usuários de A; aprovação/cobrança/saltos diretos (aprovado/produção/entregue/faturado) e autopromoção negados sem efeitos. Adversariais: A→parceiro B, B→parceiro A, técnico, plano só de B, item não B2B, revogação. B (fixture MG sintética VALIDATED, `HOMOLOGATION`): V1 com emissor; aprovação gera 1 vínculo + 3 parcelas, 0 NF; admin A não aprova B. Promoção: B e comprador negados, DRAFT negado, CAS, sucesso após fixture validada com auditoria, segunda promoção negada, sem efeitos financeiros. Atomicidade candidate/rollback com falha injetada; rollback restaura hashes e congela pendentes; create fechado de novo.

## Limites
Não é JWT/RLS hospedado nem contabilidade. Validação de A no teste é **fixture**; A real segue DRAFT. Classificação fiscal MG (NCM/CFOP/CST/benefício/regime/destinação) e NF-e/SEFAZ não são tocadas nem homologadas. Frontend ainda não mostra o estado "aguardando validação contábil" nem a promoção (próxima fase após revisão). Ver `LIVE-DEPENDENCIES.md`.
