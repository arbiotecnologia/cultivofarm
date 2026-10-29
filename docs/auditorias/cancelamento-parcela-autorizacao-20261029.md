# Cancelamento de parcela — autorização offline, 29/10/2026

**NO-GO para implantação/ativação.** Rodada restrita ao pacote existente; produção, runtime, histórico, política comercial e Entregas intocados. Nenhuma consulta hosted nova: fonte é o catálogo previamente capturado no ref `swzpzcwiasxmjutrmvkm`. Estado Git inicialmente limpo; histórico inspecionado, sem revert nem alteração de dependências.

## Resultado desta rodada, sem somar históricos

- PostgreSQL descartável: **55 assertions PASS / 0 FAIL inesperados**. Dessas, 35 caracterizam o capturado, **6 reproduzem o defeito de exposição de estado**, 14 verificam a transformação offline. PASS do teste RED não significa controle seguro.
- Matriz suplementar: **55 PASS / 0 FAIL / 1 BLOCKED / 1 NOT RUN**. O BLOCKED identifica o caminho B2B próprio integral; NOT RUN agrupa homologação JWT/RLS A/B e revogação durante espera.
- Vitest: **9/9 em 3 arquivos** (cancelamento, red/green monetário e semântica). Os 55 checks estão dentro de um teste Vitest, não somar contagens. O filtro adicional `saldoRecebivel.test.ts` não corresponde a arquivo existente e não executou testes.
- Não repetir taxas, não emitir SQL implantável. Transformação guardada por contagem textual somente em memória na sandbox, com diff não instalável.

## Causa e prova específica

Fonte `scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json`, SHA256 `33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d`:

| Objeto | Referência no manifesto | Pino MD5 |
|---|---|---|
| RPC cancelamento, OID41873 | nome linha12336; corpo em12335 | `c7d30a08b1cbd00936cd83aa5bf3415c` |
| guard tenant, OID90690 | nome linha19606; corpo19605 | `d01a740c1e3e02407131d2b9228bf658` |
| trigger risco AR | nome3376; corpo3375 | `2d38119a0bb885471ba0112c300a4144` |
| recalc_partner_risk_score | nome11740; corpo11739 | MD5 registrado no catálogo original |

RPC DEFINER/postgres, EXECUTE authenticated/service_role/postgres, sem PUBLIC/anon. `is_financial_staff` usa Auth → uid-scope → has_role privado → perfil/readiness; H15 deriva empresa ativa do perfil, nunca do argumento de tenant. Claims locais são sintéticas, não JWT verificado.

SELECT FOR UPDATE por UUID **sem tenant**, antes de verificar status e pagamentos. RLS de parcelas protege o acesso direto, mas owner interno da RPC não fica sujeito a `force_rls=false`. O trigger INVOKER `tenant_organization_guard` mantém `auth.uid()` do cliente e nega UPDATE estrangeiro com `42501/tenant_scope_violation`. **Cancelamento estrangeiro OPEN não foi reproduzido como escrita indevida com guard ativo.** O achado anterior em harness sem esse trigger não é certificação de vulnerabilidade instalada.

**P0 de autorização residual reproduzido:** financeiro A distingue parcela estrangeira cancelada (“já cancelada”), com baixa ativa (“não estornados”) e UUID inexistente (“não encontrada”), nos ramos payable/receivable. Respostas exatas em `cancel-authorization/results.json`. A linha estrangeira é selecionada/bloqueada antes do guard; duração/consequência concorrente do lock não foi medida.

Casos executados nos dois ramos: próprios A/B permitidos no recorte sem origem B2B; persistência CANCELED e auditoria única; foreign SELECT oculto; DML direto zero linhas; estrangeiro OPEN negado atomicamente; anon ACL fechado; identidade vazia/inexistente/malformada, perfil/papel revogados negados; empresa inativa nega no UPDATE; replay não insere auditoria extra; baixa ativa própria preservada. Empresa inativa não significa gate de entrada fechado para erros anteriores ao UPDATE.

## Transformação mínima — exclusivamente offline

Resolver H15 antes de acessar alvo; negar tenant ausente; adicionar `organization_id=v_org` aos dois SELECT FOR UPDATE; uniformizar inexistente/estrangeiro em `FINANCIAL_SCOPE_DENIED/42501`. Preservar motivo, tipos, ambos ramos, pagamentos, UPDATE, snapshots e auditoria. Guard tenant permanece intacto. Testes GREEN: estrangeiro OPEN/CANCELED/PARTIAL e inexistente retornam a mesma negação, próprios/replay/baixa ativa preservados.

Não há writer runtime alterado nem arquivo *.sql.review novo. Não demonstrada reautorização após espera: a hipótese não está pronta para promoção.

## Menor impedimento B2B e limites

**BLOCKED executável:** fixture B2B legítima com partner_id dispara a geração de parcela → `tg_recalc_risk_on_ar_change`, corpo linhas internas7–9 → chamada `recalc_partner_risk_score(uuid)`. Esta dependência capturada não está composta no harness. O teste exige a falha e estado integral inalterado; não atribui sucesso ao cancelamento que nem chegou a ser enviado. Não remover trigger, não deixar partner_id NULL para afirmar positivo B2B, não inventar ticket.

Para compor: recálculo exige partner_risk_scores, partner_financial_settings, partner_orders, partner_accounts e financial_governance_audit_log, com suas ACL/guards/FKs/origem. Criação B2B integral/origem/fiscal permanece gate separado. **Próprios MANUAL positivos não certificam B2B positivo.**

Todos triggers capturados das duas parcelas instalados; FKs das parcelas/organização/pais e audit→auth.users compostas. Políticas parceiro/produtor `ari_partner_select_own_b2b` e `ari_producer_read` omitidas explicitamente por helpers transitivos ausentes, sem permissão falsa; atores testados são financeiro exclusivo. Demais políticas das parcelas preservadas. ACL de funções recomposta por nome único; owners SQL públicos postgres e claims Auth capturados; owner Auth real supabase_auth_admin não reproduzido como ownership. Tabelas mínimas de identidade não equivalem a Auth real.

Preparação/inspeção de fixtures como owner separadas das chamadas: **RPC somente em conexões LOGIN authenticated/anon, NOSUPERUSER/NOBYPASSRLS/NOINHERIT, sem membership postgres.** Estado compara pais, parcelas, audit, receivable/payable payments, recibos e schedule. Estado de risco ausente, explicitamente não provado; cadeia de INSERT de pagamentos, RLS de pais/audit SELECT, identidade integral e triggers de criação não composta. Sem evidência browser/PostgREST.

## Arquivos e execução

Novos: runner `test-cancel-authorization.py`, regressão `src/test/financeiro/cancelAuthorizationPostgres.test.ts`, este relatório e subpasta `evidencias-cadeia-financeira-20261029/cancel-authorization/` (resultados, matriz, captura textual, diff, logs e SHA256SUMS). Aditivos: AGENTS do pacote, roadmap, relatório da cadeia e **plano original**. Revisão independente confirmou 55 checks e NO-GO; recomendação de ampliar comparação de estado incorporada antes da execução final.

```text
python3 scripts/financial-installments-initial-20261024/test-cancel-authorization.py
bun run test src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/financeiro/receivableRedGreenPostgres.test.ts src/test/financeiro/receivableSemantics.test.ts
```

Promoção futura: compor risco/identidade/ACL/RLS/FKs integrais, revisão independente, reautorização fresca pós-lock/concorrência, PRE/POST atômico e pinos atuais, autorização específica de JWT/RLS A/B. BI/proveniência/saldo e calendário/parcelas/billing seguem abertos. Containment futuro deny-only, sem restauração vulnerável; nenhuma remediação histórica automática. Financeiro, envase/B2B/entrega continuam OFF.
## Revisão 14:28 — pagamento estrangeiro e revogação durante espera

**Resultado novo, sem somar históricos:** PostgreSQL17.9 descartável **189 assertions PASS / 0 FAIL inesperados / 1 BLOCKED / 1 NOT RUN**; Vitest **9/9 em3arquivos**. Distribuição:35CAPTURED,6RED_ORACLE_REPRODUCED,22RED_CAPTURED_WAIT,22RED_SCOPED_WAIT,12RED_REPEATABLE_SNAPSHOT,92GREEN_OFFLINE_ONLY. Os62 checks RED demonstram defeitos/limites esperados, não segurança. Não repetir taxas. Evidências novas: `evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/`.

### Correções offline e prova

- GREEN PARTIAL usa `paid_fixture` estrangeira AR/AP com evento persistido de **1.000,00**; não somente status artificial. AR usa recálculo capturado; AP continua preparação sintética de status/paid_amount, sem alegar cadeia real de INSERT de pagamento AP. Foreign OPEN/CANCELED/PARTIAL e inexistente exigem igualdade **SQLSTATE42501 + mensagem FINANCIAL_SCOPE_DENIED**, além de igualdade integral das **nove tabelas monetárias compostas**. Não é igualdade de todo banco/identidade: revogações alteram intencionalmente roles/perfil.
- Corpo transformado reexecuta identidade vazia/inexistente/malformada, perfil/papel/empresa revogados, próprios A/B, motivos curtos/tipo inválido, replay e baixa ativa. Original concreto10.300,00, net/juros/multa/desconto/pago permanecem. Estado monetário inclui pais, parcelas, eventos, auditoria, recibos e schedule.
- **14 ensaios multissessão reais locais:** sessão owner prepara e segura FOR UPDATE da própria parcela; RPC executa em LOGIN authenticated. `pg_stat_activity.wait_event_type=Lock` e `pg_blocking_pids` contêm o **PID exato do holder**, depois terceira sessão confirma revogação committed antes do release. Ambos ramos e revogação de papel/perfil. Contexto Auth é sintético, sem JWT verificado.
- RED capturado e RED somente escopado: revogar **papel** durante espera ainda permite cancelamento. Perfil inativo é negado pelo guard tenant tardio; não provar revogação do papel usando apenas esse caso. GREEN pós-lock nega ambos com42501/FINANCIAL_SCOPE_DENIED e zero efeitos monetários.
- Hipótese mínima somente sandbox: tenant antes do lookup; filtro tenant no FOR UPDATE; `NOT FOUND` verificado **antes** da nova consulta para não sobrescrever FOUND; então **SQL separado em RPC VOLATILE** chama `is_financial_staff(auth.uid())` e H15 capturados e compara org. Helpers mantêm MD5 e STABLE, sem autorização/ticket inventado nem mudança de volatilidade. Rechecagem em READ COMMITTED observou a revogação nos quatro controles GREEN; não afirmar que STABLE é sempre fresco dentro de uma mesma instrução.
- **REPEATABLE READ contraprova:** mesmo recheck separado com helpers exatos retém snapshot transacional e permite cancelamento após revogar papel nos dois ramos. GREEN nega REPEATABLE READ e SERIALIZABLE na entrada; isso é restrição da hipótese offline, **não regra instalada**. Não usar READ UNCOMMITTED ou snapshot antigo como prova de segurança.
- Foreign com pagamento e linha bloqueada por outra sessão nega42501, não55P03, com lock_timeout200ms; se a hipótese tentasse FOR UPDATE dessa linha entraria em conflito. Portanto não adquire aquele lock estrangeiro no cenário testado; não é prova de ausência de qualquer lock SQL.
- Holder ACK limitado4s via thread/queue, espera comprovada limitada4s, statement_timeout/lock_timeout, communicate limitado e kill/stop em finally. Não esperar indefinidamente. RPCs nunca executadas como owner.

### Integridade histórica e falhas intermediárias

Verificação **antes de editar**:26 entradas históricas,21OK,1MISMATCH e4MISSING. `red-green.json` já divergia do SHA256SUMS: preservar bytes observados, sem regenerar manifesto ou fabricar original. Quatro logs históricos `pg.log`/`vitest.log` das duas pastas não estavam no checkout. `historical-hash-verification.json` registra expected/actual/after: **23 entradas ficaram inalteradas nesta rodada**, inclusive ausências;3 fontes autorizadas evoluíram (runner cancelamento, runner monetário e regressão), com hashes novos. Manifestos antigos continuam explicitamente obsoletos nesses5itens; não alegar checksum histórico integral PASS. Runner cancelamento e red/green monetário agora usam /tmp por padrão e pasta nova explícita, para regressões não sobrescreverem evidência. Pinos históricos de fontes do harness ficam superados pelas mudanças desta rodada, sem editar SHA antigo; manifesto novo fixa fontes atuais.

Primeira execução intermediária falhou ao adicionar SELECT de autorização antes de testar FOUND: query sobrescrevia FOUND e chegava ao guard tenant foreignOPEN. Corrigido ordenando NOT FOUND antes da consulta; falha preservada em `failed-intermediate-run.txt`, não contada como GREEN. Execução final nova completa189/189.

### Comandos, hashes e revisão

```text
python scripts/financial-installments-initial-20261024/test-cancel-authorization.py --output-dir docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428
bun run test src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/financeiro/receivableRedGreenPostgres.test.ts src/test/financeiro/receivableSemantics.test.ts
sha256sum -c docs/auditorias/evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1428/SHA256SUMS
```

Capturado RPC MD5 `c7d30a08b1cbd00936cd83aa5bf3415c`; hipótese MD5 `842136aa09163b424865e0483a411d5d`; catálogo SHA256 `33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d`. Diff offline na nova pasta; nenhum SQL implantável. Revisão independente detectou necessidade de PID exato, limitação do estado comparado e proteção de saída: incorporadas. Sua ressalva sobre primeira execução corrigida e reexecutada; revisão não é JWT homologado.

Docs PostgreSQL atuais consultadas: https://www.postgresql.org/docs/current/xfunc-volatility.html e https://www.postgresql.org/docs/current/transaction-iso.html . STABLE usa snapshot da instrução que o chama; VOLATILE obtém snapshots para comandos internos em READ COMMITTED, não em isolamento transacional fixo. Não foi utilizada operação específica hosted Supabase nem alterada configuração de isolamento da plataforma; isolamento real PostgREST permanece NOT RUN.

**BLOCKED:** positivo B2B integral no trigger de risco `recalc_partner_risk_score`, como antes; guards/identidade/FKs/ACL/RLS integrais, BI/proveniência e ledger contábil. **NOT RUN:** JWT/RLS real A/B, isolamento PostgREST real, promoção/containment. Existe janela posterior à rechecagem e revogação concorrente fora da espera testada; não provar serialização integral com identidade. Produção/runtime/Entregas/histórico e política comercial preservados; sem hosted DML, migration, GRANT produtivo, deploy, usuários/sessões reais, cobrança/ativação ou remediação. **NO-GO permanece.**

## Continuidade autônoma 14:50 — composição do próximo elo

**Resultado final desta rodada, sem somar históricos/reexecuções:** cancelamento/risco **263 PASS, 0 FAIL inesperados, 1 BLOCKED, 1 NOT RUN**; proveniência **42 PASS, 0 FAIL, 1 BLOCKED**; monetário red/green **37 PASS, 0 FAIL inesperados** (18 RED baseline, 19 GREEN sandbox); Vitest **10/10 em 4 arquivos**. Assertions internas PG não somam com Vitest. Saída nova: `evidencias-cadeia-financeira-20261029/cancel-authorization-revision-1450/`; execuções intermediárias e finais separadas.

### Progresso executável

- Novo `cancel-risk-composition.py`, importado pelo runner existente: 20 corpos capturados exatos, cinco tabelas de risco/parceiro/governança com colunas/defaults/nullability, constraints/FKs, todos seus triggers/enabled, políticas, owner/ACL/RLS comparados ao catálogo. **25 checks de metadados**, **25 controles capturados de risco**, **10 controles GREEN** e **10 assertions de barreiras BLOCKED esperadas**. Os demais checks:35CAPTURED,62RED de oráculo/corrida/snapshot,96GREEN offline. PASS de uma barreira não é positivo B2B.
- Calculator completo `recalc_partner_risk_score` deixa de ser símbolo ausente; chamadas LOGIN authenticated A/B chegam à FK **`partner_risk_scores_partner_id_fkey`/23503**, com tabela exata e rollback de risco/governança/monetário/tickets. Anônimo ACL negado; papel financeiro revogado nega42501/permission_denied. Nenhuma chamada ao calculator como owner para alegar autorização.
- Cadastro sintético A/B como administradores locais reais chega a **42501/C2P1_SETTINGS_WRITE_CLOSED**; estado de15tabelas composto permanece igual. Nenhum parceiro/ticket é fabricado, trigger desligado ou helper permissivo introduzido. Settings updater/issuer/validator capturados são instalados, mas o issuer **não é chamado diretamente**.
- Cancelamento MANUAL após composição conserva10.300, transição CANCELED, auditoria única por ator e estado não relacionado; foreign com evento1.000 nega uniformemente, incluindo estado risco/governança/tickets. Esses controles não certificam origem B2B. Os14ensaios de espera anteriores são reexecutados; helpersSTABLE permanecem exatos e hipótese continua READ COMMITTED-only.
- Novo `test-financial-provenance.py`/regressão:13candidatos/14trechos separam **1SQL EXECUTE**, **4formatações de texto**, **9literais de nível de acesso**. Linhas137/146 do impl B2B não executam SQL. Único EXECUTE tem alvos finitos capturados `ordens_servico`/`ordens_servico_onfarm`, resolvidos por branch e metadados, **não executados operacionalmente**.17fingerprints atuais/prévios sem drift, mantendo SOURCE_ONLY_NOT_END_TO_END. Classificador restrito aos pontos congelados, comentários/dollar quotes desconhecidos=UNRESOLVED; controles de mutação executáveis registrados.

### Menor impedimento que exige decisão do proprietário

**Contrato de cadastro de parceiro/configuração financeira não definido para a composição atual.** Caminho capturado:

```text
partner_accounts INSERT
 → tg_create_default_pfs: INSERT settings(partner_id), sem ticket/método
 → c2p1_settings_fence: exige autoridade + ticket + método ativo único
 → C2P1_SETTINGS_WRITE_CLOSED (rollback completo)
```

Prova: catálogo `receivable-recursive-live-20261029.json`, bodies OID42095/123322/123319; MD5 respectivamente756e5d24883fa387054b4385a232cfcf/f87cc2894dc551d242c2586f17e2cdd4/57baa5fd657952d9383ad0c422c1d028. Frontend `src/hooks/useParceiroB2BMutations.ts:80–84` faz INSERT direto. `src/hooks/useB2BFinanceiro.ts:161–174` configura **parceiro já existente**, com11valores explícitos e método escolhido. Updater capturado em `scripts/owner-orders-20261023/internal-origin-composition-20261023/baseline/platform_private.c2p1_update_settings.sql:9–40` exige parceiro antes de emitir/apagar o ticket. Não há provisioner de cadastro capturado ou correção revisada que resolva essa ordem; somente envolver INSERT/RPC em transação não resolve.

**Decisão exata necessária:** cadastro pode deixar configurações ausentes para configuração posterior autorizada, ou deve inicializar11valores explicitamente na mesma transação? Se inicialização obrigatória, qual fluxo fornece esses valores e a escolha canônica de método? Não escolher método/defaults nem mudar o trigger unilateralmente. A decisão permite preparar correção offline específica, não autoriza implantação. Contabilidade/origem/fiscal continuam gates separados: negações C2_ACCOUNTING_PENDING/B2B_INTERNAL_DOWNSTREAM_UNVERIFIED intactas; nenhum positivo wrapper inventado.

### Integridade, execução e limites

Verificação histórica registrada nesta rodada:39entradas,28OK/7MISMATCH/4MISSING. Inclui fontes autorizadas já evoluídas e discrepância histórica red-green/logs já informada; **nenhum manifesto antigo regravado**, outputs existentes preservados. Verificação after:33entradas mantêm bytes/ausência;6entradas(repetidas em manifestos) correspondem a três fontes autorizadas evoluídas:runner/regressão cancelamento e relatório. Registro before foi feito após primeira edição autorizada, não é inventário pré-edição. Novo SHA256SUMS fixa fontes finais/logs/evidências.

Falhas intermediárias preservadas: ACL auxiliar `clientes` ausente no primeiro ensaio; recomposição de ACL capturada com RLS deny-only em relações vazias corrigiu o bloqueio técnico. Comparação nova revelou MAINTAIN omitido pelo harness herdado; PG17 suporta e agora recompõe ACL exata. Final263/0 após ambas correções. Revisão independente sugeriu metadados/exatidãoFK/estado positivo/contagensBLOCKED/classificador limitado; incorporados e reexecutados.

```text
python3 scripts/financial-installments-initial-20261024/test-cancel-authorization.py --output-dir <pasta-nova/cancel-authorization-revision-final>
python3 scripts/financial-installments-initial-20261024/test-financial-provenance.py --output-dir <pasta-nova/provenance-final>
python3 scripts/financial-installments-initial-20261024/test-receivable-red-green.py --output-dir <pasta-nova/monetary>
bun run test src/test/financeiro/cancelAuthorizationPostgres.test.ts src/test/financeiro/receivableRedGreenPostgres.test.ts src/test/financeiro/receivableSemantics.test.ts src/test/financeiro/financialProvenanceOffline.test.ts
```

**Limites explícitos:** cinco tabelas exatas não equivalem a integração integral. Orders segue superfície mínima read-only; zerofixturesdepedido, sem seus triggers/FKs/RLS; schemas auxiliares vazios têm políticas omitidas deny-only, não autoridade positiva; identity/payment seams parciais. Calculator não conclui UPSERT positivo sem parceiro legítimo. BI/proveniência métrica/ledger/histórico requerem decisão contábil; dispatch/importadores e JWT/RLS/PostgREST real requerem prova/autorização independente. Nenhuma alteração runtime/produção, SQL implantável, hosted mutation/GRANT/migration/deploy/sessão real/ativação/cobrança/remediação. **NO-GO integral preservado.**
