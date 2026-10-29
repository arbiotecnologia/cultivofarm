# Cadastro primeiro, financeiro depois — rodada 15:03

**Decisão recebida:** persistir parceiro e configurar o financeiro posteriormente, mantendo-o bloqueado até concluir. Resolve somente esse contrato. **NO-GO de produção permanece.** Nenhum runtime, migration, hosted DML, deploy, GRANT produtivo, usuário real, emissão ou histórico alterado.

## Resultado executado, sem somar históricos

- Runner PostgreSQL existente: **651 PASS / 0 FAIL inesperados / 1 BLOCKED / 1 NOT RUN**; 14 corridas anteriores reexecutadas, correção `p_kind IS NULL` preservada (43 controles RED / 40 GREEN NULL).
- Módulo diferido: **288 GREEN sandbox**, **9 RED capturados**, **8 testes de proposta de consumidor inativa**. RED inclui score baixo sem configuração, aprovação que contorna o calculator e updater capturado aceitando limite NULL; PASS desses testes não significa segurança.
- Restante da matriz: CAPTURED35; GREEN_OFFLINE_ONLY96; RED_CAPTURED_WAIT22; RED_SCOPED_WAIT22; RED_REPEATABLE_SNAPSHOT12; RED_ORACLE_REPRODUCED6; RISK_CAPTURED25; RISK_METADATA25; RISK_GREEN_CONTROL10; RISK_BLOCKED_EXPECTED10. As barreiras históricas são executadas antes da transformação, não blockers atuais do cadastro.
- Monetário independente **37 PASS / 0 FAIL**, mantém 10.300/7.550, juros de eventos, replay, pagamentos e estorno. Proveniência **42 PASS / 0 FAIL / 1 BLOCKED**, sem nova classificação ampla. Vitest **10/10 em quatro arquivos, sem erros na execução final**.

## O que a decisão desbloqueou

1. A/B authenticated, com administrador local e guards/ACL/RLS/triggers capturados, cadastram parceiro próprio e auditam ator/owner; **zero settings e zero tickets**. Não se fabrica método ou defaults financeiros. Estrangeiro/anônimo/ator sem papel de cadastro negados atomicamente.
2. Trigger `tg_create_default_pfs` conserva identidade, retorno e instalação; somente sua inserção automática é removida na hipótese. Demais triggers de cadastro e fence de settings intactos.
3. Fluxo público INVOKER `rpc_update_partner_financial_settings` → core CAS capturado continua único writer. Onze campos completos explícitos, método ativo único, RBAC/tenant, locks, revalidação, ticket **emitido somente dentro do updater autorizado**, audit e remoção de ticket testados. Nenhuma chamada direta ao issuer. Chaves ausentes/NULL, método desconhecido, limite negativo/NaN/infinito, foreign, anon, revogações e CAS stale negam sem efeito. Infinity mantém erro de coerção 22003, não erro artificial.
4. Configuração ausente/incompleta/inativa ou método inativo nega cálculo de risco antes dos writes, crédito/progressão inclusive aprovação prévia, automático, elegibilidade e vínculo de entrega. Updater endurecido impede valores NULL e limite inválido sem alterar fórmulas.
5. Configuração completa pelo updater resolve FK de risco e permite score legítimo com histórico vazio A/B, progressão no **carrier reduzido** e cancelamento de parcela B2B-shaped. **Não prova criação canônica de pedido/título B2B.**
6. Wrapper de geração nega ausência/incompletude. `C2_ACCOUNTING_PENDING` e `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` negam antes e **depois** da configuração completa. Marcadores de origem são probes exclusivamente negativos, não provas válidas de origem.

## Implementação e limites de prova

`scripts/financial-installments-initial-20261024/cancel-settings-deferred.py`, integrado ao runner atual, transforma corpos capturados apenas na instância socket-only descartável. Diffs de nove funções na pasta nova; não há SQL implantável. Settings completos são teste sintético (`manual`, auto OFF, método LOCAL_METHOD), **não definição comercial**.

Helpers Auth/h15/RBAC de cancelamento continuam STABLE/exatos; hipóteses financeiras reutilizam `c2p1_settings_allowed`. Transformação adicional do wrapper usa **CASE explícito** para preservar as duas alternativas canônicas sem exigir o leitor externo para um interno autorizado. OR reordenado foi descartado após revisão: não garante ordem de avaliação. A alternativa externa ainda não está composta/provada.

`harness.credit_probe`, `auto_probe` isolado, `delivery_probe` e `eligibility_probe` são row shapes descartáveis. Chamadas a funções service-only ocorrem pela fronteira DEFINER do trigger; ACL client EXECUTE=false comprovada. O carrier de elegibilidade é scaffolding autorizado local, não nova API nem prova de autorização produtiva. Estado completo comparado antes/depois inclui pais/parcelas/eventos/recibos/audits/settings/risco/tickets/carriers/**partner_orders**; persistem hashes de estado para evitar duplicação de dezenas de MB. Igualdade integral acontece antes da compactação.

Configuração legada incompleta foi criada **pelo updater capturado**, não INSERT owner/fence bypass, e depois reparada somente pelo updater endurecido com CAS. Gates de risco/crédito/auto/wrapper/link/eligibilidade fechados para esse caso. Crédito/método desativado e settings inactive testados; integração completa de revogação dessas configurações durante espera não demonstrada.

Consumidor: regra/testes inativos `proposed_consumer_state` no módulo; fonte lida `src/hooks/useB2BFinanceiro.ts:130–195` já usa maybeSingle, baseline NULL e updater CAS. Proposta: distinguir loading/error de configuração pendente/inativa; não construir defaults nem interpretar registro completo como autoridade operacional. **Não aplicado à tela publicada.**

## Evidências e comandos

Pasta exclusiva `docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1503/`; final em `final-cancel-authorization-revision-1503/`. Catálogo fonte permanece `33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d`, sem consulta hosted nova. SHA256SUMS e integrity-before/after registram hash de evidências e fontes atuais. Histórico auditado antes: **69 OK / 14 MISMATCH / 4 MISSING**; divergências de fontes evoluídas e divergências/ausências antigas não corrigidas silenciosamente. Compare antes/depois para verificar preservação nesta rodada.

```text
python3 scripts/financial-installments-initial-20261024/test-cancel-authorization.py --output-dir <nova-pasta-cancel-authorization-revision-1503>
python3 scripts/financial-installments-initial-20261024/test-receivable-red-green.py --output-dir <nova-pasta>
python3 scripts/financial-installments-initial-20261024/test-financial-provenance.py --output-dir <nova-pasta>
bun run test --maxWorkers=1 --no-file-parallelism src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/financeiro/receivableRedGreenPostgres.test.ts src/test/financeiro/receivableSemantics.test.ts src/test/financeiro/financialProvenanceOffline.test.ts
```

Logs intermediários preservados: mensagens reais de ACL diferiram das expectativas; âncora BEGIN ambígua; dependências de visibilidade ausentes; coerção Infinity22003. Corrigidos sem guards permissivos. Primeira pasta final recusada pelo fence de imutabilidade. Dois Vitest com10PASS mas timeout do worker **não eram sucesso**; regressão mudou execução do processo filho para assíncrona, final10PASS/0erros. Saída intermediária de42MB retirada do repo e preservada em `/tmp`; final303KB com comparações de hashes verificáveis, sem evidência grande no commit.

Revisão independente de fonte encontrou quatro lacunas: statuses pending omitidos, auto não isolado, OR sem ordem garantida, partner_orders fora do estado. Incorporadas e reexecutadas; elegibilidade e legado incompleto acrescentados. Não houve homologação por esse revisor.

## Intervenções e gates restantes

- **Não aguarda mais decisão sobre cadastrar/configurar.** Decisão implementada e comprovada no recorte offline.
- Necessária decisão/prova independente sobre a liberação contábil/origem dos contratos atualmente negados: que cadeia credor/owner/order/title/fiscal autoriza sair de `C2_ACCOUNTING_PENDING` e `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`. Não bastam settings completos; não contornados.
- Calendário fracionário, parcelas/amortização e termos comerciais ainda indefinidos; nenhum valor desta rodada decide esses contratos.
- Cadeia integral order/entrega, financial writers/ledger, BI/proveniência dos17 consumidores source-only, RLS/trigger/FKs transitivos, fiscal e JWT/RLS/PostgREST/browser A/B reais exigem integração/revisão posterior e autorização específica para homologação. Sem SQL implantável até esses gates fecharem.
- Nenhuma implantação, ativação financeira/entrega ou remediação histórica autorizada; as hipóteses permanecem inativas.