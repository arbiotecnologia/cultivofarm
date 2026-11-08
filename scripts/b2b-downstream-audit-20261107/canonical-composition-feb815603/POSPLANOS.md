# Uso desta composição após a instalação de planos

Em 08/11/2026 21:45 UTC o auditor relatou que `commercial-plans-tenant-20261108/02-install.sql.review` (`cc1f6cc…`) já foi instalado em `swzpzcwiasxmjutrmvkm` pela migration `commercial_plans_tenant_isolation_reviewed_20261108`, com PRE_OK/POST_OK.

**Não executar `02-install.sql.review` desta composição na produção atual.** Ele contém a etapa de planos e seu PRE exige o estado anterior (`organization_id` ausente); reexecutá-lo seria incompatível e fail-closed. Também não executar `04-rollback-deny.sql.review` como reversão de outro recorte, pois ele inclui contenção de planos.

Uma eventual revisão B4/ponte deve:

1. capturar novamente a produção POSPLANOS em READ ONLY e comparar todos os pins;
2. começar por `stages/01-b4-pre-post-composition.sql.readonly`, não pelo PRE anterior de planos;
3. revisar separadamente `stages/02-b4-install-post-composition.sql.review`, `stages/03-b4-post.sql.readonly` e `stages/04-bridge-install.sql.review`, com autorização específica e gates/efeitos externos desligados;
4. preservar o isolamento de planos em qualquer rollback; nunca reabrir o vazamento;
5. manter `b2b_integration_dependencies` real always-deny. O positivo fiscal integrado continua NOT_RUN_BLOCKED_REAL_ALWAYS_DENY.

A execução local nova `order-e2e-new-20261108/evidence/review-postplans-2145/` passou 41/41 nessa ordem, sem operação hospedada. Isso não aprova instalação. Baseline completa: `../production-postplans-baseline-20261108.md`.
