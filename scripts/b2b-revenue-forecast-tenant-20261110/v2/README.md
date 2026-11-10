# Leitor tenant V2 — REVIEW_ONLY_INACTIVE_NOT_APPROVED (substitui 2c1034c, preservado na raiz)

Ordem: B4 composição já instalada → `01-pre.sql.readonly` → `02-install.sql.review` → `03-post.sql.readonly`; rollback deny-only `04-rollback-deny.sql.review`.
Gerado por `build.py` (pins de `forecast-pre-nf-20261109/projection-reader-pins.json`, ACL normalizada com grantor e grant option copiada do estágio 14).
PRE pina corpo/owner/ACL de is_financial_staff, h15_actor_organization, _saas_user_has_feature, b2b_proven_money_row_internal, b2b_allocation_money_row, b2b_legacy_money_row; exige tabelas e ausência de V1/V2.

Contrato `B2B_REVENUE_FORECAST_TENANT_V2`:
- Título confirmado só quando `b2b_proven_money_row_internal` devolve `b2b_document_allocation_v1` (documento AUTHORIZED, digest/pedido/parceiro/emissor coerentes), sem reversão, pedido/parceiro/emissor e previsão coerentes, status OPEN/PARTIAL/PAID/OVERDUE, vencimento não nulo e saldo canônico ≥ 0 (sem `greatest`).
- Origem legada (mesmo comprovada pelo resolvedor), não comprovada ou inconsistente: só contagem em `titles_unavailable`, nunca valor.
- Residual: previsão viva com pedido/parceiro/emissor coerentes; divergentes só contados.

Prova: cadeia composta real `order-e2e-new-20261108/evidence/attempt-222` (exit 0, 57 checkpoints + 41/41 casos V2 em `revenue-tenant-v2/cases.json`, 38 gatilhos íntegros, arquivos byte a byte iguais aos deste diretório).
Tentativas 219 (executor errado, falha na etapa OS anterior ao leitor), 220/221 (defeitos do harness) preservadas.
Limites: Auth sintética; falhas injetadas em transações revertidas (replica/DDL); restauração sem títulos teste4 — caso legado só por injeção; origem `legacy` comprovada não foi exercida positivamente. Não prova JWT/RLS/Storage hospedado.
PRE V2 hospedado readonly executado pelo revisor (95e8c3b): PASS, is_financial_staff `…ebfe2` sem drift. Novo corpo exige novo PRE/revisão antes de instalar.

## Revisão 95e8c3b — consistência de leitura (attempt-224)
Defeito confirmado no corpo 95e8c3b (preservado em `history-95e8c3b/`, md5 corpo anterior no manifesto histórico): os auxiliares B4 são VOLATILE e o leitor faz várias consultas; sob READ COMMITTED cada uma usa snapshot próprio.
Reprodução real em duas+ conexões (`revenue-tenant-v2/read-consistency.json`): sonda do corpo antigo parada entre títulos e residual, NF2 confirmada pelo callback canônico em outra conexão → **MIXED** 1 título/9 + residual 747 = 756 (pré 9+756=765, pós 18+747=765).
Correção (`reader.sql`, md5 corpo `d9a1c488067897ceaf216f2d1a0ebf3d`): impressão digital tableoid/ctid/xmin de todas as linhas do escopo lidas pelo leitor e pelo motor (AR, parcelas, pagamentos, auditoria INSERT, parceiros, pedidos, vínculos, cronograma, snapshots, alocações, documentos, reversões, previsões) antes e depois do cálculo; só devolve se idênticas, senão recalcula (máx. 3) e falha fechado `40001 B2B_REVENUE_FORECAST_CONCURRENT_CHANGE` (tela: indisponível). Sem locks, sem escrita, writers/gates intocados; contrato JSON inalterado.
Resultados com espera provada (pg_stat_activity Lock + pg_blocking_pids + advisory:ShareLock não concedido): NF2 antigo MIXED / novo POST; pagamento 9 antigo PRE / novo POST; cancelamento do residual antigo POST / novo POST. Novo nunca MIXED.
Cadeia final `rebuild_current.py` attempt-224: exit 0, 57 checkpoints, 41/41 casos V2, 38 gatilhos íntegros; arquivos 01–04 byte a byte iguais a este diretório (ver SHA256SUMS). attempt-223 = executor errado (`rebuild.py`, falha na etapa OS anterior), preservada.
Limites: sondas são cópias com 2 linhas alteradas (nome + `pg_advisory_xact_lock_shared`), registradas em `read-consistency-probes.json`; o corpo instalado não tem ponto de pausa determinístico. Esgotamento das 3 tentativas (40001) não foi exercitado; ABA por INSERT+DELETE físico de linha do escopo entre as leituras não é detectável (tabelas B4 append-only/imutáveis). Não prova JWT/RLS hospedado.
