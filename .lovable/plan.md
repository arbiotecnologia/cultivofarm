# Auditoria E2E somente-leitura — Demandas/Solicitações do Parceiro B2B

Objetivo: certificar se o parceiro B2B consegue solicitar produtos e microrganismos de ponta a ponta, escolhendo uma condição de pagamento diferente a cada compra, até faturamento fiscal, recebível e parcelas.

Ambiente: exclusivamente staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` recusada. Sem publicação.

## Restrições assumidas

- Nenhuma alteração de código, banco, dados, migrations, RLS, funções, Edge Functions ou configuração.
- Nenhuma criação de fixture, seed ou escrita em staging. Apenas leitura (`SELECT`) e leitura de arquivos.
- Não usar `service_role` como prova de RLS; onde isso não for evitável sem escrita, o item será marcado NÃO PROVADO e listado para execução controlada futura.
- Único artefato escrito: o relatório em `docs/` (aprovação abaixo).

## O que já foi confirmado nesta sessão

- `/portal-parceiro/*` protegido por `B2BRouteGuard` com autorização server-side (`get_my_available_portal_contexts`), com bypass legado para `administrador` e `gestor_comercial`.
- Rotas do portal parceiro incluem Novo Pedido, Meus Pedidos, Solicitações, Simulações (individual e equipe), Financeiro, Favoritos, Fichas Técnicas.
- Painel interno em `/comercial/solicitacoes-b2b`.
- Checkout no cliente via `useCreatePartnerOrder` → RPC `create_partner_order_secure`, exigindo `p_expected_cart_hash` e `p_idempotency_key` (frontend não define preço).
- Planos lidos via RPC `rpc_b2b_list_selectable_payment_plans` (tabela `commercial_payment_plans` não legível por `authenticated`).
- 574 migrations e 31 Edge Functions no repositório.

Nada além disso está afirmado como estado atual; todo o restante será verificado antes de ser escrito no relatório.

## Blocos de execução da auditoria

1. **Inventário de superfície** — rotas, menus, guards, páginas, hooks e query keys do catálogo, carrinho, solicitações, simulações, painel comercial, financeiro e fiscal.
2. **Inventário de backend** — tabelas, views, RPCs, triggers e grants de `partner_orders`, `partner_order_items`, `partner_simulations`, `commercial_payment_plans`, `commercial_payment_plan_assignments`, `commercial_price_rules`, `commercial_condition_item_prices`, `fiscal_invoices`/itens, `accounts_receivable`/installments, `partner_order_payment_terms`, auditoria e outbox de comunicação.
3. **Taxonomia de estados** — distinguir demanda, simulação, pedido oficial, `quote_only`/`aguardando_cotacao`, aprovado, faturado, recebível; mapear o enum `partner_order_status` real contra as transições implementadas e apontar fluxos paralelos ou conversões incompletas.
4. **Condição por compra** — provar por leitura de código/SQL que a modalidade é resolvida por pedido, a partir de assignments publicados e vigentes, sem persistência indevida no parceiro nem vazamento entre carrinhos. Cenários A (à vista), B (prazo), C (safra), D (quote_only) avaliados por leitura das regras e por dados já existentes em staging.
5. **Itens produto x microrganismo** — XOR, unidade/volume_ml/dose, quantidade mínima, `fixed_item_price` vs `discount_from_base`, item inativo/sem ficha/sem preço, carrinho misto e snapshots persistidos.
6. **Paridade de valores** — trilha catálogo → carrinho → simulação → plano → `cart_hash` → crédito → pedido → faturamento → nota → recebível/parcelas, comparando unitário, subtotal, desconto, juros, encargos, total e cronograma sobre registros já existentes.
7. **Crédito** — inadimplência, limite, exposição projetada, ausência de dupla contagem, liberação em rejeição/cancelamento e reavaliação pós-cotação.
8. **Fiscal** — elegibilidade, vínculo invoice↔pedido, snapshots de item, emissão parcial, bloqueio de dupla nota, política fail-closed, `NOT_REQUIRED` com exceção/motivo/autoria, `PENDING_PARAMETRIZATION`, e determinação explícita de se existe pipeline de emissão real de NF-e/NFS-e ou apenas encaminhamento.
9. **Financeiro** — recebível único, parcelas conforme snapshot, devedor correto, preservação de juros/desconto, faturamento parcial sem duplicidade.
10. **Concorrência e idempotência** — leitura de locks, chaves e constraints; evidência runtime já existente em `partner_order_idempotency` e nos harnesses anteriores.
11. **Segurança** — inventário completo de policies permissive/restrictive e grants; helpers internos sem EXECUTE para PUBLIC/anon; não exposição de tabelas de preço a parceiro/técnico/produtor.
12. **UI/UX desktop e mobile** — condição como etapa obrigatória, estados de loading/vazio/erro/plano indisponível/sem preço/crédito negado/quote_only, ocultação de valores para técnico, retomada de carrinho.
13. **Testes** — inventário dos testes existentes (Vitest, harness SQL, Playwright) e lista explícita dos que exigem execução controlada com escrita, portanto fora deste escopo.

## Entrega

Relatório único em `docs/auditoria-b2b-solicitacoes-e2e.md` contendo: arquitetura e fluxo real; evidência por arquivo/migration/RPC/policy; matriz de estados; tabela de paridade de valores; matriz de perfis; resultado por modalidade (A–D); bloqueios obrigatórios; melhorias recomendadas; impacto e rollback; lacunas de parametrização fiscal; e status final entre APTO, APTO COM RESSALVAS, BLOQUEADO ou NÃO APTO.

Regras de classificação: "encaminhado ao fiscal" não conta como "nota emitida"; APTO só com prova completa até invoice/recebível/parcelas e com a situação da emissão fiscal real identificada. Itens não prováveis sem escrita serão marcados NÃO PROVADO, nunca aprovados por inferência.

## Detalhes técnicos

- Consultas read-only via ferramenta de leitura do Supabase (`SELECT` em `pg_policies`, `information_schema.role_table_grants`, `pg_proc`/`pg_get_functiondef`, `pg_trigger` e nas tabelas de negócio).
- Leitura de código com `rg` e leitura de arquivos; nenhuma execução que altere estado.
- Verificação de UI, se necessária, por leitura de componentes; qualquer checagem em navegador seria feita apenas em rotas do preview local, sem mutação.
