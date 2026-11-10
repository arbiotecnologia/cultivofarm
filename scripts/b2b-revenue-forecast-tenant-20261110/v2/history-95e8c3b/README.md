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
Pendência: confirmar no PRE hospedado o MD5 LIVE de is_financial_staff (pin `…ebfe2`; revisão anterior citou `…ebfe6`).
