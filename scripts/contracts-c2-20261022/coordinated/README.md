# Coordenação C2 — implementação candidata INATIVA / NO-GO

Nenhum SQL aplicado, Edge implantada, frontend promovido ou sessão modificada nesta preparação. Não instalar `candidate.sql.review` antes da revisão independente e dos gates abaixo.

## Evidência local

- `python3 build.py`: montagem local determinística de definições arquivadas; corrige terminadores SQL e a transformação inválida `IF OR` encontrada durante execução.
- `python3 test_sql.py`: **49/49 verificações PostgreSQL descartável**, incluindo readers cumulativos, produtor com vínculo real, revogação parcial/total, vínculo futuro, perfil B/vínculo A, histórico limitado e duas transações reais concorrentes CAS.
- Vitest C2.1 existente: **33/33**. Não prova a montagem inteira ou provisionamento cumulativo.
- `test_provisioning.py`: **19 verificações** com claim cumulativo, concorrência de dois chamadores, Auth sintético, triggers canônicos capturados, conclusão, falha injetada no último write/rollback, replay após revogação parcial e compensação somente após ausência Auth comprovada.
- `test_integral.py`: **34 verificações** na mesma base local, montando readers+provisionamento+lifecycle e executando rollback deny-only; ACL anon/authenticated/service_role e papéis residuais preservados. Não executa a migration completa contra uma réplica exata do schema hosted.
- Edge `edge/create-user/index.ts` fora auto-deploy: **9/9 testes Deno**; criação única, replay, claim malformado, compensação de recibo próprio, metadata alheia sem delete, tenant forjado, papel interno e configuração divergente negados. SDK substituído por doubles; nenhuma chamada hosted.
- Contrato frontend cumulativo: **11/11 Vitest**; três portais, ator/tenant, papéis residuais e produtor sem vínculo. Integração adicional **3/3** com página SelecionarPortal, hook candidato e QueryClient reais: escolha por RPC canônica, revogação parcial e retorno tardio após pausa. Auth e RPC são doubles; não certifica árvore AuthProvider/MobileLayout completa ou JWT real.
- A criação do schema reduzido reutiliza Auth sintético e entitlement sintético; não certifica JWT/RLS/REST/trigger Auth hosted, monitor ou UI real.
- `b2b_actor_scope` arquivado não é substituído pela montagem; hash esperado `c3f2997746f24bc2efd15db5c0ccc862`. Modelo organização parceira explícita continua não homologado.

## Bloqueios antes da revisão instalável

1. Corpos readers+lifecycle+provisionamento+rollback passam na mesma cadeia local; **migration integral com schema hosted completo ainda não certificada**. A coluna proposta `external_roles` só existe no SQL inativo; nenhum backfill feito.
2. `frontend/coordinated.patch`, manifesto SHA256 e oito cópias completas incluem resolver, preferência via RPC existente, guards, monitor AuthProvider e seletor. Runtime singular inalterado. Faltam provas integradas da árvore real e revisão de consumidores transitivos, especialmente modo produtor/técnico MobileLayout, cadastro administrativo e mudança de papéis durante monitoramento. Não promover apenas estes oito arquivos.
3. Captura read-only canônica de 22/10 embutida em `candidate.sql.review`: guard assertivo de 16 relações, colunas/defaults, constraints/indexes, ACL/RLS/policies e triggers com hash/owner/ACL. Drift aborta antes de mutar. Rollback local/ACL verificados; antes da instalação o auditor deve repetir o preflight no destino e validar a montagem integral, sem aceitar baseline fiscal+C2 aplicado em ordem divergente.
4. Não autorizar por UUID, papel visual ou bucket. Não promover writers isolados. Finanças/documentos/canais de escrita continuam fechados.

## Próximo recorte

Completar os gates acima dentro desta candidata separada antes de aceite instalável. Refinamento fiscal local entregue em paralelo, sem criação de fixtures: ver `scripts/fiscal-products-refinement-20261022/README.md`. Financeiro próprio/documentos continuam inativos.
## Pacote integral (2026-10-22)
Superado para instalação pelo pacote único `scripts/contracts-c2-20261022/integral/` (SQL C2+financeiro numa transação, manifesto frontend de 18 arquivos). Não instalar este pacote isoladamente.
