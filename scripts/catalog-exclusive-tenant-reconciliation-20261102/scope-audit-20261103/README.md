# Catálogo-only: revisão de escopo e produção — 03/11/2026

**LOCAL SEPARADO / PUBLICAÇÃO NO-GO.** Nenhum SQL de aplicação, writer hosted, publicação, NF-e, cobrança ou envio SMTP executado. Somente SELECT de catálogo PostgreSQL no Supabase canônico, comprovado em `supabase/config.toml` (`swzpzcwiasxmjutrmvkm`) antes da consulta.

## Evidência real versus testes

`production-contracts.json` é captura real em03/11/2026 01:03:46UTC de19funções, com assinatura/retorno/MD5/EXECUTE authenticated. `production-signatures.log.txt` e `production-function-bodies.log.txt` preservam saídas brutas. Consultas em pg_proc/pg_namespace/pg_get_functiondef, sem JWT e sem execução das funções. Existência/grant não prova autorização, isolamento, efeitos ou resultados sob sessão real. Nenhum segredo ou registro de cliente foi consultado.

**Achados impeditivos do export integral:**
- `partner_payment_condition_capability_v1` AUSENTE. NovoPedido e SimuladorComercial exigiam a capability; create exigia choice incondicionalmente antes do journal/writer. Não havia fallback canônico nas telas.
- `rpc_receivable_money_projection_v1` AUSENTE. ContasReceber e ContaDrawer a consultavam incondicionalmente; BaixaDialog exigia sua origem, sem gate OFF de rollout. Fail-closed evita baixa inválida, mas quebraria operação existente neste deploy.
- `create_partner_order_secure` tem somente9argumentos originais; `simulate_b2b_payment_plan_secure` somente4: **nenhuma assinatura aceita p_payment_choice**.
- `rpc_b2b_list_selectable_payment_plans` existe, mas retorno não contém payment_contract/payment_methods/payment_deadline_days/configuração aprovada esperados pelas novas telas.
- Administração dos planos e baixa/cancelamento existem com argumentos originais e UUID/void correspondentes. `amortization_type` estava em JSONB payload, não overload. A página bloqueava submit Price, mas preview/novos controles permaneciam ativos. Isso não autoriza publicar essa alteração financeira.
- Aprovação void/null é compatível; seu endurecimento de ACK foi separado igualmente por não ser catálogo. Não se corrigiram bugs financeiros candidatos nesta rodada.

## Matriz e decisão

`MATRIZ.csv`:44linhas arquivo→RPC direta/transitiva→disponibilidade/gate→decisão final. Helpers puros não são evidência de servidor. Leitores/writers originais reutilizam o Supabase canônico; não foi criado fallback paralelo nem flag nova.

**16arquivos restaurados juntos**, byte a byte de `9d3a9424d708f6daebfb67b969696db2d1b7e0d0`: PaymentPlanSelector; useCommercialPaymentPlans/Admin; useCreatePartnerOrder; usePartnerOrderActions; useSimulateB2BPaymentPlan; NovoPedido; CommercialPaymentPlansPage; SimuladorComercial; pendingOrderAttempt; comercial/validation; BaixaDialog; ContaDrawer; ContasReceber; financeiro/baixaRecebimento e contasReceber. Assim não se misturam leitura financed-total e aritmética original. A preservação não certifica nem corrige limitações históricas do financeiro.

17testes existentes desses contratos foram restaurados à mesma base;24arquivos adicionados (helpers/testes/fixture) foram retirados de src e preservados como candidatos nesta pasta. Nenhuma assertion foi relaxada, skip introduzido ou mock de autorização substituído para verde. Testes candidatos continuam íntegros em `deferred/source/`, **não executáveis no runtime restaurado sem recomposição própria**. Não foram apagados nem declarados aprovados após separação.

Exceção explícita: `civilDate.ts` mantido em src porque `ownedProductFiscal.ts` depende de isCivilDate. É validador puro, sem RPC/preço/efeito financeiro. A primeira baseline falhou por omitir esta dependência; log mantido e repetição passou. O marcador histórico `defer_added_runtime` em separation-plan.json é intenção PRE; `separation-manifest.json` é decisão final, com `keep_catalog_dependency`.

**Catálogo preservado:** App/navigation/permissions, retirada de catálogo global Superadmin, ProdutosEmpresa, ProdutosTab/MicrorganismosTab, useTenantProducts, tenantProducts/tenantCatalogRoots, technical profiles, seed containment e limites de fiscal produto próprio. Captura atual não contém tenant_product_list/save/set_archived/root_save/delete/formulacoes_replace/owned_fiscal_save: instalação01 planejada continua aguardando auditor/JWT/POST. Fiscal produto próprio OFF e emissão OFF. Nenhuma atribuição arbitrária de empresa aos produtos/microrganismos existentes.

## Testes locais executados após separação

| Bateria | Arquivos | Testes | Resultado |
|---|---:|---:|---|
| Financeiro/comercial/pedidos originais |75|1127|PASS|
| Baseline catálogo |51|1019|PASS|
| Entrega/estoque/envase/etiquetas |50|720|PASS|

Contagens possuem sobreposição; não somar como testes únicos. Comandos reproduzíveis:
```sh
bun run test -- $(cat scripts/catalog-exclusive-tenant-reconciliation-20261102/scope-audit-20261103/financial-original-test-files.txt) --maxWorkers=2 --minWorkers=1
bun run test -- $(cat scripts/catalog-exclusive-tenant-reconciliation-20261102/evidence/monitor-fix/baseline-files.txt) --maxWorkers=2 --minWorkers=1
bun run test -- $(cat scripts/stock-caller-contract-update-20261031/evidence/regression-files.txt) --maxWorkers=2 --minWorkers=1
tsgo --noEmit -p tsconfig.app.json
```
Typecheck exit0; build automático do harness OK. Nenhum build manual nem PostgreSQL descartável nesta rodada. Avisos React preservados. Testes jsdom com transportes simulados não provam SQL/RLS/JWT/UI navegador real; números de testes da integração anterior referem-se ao estado integral supersedido.

## Artefatos e gates de revisão

- separation-manifest.json: hash candidato/baseline e decisão por57paths; deferred/source conserva bytes exatos. Um helper desses57 foi mantido por dependência de catálogo.
- runtime-before.diff.txt: export integral contra base; runtime-after.diff.txt: catálogo-only contra base. Não reexecutar apply_from_snapshot.py sobre este estado: a divergência financeira é intencional e documentada.
- catalog-preserved.json: hashes das alterações runtime catálogo mantidas; nenhum binding/flags/SQL antigo alterado.
- SMTP/cron/fiscal server-side permanecem estado informado pelo auditor, não reverificado nem alterado; NF-e e recebíveis automáticos OFF não são liberados por SELECT de assinatura.
- GO bloqueado até revisão desta matriz, composição01 exata aprovada e JWT/POST catálogo reais; nenhum pacote financeiro/fiscal histórico entra automaticamente nesse deploy.