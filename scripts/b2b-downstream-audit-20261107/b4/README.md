# Reconciliação B4 útil sobre o B3 atual — revisões 458b6012 e 4097d4e2

**INATIVO, BLOQUEADO E NÃO APROVADO.** Nenhuma operação hospedada, NF/cobrança/aprovação contábil real, envio, publicação ou subagente. B3 e os 63 testes históricos não foram reabertos nem promovidos a E2E.

## Revisão atual

A evidência vigente está em `review-458b6012/live-absence-4097d4e2/`. O manifesto cobre **55 alterações**, incluindo funções, relações, coluna/FK, constraints, índices, gatilhos, owners e ACLs. Novos objetos exigem ausência; substituições exigem corpo/owner/ACL capturados e conferência LIVE independente.

O auditor relatou que `public.rpc_receivable_money_projection_v1` não possui overloads LIVE. Por isso ela é tratada como **CREATE**, sem baseline inventada: o PRE exige zero overloads por `pg_proc`, e o POST exige um overload owner-only. Os MD5/owners/ACLs relatados dos writers e a definição de `ux_ar_one_active_per_b2b_order` foram confrontados com capturas locais.

`02-install.sql.review` contém PRE + corpo + POST em transação, sem `GRANT` e sem stub operacional. `platform_private.b2b_integration_dependencies` permanece always-deny; instalação não significa operação. O rollback é deny-only e preserva histórico.

## Resultados independentes — não somar

1. **53/53, exit 0:** manifesto estático e determinismo.
2. **79/79, exit 0:** PostgreSQL descartável com PRE/install/POST/rerun, comportamento B4, impactos compartilhados e rollback.
3. **132/132, exit 0:** reteste atual de embalagem inteira e unidades fiscais; evidência em `review-458b6012/fiscal-units/evidence-after.json`.
4. **63/63 históricos:** preservados separadamente, sem soma ou reclassificação.

A fixture reproduz ACL/RLS, 35 colunas, 16 constraints, 13 índices e 9 gatilhos capturados de `accounts_receivable`; os 32 gatilhos B3 do harness permanecem habilitados. Isso continua sendo componente sintético, não prova JWT/RLS/Storage/PostgREST.

## MANUAL, parceiro e pedidos atuais

- MANUAL não B2B sem parceiro preserva criação de parcela e baixa legadas, sem `monetary_origin` inventada.
- MANUAL de parceiro sem origem comprovada bloqueia exposição e baixa com `MONEY_ORIGIN_UNPROVEN`, inclusive ao excluir o pedido atual do cálculo.
- Nova simulação do mesmo parceiro fica indisponível e não cria pedido; os pedidos atuais da fixture mantêm estado/hash. O impacto nos dados LIVE existentes **não foi medido** e bloqueia release.
- Crédito e residual legado usam resolvedor monetário interno na organização vendedora. A projeção pública conserva ator, papel financeiro e tenant; o resolvedor interno é owner-only e não recebe grant de cliente.
- Pedido interno sintético e writer integral antigo permanecem contidos, sem título/alocação.

## Unidades fiscais e downstream

`platform_private.b2b_allocate_document(uuid)` exige quantidade/unidade comercial e tributável, reconcilia kg↔g ou L↔ml pelo snapshot, rejeita fração de embalagem inteira e nunca converte peso em volume. O reteste atual cobre 2×25 kg, parcial 1 UN=25 kg, 0,5 UN, 50 kg≠50 UN, divergências, L/ml, parciais, replay e excesso, sem documento ou cobrança real.

Price B3, crédito total, snapshots, primeiro vencimento pela NF e calendário selado foram preservados. Calendário fora da cobertura falha fechado. Nenhum feriado ou regra comercial foi inventado.

## Pendências para o auditor

1. Medir READONLY o impacto em dados LIVE e duplicidades do índice antes de propor release.
2. Revisar MANUAL de parceiro sem apagar histórico, inventar origem/backfill ou abrir writers.
3. Conferir independentemente todos os corpos, overloads, owners, ACLs e relações LIVE.
4. Manter instalação e operação separadas; fiscal, contabilidade, recebíveis reais e comunicação continuam fechados.
5. JWT/RLS/Storage/PostgREST/browser e homologação real permanecem NOT_RUN.

Candidato SHA256: `3b7bd7f1756fb73036ca4a80e3a38aeb5041f0e72dfe208e419b9819a5e64b98`.
Nenhum PASS local autoriza implantação, publicação, emissão, cobrança ou envio.
