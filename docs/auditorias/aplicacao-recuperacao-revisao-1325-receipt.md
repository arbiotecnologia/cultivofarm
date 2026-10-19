# Recibo final da revisão pequena — aplicações e diagnóstico

## Entrega revisável, não implantação

- SQL: `scripts/application-recovery/candidate.sql.review` SHA256 `dbb947cd26eb33403f07c5fcf515fe5068e69b20eaa9103d73947355ef20341a`.
- Manifesto recuperação: `d81c9d8799c1a559f7d98457d9367a0608bfbac11e01c75a9330b6ffdaddb6b6`.
- Manifesto diagnóstico isolado: `scripts/authz-diagnostics/manifest.json`, SHA256 `866d6ed19a2d02969110f8b6313c372d13e3d194af073c773f6cccfdc7ecec3d`.
- POST RPC `f8bc9d5f000abef7f13e6ca340988734`, Storage1 `daefb183522e2ee7f730e0db243f4823`. Helper leitura implantado `04067ba43cea3eed845a1fd3735061e0` preservado.
- Preflight READ ONLY e rollback SQL integral em `scripts/application-recovery`; sem execução hosted pelo agente. Guardas16 funções/ACL/owner/search_path/schema. Rollback restaura writer fechado e Storage baseline, preserva dados/recibos; reaplicação não apaga destino ocupado.
- Rollback frontend recuperação e diagnóstico são separados e protegidos; stage valida todos hashes antes de escrever fora do checkout. Não restaurar gates/recibos/PDF/Edges indiscriminadamente.

## Verificações executadas pelo agente

### P0 informado às13:35: guarda não implantável

Auditor executou preflight REAL READ ONLY canônico e recebeu42601 no CASE da comparação ACL. Nenhuma mutação ocorreu; RPC continua fechada. Parênteses adicionados na fonte compartilhada e nos quatro SQL gerados, mantendo arrays exatos: legacy_closed somente postgres; demais authenticated/postgres/service_role. A execução integral local também descobriu42702: variável `roles` colidia com coluna de `pg_policies`. Variável renomeada `v_executor_roles`, conforme correção exata auditada às13:37, sem alterar `roles::text` de pg_policies, expressão/fingerprint de schema, expectativas ACL ou corpos RPC/Storage/PDF.

- PostgreSQL local atualizado: **107/107**. Mutação removendo os parênteses reproduz42601; quatro arquivos completos passados diretamente a psql, bytes/hashes conferidos antes/depois, nenhuma substituição de guarda nessa prova, compilaram e recusaram catálogo reduzido comP0001 `application_schema_policy_trigger_drift`, atomicamente. Recibo `scripts/application-recovery/results.byte-exact.json`.
- **Limite aberto:** não há reprodução local integral equivalente do catálogo de produção; esses quatro resultados não são PASS da guarda integral nem implantação positiva byte-exata. Instalação/rollback positivos anteriores continuam usando substituições explicitamente locais e NÃO validam essa guarda. Auditor informou às13:37 PASS integral hosted READ ONLY das16 funções/corpos/ACL/search_path/owner e schema/triggers/policies, applications0/evidence0/receipt_destination_free=true, após as duas correções. Evidência indicada pelo auditor: `recovery-preflight-corrected2-readonly.json` (não executada nem inspecionada pelo agente). Nenhum DDL/DML; RPC permanece fechada. Esse PASS de preflight não certifica implantação/rollback positivos nem homologação de cadastro/anexo.
- Preflight SHA256 `669701e36e8e0bc9d567014da285fef80dfbe03ffeac419c0798509fcf735f46`; rollback `2057081a6c8f09c1ee60fe54e86e58fea6d7171fa1e40dbd6169df3aa476b60c`; postflight `0498ea819da11e76517d17961fc758e7ce0f6cd82f1b030609292b66b1ac8393`. Manifesto/SHA256SUMS atualizados; hashes POST dos corpos inalterados.

- PostgreSQL descartável: **104/104**, claims/RLS/schema reduzidos. Casos mixed-role ativo/revogado entre fases, responsável inativo/sem role, status manual/onfarm, replay/concorrência/retificação/rollback. Não é JWT real nem Storage bytes/SDK hosted; cópias integrais locais substituem explicitamente guardas do catálogo reduzido, candidata real recusa esse catálogo.
- Vitest dirigido: **194/194**,12 arquivos, inclui aplicações/PDF44/monitores/diagnóstico. RTT3s90s financeiro/admin e suspensão fake não certificam a causa das pausas reais.
- Staging: recuperação **4/4**, diagnóstico **4/4**.
- Compilação automática: entradas `build OK` até13:31:52Z; Vite/SWC não é recibo de tipos semânticos.
- Pacote PDF anterior preservado pelos hashes protegidos e regressão44/44.

## Checker independente: recibo e novos inputs

Auditor informou `tsc -p tsconfig.app.json --noEmit` primeira execução EXIT0 e119/119 Vitest na exportação anterior1668 arquivos. Não foi execução deste agente e não certifica alterações posteriores.

Novo snapshot recuperável: `scripts/typecheck-compact/snapshot-revision-1325/manifest.json`, SHA256 `8d4048d60c84269730d2c0d5375a748130e1a2444fa710f82a60bc6da83cb244`, **1670 arquivos /26 partes UTF-8**, materializado e comparado byte a byte com checkout atual. Snapshot anterior permanece intacto. O `source_head` identifica HEAD no instante de exportação; hashes por arquivo são autoridade para inputs, não uma promessa de SHA final do gerenciamento automático.

```sh
python3 scripts/typecheck-compact/materialize.py scripts/typecheck-compact/snapshot-revision-1325/manifest.json /tmp/cultivofarm-revision-check
# No checkout materializado, com dependências instaladas com scripts desabilitados:
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Registrar versão, comando, log, exit code e SHA manifesto. **Tipos dos novos inputs NÃO CERTIFICADOS**: checker manual proibido neste ambiente; build ou `tsc --noEmit` raiz files vazio não substituem esse passo. Nenhum código alterado para esconder erros de tipos.

## Limites e dependências executáveis

Pai B real informado pelo auditor preservado; fixture não duplicada. OS INSERT exige aberta e approval/advance RPCs continuam fechadas. Nova aplicação exige entregue/pronto_entrega/envase e retificação também admite finalizada: positivo A/B/PDF está bloqueado até avanço canônico autorizado/revisado ou pai sintético elegível prévio com origem comprovada. Não forjar status, desabilitar guards, finalizar OS comercial ou enviar comunicações.

Admin B pausou~13:15/~13:19 sem edição conhecida; causa desconhecida. Ring local80 somente admin exclusivo disponibiliza reason/visibility/online/RTT/deltas para captura futura antes de retry. Mantém lease≤15s, timeout/offline/erro destrutivos; não atribui causalidade retroativa nem registra PII/token/URL/fingerprint.

Sem DDL/DML hosted, Edge deploy, publicação, alteração de perfil/fixture/sessão, contratos B2B ou ativação global v6. Browser positivo não executado: depende da implantação revisada e da OS elegível, não alegar homologação real com laboratório.