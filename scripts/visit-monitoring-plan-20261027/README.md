# Plano canônico de monitoramento — candidato INATIVO

## Atualização 27/10 01:19 — não reaplicar pacote inicial

Auditor informou instalação externa visit_monitoring_plan_atomic_cas_20261027/publicação449b1f, seguida de perda real por autosave na página. Core está contido na captura readonly atual. Correção/proteção NOVA ainda inativa em `preservation/README.md` e `preservation/candidate.sql.review`. Evidências antigas abaixo são históricas; não representam estado atual de instalação nem homologação da correção de autosave.

Base publicada informada: `e88b588eabb14ef81a9f94f1f7e65e7204eead3a`. HEAD encontrado antes da mudança: `1d8d11cff3aad38d43d5648e03eeecb0a0ce709d`; não foi feito checkout/reset nem presumida identidade entre bases.

## Decisão de modelo

`tipo_alerta` não contém `monitoramento`. `Nutrição`, `Estande` e `Clima` no plano são assuntos a observar, não diagnóstico de praga/estresse. Portanto este recorte NÃO cria `alertas_agronomicos.registro_origem_id`: isso exigiria um diagnóstico/tipo real explicitamente escolhido em operação agronômica autorizada, ainda inexistente no editor. Não existe fixture/vínculo fabricado.

Autoridade do plano permanece no bloco textual de `registros_consultor.observacoes_tecnicas` e na `data_proxima_visita`; `monitoramento_avisos` recebe apenas aviso derivado, tipo técnico reservado `plano_monitoramento`, ligado por `registro_consultor_id`. Não é armazenamento alternativo dos assuntos/frequência/gatilhos. Não reutiliza nem altera avisos `monitoramento_pos_visita` ou de entrega/notificação. Não dispara comunicação. Nenhum alerta climático é lido, adotado ou alterado.

## Fluxo e arquivos

- `src/pages/VisitaTecnica.tsx`: montagens responsivas existentes preservadas; editor também no ramo rascunho/em_andamento com necessidade monitorar, can_edit e isReadOnly. Finalizadas somente leitura. Sucesso pede refresh explícito do workspace e visita, não rebaseia edição.
- `src/components/visita/PlanoMonitoramentoEditor.tsx`: display exclusivamente do envelope autorizado (plano/data/origem do aviso); draft independente. Snapshot de campos e versão ao abrir; sem refetch no save. Sucesso retira revisão antiga, bloqueia reabertura com envelope anterior e segunda edição captura N+1. PT409/22023/negação confirmados preservam draft e exigem Reconsultar e revisar + confirmação antes de nova tentativa. Consulta mostra plano atual e edição, não envia mutação. Timeout/retorno incompleto não liberam chave; mesmo PT409 posterior a envio incerto não autoriza descarte. Troca de scope fecha/limpa formulário e aborta chamada.
- `src/hooks/useSalvarPlanoMonitoramento.ts`: RPC `rpc_salvar_plano_monitoramento_visita_v1(uuid,integer,jsonb,uuid)`; JSONB objeto com exatamente `ok,registro_id,version,aviso_id,data_referencia,plano,request_id`. Exige alvo/payload/chave/data e versão `observada+1`; array/retorno incompleto não são sucesso. Não há fallback direto nem retry automático.
- `candidate.sql.review`: transação com guard de hashes LIVE e ausência prévia da instalação, wrapper INVOKER/core privado DEFINER; tabela privada de recibos inacessível a authenticated. Não usar `visitas_logs` para autorizar replay: a policy atual permite INSERT de clientes.
- `preflight.sql` / `postflight.sql`: somente leitura, metadados/hash/ACL. A origem canônica do projeto deve ser comprovada pelo executor antes de abrir conexão: o nome `postgres` do banco sozinho não comprova ref.
- `rollback-containment.sql.review`: contenção, não restauração destrutiva. Preserva tabela/recibos/histórico; não reintroduz writes diretos. Reinstalação após contenção requer rebase independente, não reaplicar candidato com PRE ausente.
- `*.live.sql`: snapshots somente leitura das nove funções inspecionadas. Não são scripts de instalação.
- `client.diff`, `sql.diff`, `tests.diff`, `SHA256SUMS`: alterações/hashes para revisão.

## CAS, locks e atomicidade

Gate existente `cf_user_guards_v1.state FOR UPDATE` → visita por `_visita_lock_and_check` → aviso genérico. Revalida actor/manage/tenant após gate, visita e aviso. Tenant/fazenda/cliente/talhão derivam da visita, nunca de props/URL. Versão NULL/<=0/stale → PT409. Replay de recibo privado só após autorização vigente; mesma chave/payload dá resultado original, payload distinto PT409. Logs e recibo são gravados junto com plano/aviso; falha desfaz tudo.

Trigger LIVE `enforce_visit_immutability` já faz `OLD.version+1`; UPDATE explícito e RETURNING devem confirmar exatamente +1, não +2. Finalizado/aprovado/reprovado permanecem bloqueados. Bloco textual legado malformado/ambíguo e aviso reservado duplicado geram conflito, não são corrigidos silenciosamente.

Reprogramação LIVE usa gate → alerta → visita. Este candidato NÃO trava alertas e obtém o mesmo gate antes da visita; portanto não cria a inversão visita→alerta. Callers legados da ativação não travam alerta/gate depois da visita. Isso é análise dos corpos capturados, não certificação de toda cadeia de triggers hosted. Nenhuma alteração nos RPCs atuais criação/status/reprogramação/ativação.

## Revisão independente de 35815468

Os seis bloqueios receberam correção local; nenhuma instalação/publicação. RPC nova ainda não instalada: erro permanece visível, sem fallback. Aviso mostrado é `workspace.monitoramento` do tipo plano_monitoramento e ligado à visita atual, nunca alerta agronômico. O contrato `alertas_agronomicos.registro_origem_id` continua não homologado e não é concluído pela existência de aviso.

Data passada gera 22023 no core usando `(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date` APÓS replay autorizado. Resultado confirmado continua replayável mesmo após passar a data. UI usa o mesmo fuso. Guard/lock/ACL/imutabilidade não foram relaxados.

**Divergência de base:** HEAD inicial desta revisão `35815468ef9ce3d60ca92bee9dabc97159977245`, que já continha pacote anterior. Base publicada informada e88b588; pré-tarefa anterior 1d8d11c. Comparação exata e88b588→1d8d11c: somente `roadmap.md`, cinco linhas de planejamento de monitoramento, sem alteração runtime/SQL fora deste escopo. Não presumir commits iguais nem fazer checkout/reset. `base-divergence.diff` contém diferença exata; `changed-paths.txt` lista base publicada→HEAD inicial e edits locais para revisão antes de deploy. Nesta revisão não há alteração contábil, tributos, rotas, dependências, Auth ou outro fluxo.

## Evidências locais e limites

Comando: `bun run test -- src/test/monitoramento src/test/visita/parentFence.interaction.test.tsx src/test/previsao/painelAlertasScope.test.tsx` → **131/131**, 9 arquivos.

`test-local.py` executa o core candidato em PostgreSQL descartável: **23 checks**, origem própria A/B, alheio, CAS obrigatório/stale, replay, payload distinto, rollback plano/aviso/recibo/log, duplo envio concorrente e revogação durante espera no gate e na linha da visita. Falha DDL/POST demonstrada em transação de teste preserva função; não equivale a exercício do PRE completo LIVE. Harness remove SOMENTE o bloco PRE de hashes porque dependencies são sintéticas/reduzidas; mantém core/DDL/postflight/ACL. Usa snapshot real de `_visita_lock_and_check`, demais guards são simulados. Não executa reprogramação LIVE inteira em concorrência nem todos triggers SaaS/comunicação; esses checks continuam pendentes.

`saveVisitMonitoringPlanClient.test.tsx` (23) e `visitMonitoringPlanEditor.test.tsx` (3): hooks/componente reais, Auth/workspace/transporte simulados; erro, parser, cancelamento, duplo clique, leitura nova sem rebase, revogação/troca/unmount, sem falso sucesso. Build automático observado **OK 2026-10-27T01:01:27Z**; `git diff --check` OK. Não rodamos build/typecheck manual (validação automática do ambiente); não atribuir log build à homologação real.

### Evidências adicionais desta revisão

Testes reais de hooks/componente/página com Auth/workspace/transporte simulados: display readonly e origem, revogação, cancelamento, N/N+1/N+2, cache antigo bloqueado, PT409 explícito, timeout conserva chave, mudanças de versão/ator na confirmação, página desktop/mobile rascunho/em_andamento e can_edit false. PostgreSQL descartável: **26 checks** (23 anteriores + replay com data passada, nova data passada rejeitada, nenhum recibo novo), com relógio simulado somente no harness; corpo candidato usa relógio São Paulo real. PRE LIVE integral e demais triggers permanecem não homologados.

Validação final desta revisão: `bun run test -- src/test/monitoramento src/test/visita/parentFence.interaction.test.tsx src/test/previsao/painelAlertasScope.test.tsx` → **144/144, 9 arquivos** (01:10:15 UTC). Build automático OK 01:10:05 UTC. Tipagem/build manuais não executados por regra do ambiente; não equivalem à homologação JWT/RLS. Nenhum SQL hosted foi executado.

Chromium 1280×1800 e 390×1800: editor real montado via módulos do Vite, Auth/workspace substituídos exclusivamente no navegador; quatro estados readonly/editável, itens/data/origem visíveis, edição/cancelamento, sem overflow/pageerror ou mutação produtiva. Capturas sob `/tmp/browser/visit-plan-review/`. Não é prova de sessão/rota real A/B; montagem da página canônica é testada pelo Vitest.

**Pendente:** revisão/instalação independente com PRE completo, integração de triggers/RLS/ACL e JWT/browser real A/B. Sem migração/DDL/DML hosted, sem fixtures produtivas/publicação. Contabilidade A DRAFT/pendente, SU-518022 e demais pendências históricas preservadas; contagem 42 não modificada por candidato inativo.