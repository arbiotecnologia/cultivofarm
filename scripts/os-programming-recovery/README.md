# Programação inicial manual — executável para revisão externa

Recupera somente `rpc_programar_os_v1(uuid,text,date)` e o diálogo existente. OS manual previamente aprovada, uma programação aguardando já existente, responsável UUID/texto vazio, item biológico e actor/tenant/readiness/SaaS/RBAC/cadeia corrente obrigatórios. Não autoaprova, fabrica, cria programação/lote, reprograma data diferente nem libera B2B/onfarm/entrega/aplicação já vinculada. Replay idêntico não cria evento.

**Não aplicado/publicado.** Auditor deve revisar e executar PRE integral. A candidata não depende mais de TEMP TABLE nem exceção incondicional: PRE → definição → ACL mínima somente dessa RPC para authenticated → POST → COMMIT; erro aborta tudo. Nenhuma outra RPC recebe EXECUTE.

Rollback autocontido, inclusive em outra conexão: POST → definição EXATA `a42d6b07f51e6dacf41096f6cefb8163` → ACL `{postgres=X/postgres,service_role=X/postgres}` → PRE → COMMIT. Definição e ACL restauradas/verificadas localmente em conexão independente; não usa HEAD móvel, não chama corpo antigo e não desfaz dados/histórico de programação já realizada. Baseline UI fixo e6a67/c30af no manifest; pre/post distintos.

## Catálogo transitivo e travas

Capturas SELECT do ref canônico em `catalog.json`, `transitive-catalog.json`, `schema-catalog.json`, `refresh-catalog.json`: definições/schema, nunca tokens ou dados privados. Todos os predicados suplementares compilaram/avaliaram no PostgreSQL local; os quatro arquivos integrais recusaram o clone incompleto sem alterar definição/ACL. PRE/POST preservam contratos aprovados e acrescentam fingerprints de entitlements, readiness/invites, has_role, todos 23 triggers de OS/programação, constraints/FKs, índices, schema e views transitivas do refresh.

Removidos SHARE globais de links/lotes/subscriptions/overrides. OS/programação FOR UPDATE e FKs imediatas cercam inserção/movimentação para o alvo. Organização FOR UPDATE mais rows da empresa cercam subscription/override. Mantidos SHARE com timeout em invites (user_id sem FK), onfarm (colisão ID sem FK manual) e quatro tabelas globais do catálogo publicado. Não retirar SaaS nem substituir phantoms por advisory/GUC.

`refresh_esteira_laboratorio` continua global e fechado ao cliente. Preservados dois refreshes internos existentes (programação pelo downstream + OS); retirado somente UPDATE redundante da programação, sem refresh explícito extra. Não reescrever/desativar triggers/views. Lock timeout 3s; instalação statement_timeout 15s. Disputa real de REFRESH local abortou status/evento integralmente. Carga, latência e ordem de writers externos NÃO certificadas.

## Evidências

- `python3 test-local.py` executa `test-real-local.py`, substituindo o harness anterior com helpers VOLATILE fake.
- 40 verificações locais em `real-test-results.json`: STABLE/readiness/entitlements reais, todos 23 triggers alvo, views reais do refresh; inactive/profile, role deletion, SaaS, tenant/alçadas, aberta sem autoaprovação, B2B, replay, duas conexões, FK link/lote, refresh/timeout, baseline/ACL exatos e SET ROLE authenticated/anon. Baseline a42d6 e fingerprint entitlements conferidos ANTES de montar rollback.
- Schema local: todos tipos/colunas públicos, PK/UNIQUE/FKs capturadas, CHECKs alvo/Auth/SaaS/referências. Não é clone de todos os triggers/policies alheios ao recorte. Auth UID/JWT sintéticos e SET ROLE local NÃO são JWT hosted.
- Vitest focal OS 71/71 (inclui programação/aprovação); warnings preexistentes de descrição do diálogo, sem falhas.
- `assemble.py`: pacotes protegidos/commits fixos; `test_stage.py`: 6/6; `stage.py candidate|rollback /tmp/destino-vazio`: só fonte UI.
- `snapshot-final/` e `delta.patch`: fonte atual e delta contra c30af fixo para checker; materialização verifica todos bytes. Typecheck app/node reservado ao checker (não executado manualmente); build automático consultar log.

**PRE/POST integral hosted: UNVERIFIED. Authenticated path: UNVERIFIED.** Ensaio local de restauração da definição/ACL não equivale a execução integral da migration em schema hospedado. Prévia pública não forneceu prova autenticada. Histórico, anexos, TOKEN_REFRESHED real, revogação hosted de papéis, v6/contratos não recebem PASS. Recibos externos anteriores permanecem distintos.

Recibo independente informado às 15:28: PRE 622048 hosted PASS somente para o conjunto já coberto, Vitest 53/53 PASS, tsc app ainda rodando. Não equivale a PRE suplementar atual/POST ou typecheck concluído. Os dois corpos fornecidos coincidem com as capturas utilizadas, sem mudança de semântica; somente terminador SQL acrescentado à fonte de rollback.

Sem DDL/DML hosted, deploy/publicação, nova fixture hospedada, alteração OS B/produto/roles/perfis ou pacotes c30af/e6a67. Uma chamada indevida vazia ao tool run_sql foi rejeitada antes de qualquer execução (nenhum SQL/DML enviado); preservado registro desta limitação no relatório. Auditor revisa/aplica com preflight fail-closed.
