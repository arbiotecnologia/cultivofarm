# Coordenação C2 — implementação candidata INATIVA / NO-GO

Nenhum SQL aplicado, Edge implantada, frontend promovido ou sessão modificada nesta preparação. Não instalar `candidate.sql.review` antes da revisão independente e dos gates abaixo.

## Evidência local

- `python3 build.py`: montagem local determinística de definições arquivadas; corrige terminadores SQL e a transformação inválida `IF OR` encontrada durante execução.
- `python3 test_sql.py`: **49/49 verificações PostgreSQL descartável**, incluindo readers cumulativos, produtor com vínculo real, revogação parcial/total, vínculo futuro, perfil B/vínculo A, histórico limitado e duas transações reais concorrentes CAS.
- Vitest C2.1 existente: **33/33**. Não prova a montagem inteira ou provisionamento cumulativo.
- `test_provisioning.py`: **19 verificações** com claim cumulativo, concorrência de dois chamadores, Auth sintético, triggers canônicos capturados, conclusão, falha injetada no último write/rollback, replay após revogação parcial e compensação somente após ausência Auth comprovada.
- Edge `edge/create-user/index.ts` fora auto-deploy: **9/9 testes Deno**; criação única, replay, claim malformado, compensação de recibo próprio, metadata alheia sem delete, tenant forjado, papel interno e configuração divergente negados. SDK substituído por doubles; nenhuma chamada hosted.
- Contrato frontend cumulativo: **11/11 Vitest**; três portais, ator/tenant, papéis residuais e produtor sem vínculo. Não certifica interação integral do seletor/monitor.
- A criação do schema reduzido reutiliza Auth sintético e entitlement sintético; não certifica JWT/RLS/REST/trigger Auth hosted, monitor ou UI real.
- `b2b_actor_scope` arquivado não é substituído pela montagem; hash esperado `c3f2997746f24bc2efd15db5c0ccc862`. Modelo organização parceira explícita continua não homologado.

## Bloqueios antes da revisão instalável

1. Montagem integral migration+readers+lifecycle+provisionamento+rollback na mesma cadeia ainda não certificada; os dois harnesses exercitam recortes complementares. A coluna proposta `external_roles` só existe no SQL inativo; nenhum backfill feito.
2. `frontend/coordinated.patch`, manifesto SHA256 e oito cópias completas incluem resolver, preferência via RPC existente, guards, monitor AuthProvider e seletor. Runtime singular inalterado. Faltam provas integradas da árvore real e revisão de consumidores transitivos, especialmente modo produtor/técnico MobileLayout, cadastro administrativo e mudança de papéis durante monitoramento. Não promover apenas estes oito arquivos.
3. Preflight estrutural agora inventaria colunas/defaults, constraints, indexes, ACL/RLS/policies, todos os triggers não internos e hash/owner/ACL de seus corpos em 16 relações. **Ainda requer captura fresca e comparação assertiva**; inventário sozinho não é guard automático de instalação. Rollback fecha public/private writers/claims/finish, mantém compensação service-only e torna contextos externos deny-only; execução integral do rollback e ACL pós-rollback ainda pendentes.
4. Não autorizar por UUID, papel visual ou bucket. Não promover writers isolados. Finanças/documentos/canais de escrita continuam fechados.

## Próximo recorte

Completar os gates acima dentro desta candidata separada antes de aceite instalável. Refinamento fiscal local entregue em paralelo, sem criação de fixtures: ver `scripts/fiscal-products-refinement-20261022/README.md`. Financeiro próprio/documentos continuam inativos.