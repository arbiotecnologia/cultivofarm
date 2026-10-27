# Plano canônico de monitoramento — candidato INATIVO

Base publicada informada: `e88b588eabb14ef81a9f94f1f7e65e7204eead3a`. HEAD encontrado antes da mudança: `1d8d11cff3aad38d43d5648e03eeecb0a0ce709d`; não foi feito checkout/reset nem presumida identidade entre bases.

## Decisão de modelo

`tipo_alerta` não contém `monitoramento`. `Nutrição`, `Estande` e `Clima` no plano são assuntos a observar, não diagnóstico de praga/estresse. Portanto este recorte NÃO cria `alertas_agronomicos.registro_origem_id`: isso exigiria um diagnóstico/tipo real explicitamente escolhido em operação agronômica autorizada, ainda inexistente no editor. Não existe fixture/vínculo fabricado.

Autoridade do plano permanece no bloco textual de `registros_consultor.observacoes_tecnicas` e na `data_proxima_visita`; `monitoramento_avisos` recebe apenas aviso derivado, tipo técnico reservado `plano_monitoramento`, ligado por `registro_consultor_id`. Não é armazenamento alternativo dos assuntos/frequência/gatilhos. Não reutiliza nem altera avisos `monitoramento_pos_visita` ou de entrega/notificação. Não dispara comunicação. Nenhum alerta climático é lido, adotado ou alterado.

## Fluxo e arquivos

- `src/pages/VisitaTecnica.tsx`: duas montagens responsivas do mesmo editor, preservadas.
- `src/components/visita/PlanoMonitoramentoEditor.tsx`: removidos UPDATE direto/consulta `ilike`; snapshot de campos e versão do mesmo workspace ao abrir; sem refetch no save. Erro fica no diálogo; tentativa não confirmada conserva chave e payload, mudança de payload bloqueia reenvio até resolução humana. Troca de scope fecha/limpa formulário e aborta chamada.
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

## Limitação de disponibilidade importante

O caller atual monta o editor somente com `isFinalized`, mas conteúdo finalizado é imutável por guard e trigger. Não enfraquecemos isso nem abrimos novas telas/rotas. O novo RPC também só permite rascunho/em_andamento. A correção está preparada, mas disponibilidade editável real no fluxo exige revisão do ajuste canônico autorizado; não alegar que visita finalizada agora é editável. RPC nova ainda não instalada: erro permanece visível, sem fallback.

## Evidências locais e limites

Comando: `bun run test -- src/test/monitoramento src/test/visita/parentFence.interaction.test.tsx src/test/previsao/painelAlertasScope.test.tsx` → **131/131**, 9 arquivos.

`test-local.py` executa o core candidato em PostgreSQL descartável: **23 checks**, origem própria A/B, alheio, CAS obrigatório/stale, replay, payload distinto, rollback plano/aviso/recibo/log, duplo envio concorrente e revogação durante espera no gate e na linha da visita. Falha DDL/POST demonstrada em transação de teste preserva função; não equivale a exercício do PRE completo LIVE. Harness remove SOMENTE o bloco PRE de hashes porque dependencies são sintéticas/reduzidas; mantém core/DDL/postflight/ACL. Usa snapshot real de `_visita_lock_and_check`, demais guards são simulados. Não executa reprogramação LIVE inteira em concorrência nem todos triggers SaaS/comunicação; esses checks continuam pendentes.

`saveVisitMonitoringPlanClient.test.tsx` (23) e `visitMonitoringPlanEditor.test.tsx` (3): hooks/componente reais, Auth/workspace/transporte simulados; erro, parser, cancelamento, duplo clique, leitura nova sem rebase, revogação/troca/unmount, sem falso sucesso. Build automático observado **OK 2026-10-27T01:01:27Z**; `git diff --check` OK. Não rodamos build/typecheck manual (validação automática do ambiente); não atribuir log build à homologação real.

**Pendente:** revisão/instalação independente com PRE completo, integração de triggers/RLS/ACL, JWT/browser real A/B e fluxo de ajuste editável. Sem migração/DDL/DML hosted, sem fixtures produtivas/publicação. Contabilidade A DRAFT/pendente, SU-518022 e demais pendências históricas preservadas; contagem 42 não modificada por candidato inativo.