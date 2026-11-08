# Revisão 40186 — nova execução local, não aprovação

- Planos exatos cc1f6cc: **79/79, exit 0**, PostgreSQL 17.11 descartável, 28 fontes MD5 verificadas. Gerador em espelho produziu quatro SQL/manifesto idênticos. Nenhum SQL original alterado.
- Frontend: **62/62, seis arquivos, exit 0**. Comando em `frontend-command.txt`; warnings React preservados no stderr, não ocultados. Suíte geral não executada nem declarada PASS.
- `local-pg.json`, `lock-revocations.json`: códigos por tenant, padrões e revogação após espera observada; PRE/POST e rollback. Auth/schema/dependências sintéticas declaradas, sem prova hosted.
- `permissions-before.json`, `permissions-after.json`, `permissions-rollback.json` e `permissions-diff.json`: quatro ACL/RLS de tabelas iguais, leitura/regras passam ao recorte proprietário; rollback quatro policies false e RPCs revogados. Os grants da fixture são sintéticos e **não** evidência de ACL live. Helpers privados novos postgres-only; ACLs efetivas em produção dependem do POST/advisors do auditor.
- `catalog-contract-verification.json`: 25 parâmetros/retornos preservados, sem mudar frontend. Seletor operacional mantém staleTime de 5 minutos: recarregar/limpar contexto de sessão após instalação é requisito de homologação, cache não prova leitura fresca.
- `instrumented-test-local-pg.py.txt`: cópia do harness exato com três SELECTs read-only de catálogo acrescentados somente no espelho; assertions/candidato inalterados. Reexecução usa espelho de scripts + supabase read-only, nunca o diretório original para não sobrescrever histórico. Não executar via DSN hosted: cluster usa socket /tmp e porta 55546 com initdb/pg_ctl.
- `logistics-evidence-inventory.json`: 29 arquivos históricos verificados; aponta **final-review-70d08c.json 13/13** e **final-checks.json 40/40**, nunca after.json inexistente. Não é nova execução logística.
- Auditor relatou PRE_OK em READ ONLY/ROLLBACK após comprovar swzpzcwiasxmjutrmvkm por list_projects e coleta de advisors. Nenhuma ferramenta hosted usada aqui. Conteúdo/impacto dos advisors não fornecido: revisão ainda pendente; PRE_OK não é autorização de implantação.

## Antes/depois e reversão

Antes: papel isolado permitia listar/escrever planos estrangeiros; código/padrão globais. Depois: ator ativo/tenant proprietário e reautorização pós-lock; comprador somente vínculo publicado vigente; ambiguidades negadas, código/padrão por tenant. Mesmos contratos e dados/snapshots preservados. Catálogos de meios/categorias continuam referência, sem concessão nova.

Em incidente o auditor, somente com autorização, usa `04-rollback-deny.sql.review` SHA256 6af8ffdda88c6b0026d427f4b0459c3d86a74f25e3083abe44d4ad05675531a3. Rollback fecha RPCs/policies sem remover coluna/índices/guards ou restaurar leak. Confirmar consultas zero/permission denied, contagens/snapshots preservados e nova leitura de ACL/policies; registrar indisponibilidade no frontend e não tentar writer legado. Sem rollback histórico vulnerável ou limpeza de dados.

## Pendências externas

Revisão independente final; revisar advisors reais antes/depois; instalação manual expressamente autorizada, POST e reteste real ARBio/FSF/comprador. Teste autenticado parcial preparado em `../../../b2b-downstream-audit-20261107/order-e2e-new-20261108/authenticated-partials-review-40186.md`; não executado, exige ambiente seguro e caller legítimo da OS privada, sem grants/bypass. Fiscal integrado positivo NOT_RUN_BLOCKED_REAL_ALWAYS_DENY; contabilidade real pendente. Sem hosted/publicação/efeitos externos/delegação.
