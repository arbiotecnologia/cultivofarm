# Correções origem, parcial e servidor — 01/11/2026

## Estado: NO_GO, candidatos inativos

Trabalho exclusivamente nesta cópia, iniciado na base informada `a13636abcb17735713326876d3024cf61ea74281`. Nenhuma conexão SQL/API hospedada, instalação, emissão, cobrança, comunicação, outbox ou cron foi executada. Nenhuma publicação. Capturas e RED anteriores preservados. Não é certificação E2E, JWT/RLS ou fiscal real.

## Código entregue

Pacote `scripts/financial-price-generator-20261029/integration/`:

1. `origin.sql.review`: projeção escopada parcela/título/empresa, discriminando Price, cronograma legado B2B e alocação documental. Legado exige selo econômico, vínculo exato, cronograma e evidência INSERT compatível mais reconciliação do ledger. Ausência ou divergência bloqueia. Juros financiados não são mora; a baixa capturada usa a projeção para evitar soma duplicada.
2. `schema.sql.review` + `partial.sql.review`: condições e atribuições privadas/versionadas, snapshots imutáveis, documentos internos, alocações por item/quantidade/principal/juros, reversões append-only. Residual mais saldo dos títulos preserva exposição com juros. Mantido UNIQUE do vínculo legado; índice de título por pedido passa a proteger somente títulos legados, com identidade documental única para novos títulos.
3. `build.py` / `captured-deltas.sql.review`: deltas sobre create, simulação, crédito, baixa e gerador capturados. Escolha tipada/versionada, hash inclui condição; create verifica o hash antes de escrever, snapshot e ACK compatíveis. Comunicação retirada do caminho candidato. Pins independentes impedem alteração conjunta de corpo/MD5 capturados; manifesto de saída não substitui os pins de entrada.
4. `fences.sql.review`: permit privado one-shot para título, identidade de origem/documento imutável em UPDATE, writer integral antigo fechado e automático sem geração. Cancelamento serializa pedido → crédito → documento, relendo autoridade. Assinaturas antigas têm revogação explícita quando presentes.
5. `src/lib/financeiro/receivableOrigin.ts`: consumidor existente aceita somente os três contratos validados, com identidade de empresa/pedido e cronograma/documento para B2B; título trocado e duplicatas continuam negados. Teste `b2bIntegratedOrigin.review.test.ts` consome projeções geradas no PostgreSQL, sem fabricar saldo positivo no consumidor.

## Resultados e comandos

Evidências: `docs/correcoes-origem-parcial-servidor-20261101-evidencias/`.

```text
PATH=/nix/store/wm063nf09jrvk2kxa3hp7dncy5qjxjy0-postgresql-17.11/bin:$PATH python3 scripts/financial-price-generator-20261029/integration/test-local.py <pasta-nova>
bun run test -- src/test/financeiro src/test/pedidos src/test/comercial src/test/homolog --reporter=json --outputFile=<json>
bun run test -- src/test/financeiro/b2bIntegratedOrigin.review.test.ts src/test/financeiro/receivableTarget.review.test.ts src/test/financeiro/contasReceberOriginConsumer.review.test.tsx src/test/pedidos/arbioPaymentContract.integration.test.tsx src/test/comercial/priceDecimalOracle.review.test.ts --reporter=json --outputFile=<json>
```

- `pg-final/checks.json`: **75 PASS/0 FAIL**; instalação/execução de componentes capturados com seams declarados. Inclui três documentos, replay, pagamentos, residual, substituição, cancelamento antecipado, identidade imutável, legado sem prova negado, baixa separando mora e financiamento, simulação/create/hash e crédito. Duas sessões PostgreSQL reais: exatamente uma alocação final vencedora; perdedor aborta por quantidade excedida.
- `focus.json`: **85 PASS/0 FAIL**, transporte simulado e consumidores reais; não prova RLS.
- `vitest.json`: **1290 PASS/29 FAIL**, 1319 testes, resultado histórico intacto. Falhas em contasPagarBloco4 (1), novoPedidoAckDialog (5), novoPedidoAmbiguousRetry (8), novoPedidoAttemptClosure (14), novoPedidoDeliveryDate (1). A continuação abaixo registra reprodução independente e fechamento, sem transformar este RED em PASS.
- Logs `pg-run1` a `pg-run13`: preservam erros de setup/compilação/integração e resultados intermediários; nenhum histórico apagado. `pg-final` é execução independente, não edição dos RED.
- Prévia: último registro consultado `build OK` em 12:56:44 UTC. Typecheck separado não executado; não declarado aprovado.

## Limites que continuam bloqueando integração integral

**Fiscal interno/contabilidade não comprovados:** `b2b_integration_dependencies()` nega incondicionalmente no candidato. Não há endpoint que ateste autorização fiscal do fornecedor com as dependências canônicas reais; documentos/autorizações/cancelamentos são exclusivamente fixtures privadas sintéticas. Não remover esse bloqueio para obter PASS. Geração usa emissão do documento autorizado como âncora; entrega não reinicia prazo. Sem liquidação automática.

**Legado real sem evidência INSERT:** captura não contém trigger de INSERT auditando parcelas. O controle executa o gerador capturado e primeiro comprova bloqueio; o positivo fornece uma evidência INSERT sintética explicitamente identificada. Isso não recupera nem certifica títulos históricos reais. Sem prova existente verificável, continuam bloqueados, sem backfill.

**Bases líquidas por item:** alocação exige soma dos subtotais líquidos exatamente igual ao principal aceito. Cart/create candidato escreve `line_final_amount` canônico. Origem que só tenha subtotal bruto/desconto agregado fica bloqueada, sem inventar rateio comercial.

**Autoridade e instalação:** harness substitui Auth/h15/RBAC/C2, pricing e journal por seams sintéticos; não comprova atores reais nem revogação durante espera. Calendário sintético não certifica catálogo oficial nacional/Paracatu. PRE/POST completos da composição, instalação integral das dependências canônicas, ingestão fiscal interna, administração/publicação de condições e contabilidade permanecem pendentes. A revogação adicional foi reexecutada integralmente na continuação abaixo, sem concessão de acesso cliente.

As correções são código candidato consumido por RPCs/gerador/baixa e por testes do consumidor, mas **não representam os três pontos integralmente homologados**. Saídas externas e capacidades reais continuam fechadas.

## Continuação ccb83d2 — 01/11, 12:59 UTC

Base comprovada: `ccb83d2d531ff4a2906e2afef198b0ed2293c78b`. Evidências novas em `continuacao-1259/`, sem sobrescrever os REDs anteriores.

### Reprodução das 29 falhas e causa observada

Antes de qualquer alteração de teste/código, os cinco arquivos exatos foram executados com `--maxWorkers=2`: **43 PASS/0 FAIL** (`reproduction-red.json`, nome preserva o objetivo da reprodução, não seu resultado). A mesma rodada ampla anterior, com somente essa opção adicional, produziu **1319 PASS/0 FAIL** (`regression-final.json`). Nenhum timeout ou assert foi alterado, nenhum gate de UI/autoridade relaxado.

O RED anterior foi executado sem limite explícito de workers numa máquina com 16 CPUs. Dos 29 resultados negativos, 23 registram somente `STACK_TRACE_ERROR`; seis registram ausência de elementos esperados após operações assíncronas (quatro botões de confirmação e dois produtos). A hipótese de contenção de recursos/temporização na execução paralela é compatível com a reprodução; os dados não provam uma causa interna individual para os 23 stack traces truncados. Não seria correto inventar 29 bugs de negócio ou aplicar as sugestões estáticas de fixtures quando os mesmos asserts já passam na base ccb83d2. O fechamento aqui é **reexecução controlada**, não correção fictícia de código operacional.

### PostgreSQL após fences/revogação

`continuacao-1259/pg-final` preserva **89 PASS/2 FAIL**. As duas falhas novas eram de resolução SQL: coexistência de overloads com parâmetros DEFAULT torna a chamada de nove/quatro argumentos ambígua antes de verificar EXECUTE. O controle ACL já negava corretamente. Corrigido o teste para ocultar temporariamente o overload novo em uma transação que aborta, sem alterar corpo/ACL legado; assim a invocação verifica a negação real de EXECUTE. Os erros finais estão em `old-create-denial.log` e `old-simulate-denial.log`.

`pg-final-v2`: **91 PASS/0 FAIL**, instalação e execução completas após os fences finais. O harness instala os dois corpos legados capturados e sua concessão anterior exclusivamente no PostgreSQL descartável, aplica a revogação candidata e demonstra ACL fechada e chamada pelo papel `authenticated` negada. Nenhuma concessão nova do candidato foi necessária; o caminho positivo novo continua executado pelo proprietário do harness com Auth/C2/pricing/journal/fiscal sintéticos explicitamente separados.

Novos controles econômicos: original financiado **62172,84** permanece; cancelamento não pago restaura residual **20724,28**; recebimento confirmado **100,00** não muda; substituição consome residual até **0**, retém o título cancelado com seu valor original e cria identidade nova. Tentativa de cancelamento de título pago mantém a imagem exata de títulos/parcelas/valores. `economic-retention.json` preserva antes/depois. Nenhum estorno de recebido, exclusão ou reescrita de original ocorreu.

Eventos externos: invocação da alocação e INSERT direto de autorização/cancelamento pelo papel cliente são negados, mesmo no harness onde as dependências sintéticas são substituídas. Isso é prova ACL em réplica, não JWT/RLS hospedado. O candidato distribuído continua com `b2b_integration_dependencies()` deny-only e sem produtor fiscal confiável.

### Comandos novos e validação final

```text
bun run test -- <cinco arquivos que falharam> --maxWorkers=2 --reporter=json --outputFile=.../continuacao-1259/reproduction-red.json
bun run test -- src/test/financeiro src/test/pedidos src/test/comercial src/test/homolog --maxWorkers=2 --reporter=json --outputFile=.../continuacao-1259/regression-final.json
PATH=/nix/store/wm063nf09jrvk2kxa3hp7dncy5qjxjy0-postgresql-17.11/bin:$PATH python3 scripts/financial-price-generator-20261029/integration/test-local.py .../continuacao-1259/pg-final-v2
bun run test -- src/test/financeiro src/test/pedidos src/test/comercial src/test/homolog --maxWorkers=2 --reporter=json --outputFile=.../continuacao-1259/regression-complete.json
```

O consumidor agora também testa projeções da nova réplica, mantendo as fixtures históricas intactas. Typecheck manual **não executado**, conforme limite solicitado e instrução de validação automática; não é declarado aprovado independentemente. Build automático observado OK; não foi acionado manualmente.

Regressão `regression-after-pg.json`: **1326 PASS/0 FAIL**, incluindo sete controles adicionais do consumidor sobre a primeira réplica desta continuação. Depois, a referência do consumidor foi atualizada para `pg-final-v2` (mesmos envelopes positivos, novos UUIDs locais); a tentativa `regression-complete` foi interrompida pela infraestrutura antes de gravar JSON final e **não é contabilizada como PASS**. Assim, a validação SQL v2 é completa (91/91), mas a repetição Vitest específica após essa troca de referência não está comprovada. Log interrompido preservado. Matriz/RED–GREEN e manifesto SHA256 usam somente resultados efetivamente gravados; prévia registrou build OK às13:10:24 UTC.

### Intervenção externa necessária — NO_GO mantido

1. Fonte imutável real de INSERT legado: auditor deve fornecer/validar a cadeia existente; ausência não pode ser remediada criando audit fictício ou inferindo origem por valores. Até lá, legado real desconhecido bloqueado.
2. Atestação fiscal interna confiável e contabilidade: dependências canônicas precisam ser capturadas/revisadas e exercidas independentemente; comprador não atesta autorização, fixtures não liberam capability.
3. Administração/publicação de condições, calendário oficial, PRE/POST integral e provas reais de ator/tenant/revogação/JWT/RLS continuam fora da prova sintética. Qualquer instalação futura requer autorização separada; não há autorização implícita nesta entrega.

Código local/testes do recorte encerrados, sem hospedado, publicação, implantação, cobrança, emissão fiscal real, secrets, gates/capabilities reais ou automações alterados.

## Revisão 13:16 — centavos intermediários, tolerância e Price

Base observada `5ed3451b2bd4ae94a9fe789e846ba684b4a32c27`, continuidade local do ccb83d2. Sem acesso hospedado/implantação. Evidências aditivas em `revisao-1316/`; capturas/hashes e todos os RED anteriores intactos.

### Reprodução e correções integradas

- `partial.sql.review / b2b_allocate_document`: quantidade ativa não recuperava centavos após reversão do documento intermediário. Item100,01/qtd3 gera33,34/33,33/33,34; cancelar segundo devolve33,33, não33,34. `schema.sql.review` acrescenta `item_money` imutável por item/documento; alocação consulta principal/juros ativos e o último consome residual monetário exato, preservando os documentos anteriores. Não há backfill de história nem remoção do vínculo único legado. Pedido→crédito e revisão sob locks permanecem.
- `partial.sql.review / b2b_credit_balances`: valida configuração completa e tolerância não nula/não negativa; atraso ocorre somente em `due_date < CURRENT_DATE - overdue_tolerance_days`, preservando o limite inclusivo. Não inventa tolerância padrão.
- `origin.sql.review / b2b_proven_money_row`: extrai o mesmo discriminador validado já usado na projeção e o integra no crédito. Price comprovado do parceiro entra uma única vez com juros; allocation/legacy continuam validados; fonte desconhecida, alterada ou de outra empresa bloqueia. Price misturado com origem B2B continua negado, não reclassificado por heurística.

### Resultados brutos RED/GREEN

- `pg-red-v3`:98PASS/10FAIL, teste completo sobre candidato anterior; reproduz substituição intermediária negada, tolerância ignorada/NULL/negativa aceita e Price comprovado recusado. Uma divergência adicional float no verificador ficou preservada:50,019999999999996 versus50,02; corrigido apenas o verificador com Decimal, sem alterar esperado monetário.
- `pg-green`:114PASS/1FAIL (essa divergência float).
- `pg-green-v2`:123PASS/4FAIL em controles novos: três sondas negativas usavam nome de trigger incorreto e uma expectativa manual distribuía o centavo de juros no item errado. O rateio cumulativo independente correto é0,03/0,02 pelos dois itens; segundo documento tem0,01/0,00. Correções restritas ao harness, RED intacto.
- `pg-final`:**127PASS/0FAIL**, instalação completa com fences/revogação final; controles de overloads antigos negados e caminho novo positivo, concorrência em sessões PG, origens negativas, cancelamento/substituição intermediária e inversa atômica, itens distintos e juros centesimais. Histórico original/residual/recebido preservado; sem título real/fiscal externo.
- `regression-final.json`:1323PASS/3FAIL em `novoPedidoAttemptClosure`, somente STACK_TRACE_ERROR; `regression-reproduction.json`:16PASS/0FAIL no mesmo arquivo sem mudar código/asserts/timeouts. `regression-final-v2.json`:**1326PASS/0FAIL**, rodada ampla com `--maxWorkers=2`. Instabilidade não é apresentada como bug de negócio corrigido; todos os logs/JSON negativos permanecem.

Comandos efetivamente executados (cada pasta PG é nova):
```text
PATH=/nix/store/wm063nf09jrvk2kxa3hp7dncy5qjxjy0-postgresql-17.11/bin:$PATH python3 scripts/financial-price-generator-20261029/integration/test-local.py docs/correcoes-origem-parcial-servidor-20261101-evidencias/revisao-1316/pg-final
bun run test -- src/test/pedidos/novoPedidoAttemptClosure.test.tsx --maxWorkers=2 --reporter=json --outputFile=.../regression-reproduction.json
bun run test -- src/test/financeiro src/test/pedidos src/test/comercial src/test/homolog --maxWorkers=2 --reporter=json --outputFile=.../regression-final-v2.json
```

`matrix.json/csv` registra cada rodada/cenário e `sha256.json` os artefatos brutos. Fixtures Price incluem parcela efetivamente criada pelo gerador capturado e delta de crédito100,03; não é controle vazio. Datas de teste/origens negativas alteradas somente em transações locais revertidas, com exceções de importação exclusivamente no harness sintético. Typecheck/build manuais não executados; prévia automática consultada OK. Não há E2E real.

**NO_GO permanece:** INSERT legado real imutável ausente, atestação fiscal interna/contabilidade, administração autorizada de condições, catálogo oficial de feriados e prova real JWT/tenant/revogação exigem intervenção externa/revisão independente e autorização separada antes de qualquer instalação. Novas estruturas não remedeiam históricos nem concedem acesso ou capabilities reais.


## Complemento 13:33 — ACK/preview/calendário versionado

`build.py` removia a atribuição de `v_first_due` na simulação e mantinha taxa/meses do `v_plan` no ACK; ambos RPCs usavam calendário global fixado em vez da versão aceita. Reprodução concreta com plano legado9%/9meses e condição1,8%/3parcelas, e calendário global sintético com onze dias adicionais bloqueados. Não se editaram condições históricas: altera-se somente plano legado/fixture global do harness descartável para demonstrar divergência.

Correção por deltas exatos sobre capturas preservadas: create/sim selecionam `holiday_calendars.version` da condição, falham se ausente e calculam primeira data útil a partir da primeira linha de `v_rows`; sim devolve taxa/meses da versão aceita. ACK inclui `schedule_anchor` com `kind=PROVISIONAL_ISSUE_DATE`, data civil de simulação, versão de calendário e `fiscal_due_dates_final=false`; create inclui a mesma identificação e primeira data provisória. Valores permanecem Price por período. `src/hooks/useSimulateB2BPaymentPlan.ts` tipa os campos recebidos, sem introduzir writer nem política de retry. Gerador documental permanece ancorado em `d.issue_date` da autorização interna, com calendário de `s.condition`; a data provisória NÃO reinicia prazo fiscal nem substitui emissão real.

Resultados em `revisao-1333/`: **PG RED128PASS/6FAIL → GREEN134PASS/0FAIL**. O RED registra ACK nulo, taxa/meses legados, calendário divergente, ausência da âncora provisória e data create ausente. Teste de consumidor React adota o ACK realmente capturado do PG (apenas identidade/tenant substituídos para transporte sintético) e exige taxa1,8%,3parcelas, primeira data igual ao schedule, calendário aceito e flag provisória falsa para definitividade fiscal. **Regressão1327PASS/0FAIL**, dois workers, asserts/timeouts preservados.

```text
PATH=/nix/store/wm063nf09jrvk2kxa3hp7dncy5qjxjy0-postgresql-17.11/bin:$PATH python3 scripts/financial-price-generator-20261029/integration/test-local.py docs/correcoes-origem-parcial-servidor-20261101-evidencias/revisao-1333/pg-green
bun run test -- src/test/financeiro src/test/pedidos src/test/comercial src/test/homolog --maxWorkers=2 --reporter=json --outputFile=docs/correcoes-origem-parcial-servidor-20261101-evidencias/revisao-1333/regression.json
```

Matriz/logs/JSON/SHA256 aditivos preservam RED. PG completo inclui os controles anteriores de centavos/tolerância/origem e fences/overloads/concorrência; não é E2E real. Typecheck/build manuais não executados; último build automático consultado OK. NO_GO de INSERT legado real, atestação fiscal interna/contabilidade/admin condições/calendário oficial e provas reais permanece. Nenhum acesso hosted/deploy ou alteração de gates/secrets/condições históricas.
