# Perda real de plano ao abrir visita — candidato de proteção INATIVO

## Aplicação externa e contenção

Auditor informou instalação `visit_monitoring_plan_atomic_cas_20261027` e publicação `449b1f`; NÃO REAPLICAR o pacote inicial. Provas JWT A/B próprio200/cross404/CAS409 e um aviso/log/recibo são relatos do auditor. A perda ao abrir A ocorreu depois da gravação inicial, no writer legado da página. Nenhum dado A/B foi reparado/removido/recriado nesta revisão.

Captura **somente leitura** pelo conector explicitamente canônico `swzpzcwiasxmjutrmvkm`, 01:23 UTC: core MD5 `303ca1887b97c855bc28ce112fda28d8`; `enforce_visit_immutability()` `8a6a92bb748f745526ed163ec52464aa`. Core tem owner postgres/ACL postgres+service_role, sem authenticated: contenção já visível. Candidato preserva ACL/OID/owner com CREATE OR REPLACE, não reabre wrapper/core. PRE exige essas definições; executor deve confirmar todos triggers/RLS/ACL e contenção atuais. Não se conecta pelo banco interno Lovable.

## Causa concreta encontrada

`VisitaTecnica.tsx` armava autosave quando setters da hidratação mudavam formulário. Não havia comparação de estado realmente editado. `buildPayload()` descartava variável do plano e reconstruía observações só de diagnóstico+Conduta+notas; descrição limpa nem era hidratada no fallback. `saveMutation` refetchava workspace ANTES de usar CAS, aceitando versão nova para payload antigo. Refetch após editor não renovava hidratação, que era por ID apenas. Essa cadeia explica a escrita obsoleta com versão atual; testes antigos terminavam antes dos 3s e não protegiam efeitos.

## Cliente corrigido localmente

- Hidratação requer workspace autorizado e registro na mesma revisão; baseline só após diagnósticos concluídos com sucesso. Falha mantém erro e trava autosave. Ticket+scope descartam respostas tardias.
- Autosave só para alteração real frente à baseline, nunca mount/refetch/diagnóstico; carrega payload e versão observados juntos. Nenhum refetch para autorizar payload antigo. Resultado exige ID/+1; conflito preserva formulário, bloqueia automático e mostra erro, sem retry/rebase.
- Sucesso do editor cancela ticket de autosave antes dos refetches; versão nova com draft sujo não adota baseline silenciosamente. Envios já em voo continuam com CAS anterior e falham, não fazem overwrite.
- `preserveMonitoringPlan.ts` conserva bloco exato observado independentemente de proxima_acao. `parseConduta` preserva texto posterior ao fechamento JSON; descrição limpa é hidratada e conduta corrente permanece. Sem adotar recibo como conteúdo atual.
- Leitura da visita usa escopo existente useTechnicalQuerySession e fence, sem mudar guards/RLS/rotas.

## Proteção servidor revisável

`candidate.sql.review`: transação única PRE+DDL+POST. Trigger exige que bloco e data permaneçam iguais para escritores comuns. Alteração real do plano exige ticket privado txid+visita+bloco/data exatos, criado exclusivamente pelo core já autorizado sob seus locks e apagado na mesma transação. Cliente não pode inserir/consultar ticket; não há GUC, role-bypass, claim nem reconhecimento por stack. Core recebe apenas inserção/remoção do ticket, conservando todo guard/CAS/replay/data/log/recibo. Não há restauração de planos já perdidos ou alteração fiscal/contábil.

Antes da instalação independente, comparar triggers/ACL e pós-hashes com captura corrente; PRE é mínimo por dependências capturadas, não certificado completo de rollout. `rollback-containment.sql.review` revoga core/wrapper, preserva trigger/recibos/dados. Não é restauração destrutiva. Cliente sozinho não protege abas antigas já publicadas; auditor deve manter contenção até proteção servidor e UI homologadas.

## Testes e limites

`src/test/visita/monitoringAutosave.interaction.test.tsx`: página, workspace, editor, CondutaCard, EncerramentoCard e efeitos/timer reais; apenas Auth/transporte e leitores não relacionados substituídos. Sete casos: mount/refetch não grava, edição real preserva plano, salvarplano+refetch sem autosave, timer armado, diagnósticos lentos, falha, envio já em voo perde CAS. **Não é JWT/RLS real nem prova da aba publicada.**

`test-local.py`: 30checks em PostgreSQL descartável, Auth/schema/relógio sintéticos; proteção contra apagar bloco e data, ticket forjado negado, core legítimo futuro/replay/rollback/concorrência preservados. PRE hosted é removido somente no harness para esquema reduzido. Não reaplicar SQL inicial em produção.

Suíte final: **156/156, 11 arquivos** em 01:28:53 UTC; build automático OK. Primeira execução paralela teve timeout de 1s aguardando montagem do editor; execução isolada passou, espera ajustada para 5s e suíte integral repetida passou. Não omitir isso como prova JWT/browser real. Tipagem/build manuais não executados por regra do ambiente.

Pendentes: instalação independente da proteção, nova homologação browser/JWT A/B com writer contido, investigação/restauração autorizada do plano A pelo auditor. Contabilidade A DRAFT e SU-518022 intactos.