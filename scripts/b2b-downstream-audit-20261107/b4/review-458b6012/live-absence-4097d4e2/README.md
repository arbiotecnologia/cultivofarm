# Revisão 4097d4e2 — projeção ausente e títulos MANUAL

**INATIVO, BLOQUEADO E NÃO APROVADO.** Somente código e PostgreSQL descartável. Nenhuma consulta ou escrita hospedada foi feita pelo agente; os fatos LIVE são relatos READONLY do auditor em `b4/live-readonly-4097d4e2.json`.

## Fatos incorporados

- `public.rpc_receivable_money_projection_v1` foi relatado como inexistente em todos os overloads. Nenhum corpo/baseline foi inventado: PRE exige zero overloads pelo nome em `pg_proc`; POST exige exatamente um overload owner-only.
- Writers e índice usam os MD5, owners, ACLs e definição relatados: `fn_generate_receivable_installments()` `f632f15c…7ea1`, `rpc_register_receivable_payment(uuid,jsonb)` `db41f7e2…f365` e `ux_ar_one_active_per_b2b_order`.
- A instalação não contém `GRANT`, não reabre writers antigos e não habilita `b2b_integration_dependencies`; a dependência real permanece always-deny. O stub operacional existe somente no harness depois da negação real.

## Correções desta revisão

1. A baixa `MANUAL` não B2B sem parceiro conserva a matemática legada, sem inventar `monetary_origin` ou exigir projeção.
2. Título B2B ou qualquer título que afete parceiro exige origem monetária comprovada. MANUAL de parceiro sem origem bloqueia exposição e baixa com `MONEY_ORIGIN_UNPROVEN`.
3. O crédito e o residual legado usam `platform_private.b2b_proven_money_row_internal(uuid,uuid)` na organização vendedora. A projeção pública continua validando ator, papel financeiro e tenant; o resolvedor interno é owner-only e não tem grant de cliente.
4. PRE/POST comparam tipos completos, constraints, índices e gatilhos em ordem canônica. A fixture reproduz ACL/RLS, 35 colunas, 16 constraints, 13 índices e os 9 gatilhos capturados de `accounts_receivable`; os 32 gatilhos B3 do harness permanecem habilitados.

## Resultados independentes — não somar

- **53/53, exit 0:** manifesto/determinismo em `evidence-manifest-tests.json` e `test-manifest.*`.
- **79/79, exit 0:** PRE, instalação transacional, POST, rerun fail-closed, operação, impactos e rollback em `evidence-b4-shared-impact.json` e `test-shared.*`.
- **132/132, exit 0:** reteste da normalização fiscal no candidato atual, em `../fiscal-units/evidence-after.json` e `test-fiscal-units.*`. Fração de embalagem, divergência de unidade e peso→volume continuam negados.

O histórico 63/63 e os resultados anteriores não foram somados nem promovidos a E2E. Falhas de desenvolvimento e diagnósticos ficaram preservados neste diretório; os artefatos anteriores estão em `historical-pre-facts/`.

## Impacto medido no PostgreSQL descartável

- MANUAL não B2B sem parceiro: criação de parcela e baixa legadas preservadas.
- MANUAL não B2B com parceiro: exposição bloqueada mesmo ao excluir o pedido atual; baixa bloqueada; nova simulação do mesmo parceiro ficou indisponível e não criou pedido.
- Pedidos atuais da fixture mantiveram estado/hash; nenhum histórico foi apagado e nenhuma proveniência foi fabricada.
- Pedido interno sintético continuou contido sem título/alocação; writer integral antigo permaneceu fechado.
- Parciais, replay, baixa, substituição de centavos, concorrência, calendário, cancelamento e rollback deny-only passaram como componente sintético.

## Bloqueios para o auditor

1. Medir em READONLY os dados LIVE afetados por MANUAL de parceiro sem origem e o preflight de duplicidades do índice; o resultado sintético não mede o impacto real existente.
2. Conferir independentemente corpos, overloads, owners, ACLs, tabela, constraints, índices e gatilhos LIVE antes de qualquer decisão de instalação.
3. Revisar a reconciliação de títulos MANUAL sem apagar histórico, inventar origem/backfill ou abrir writers.
4. JWT/RLS/Storage/PostgREST/browser, NF/cobrança/contabilidade reais e homologação permanecem NOT_RUN.

Candidato SHA256: `3b7bd7f1756fb73036ca4a80e3a38aeb5041f0e72dfe208e419b9819a5e64b98`.
Instalação candidata SHA256: `4ffd113cbeb89c5f4b50b67f156ab6656e9256f6f73d817eec9541e4dd4cd3ed`.
Nenhum PASS local autoriza implantação, publicação, emissão, cobrança ou envio.
