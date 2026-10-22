# Coordenação C2 — rascunho parcial INATIVO / NO-GO

Nenhum SQL aplicado, Edge implantada, frontend promovido ou sessão modificada nesta preparação. Não instalar `candidate.sql.review`: montagem parcial, não entrega integral homologada.

## Evidência local

- `python3 build.py`: montagem local determinística de definições arquivadas; corrige terminadores SQL e a transformação inválida `IF OR` encontrada durante execução.
- `python3 test_sql.py`: **49/49 verificações PostgreSQL descartável**, incluindo readers cumulativos, produtor com vínculo real, revogação parcial/total, vínculo futuro, perfil B/vínculo A, histórico limitado e duas transações reais concorrentes CAS.
- Vitest C2.1 existente: **33/33**. Não prova a montagem inteira ou provisionamento cumulativo.
- A criação do schema reduzido reutiliza Auth sintético e entitlement sintético; não certifica JWT/RLS/REST/trigger Auth hosted, monitor ou UI real.
- `b2b_actor_scope` arquivado não é substituído pela montagem; hash esperado `c3f2997746f24bc2efd15db5c0ccc862`. Modelo organização parceira explícita continua não homologado.

## Bloqueios antes da revisão instalável

1. Provisionamento array `claim/finish/compensação/admin_provision`: definições apenas montadas, ainda sem ensaio completo de execução, concorrência, replay e integração de triggers. A coluna proposta `external_roles` só existe no SQL inativo; nenhum backfill feito.
2. O frontend selector/guards/monitor e a Edge `create-user` continuam **runtime singular inalterado**. O pacote não contém ainda o patch integrado desses consumidores; adapters existentes não bastam.
3. Preflight arquivado de funções/ACL/owner não cobre ainda todo drift de constraints e triggers. Rollback deny é rascunho e deve fechar a família completa antes de aceite.
4. Não autorizar por UUID, papel visual ou bucket. Não promover writers isolados. Finanças/documentos/canais de escrita continuam fechados.

## Próximo recorte

Completar os bloqueios acima dentro desta candidata separada, sem aplicação hosted ou publicação automática; rodar montagem integral em PostgreSQL descartável antes de solicitar homologação real A/B. Fixtures fictícias e fiscal seguem posteriores, sem criação nesta rodada.