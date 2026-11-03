# Correções locais B2B AR Bio — revisão de origem monetária

## Escopo e contenção

Base histórica: `b1677a601b5b49139434463c880b5fc81c8f9a30`. Revisão local em 01/11/2026, 02:20 UTC. Nenhum acesso hospedado, implantação, publicação, emissão fiscal, cobrança, comunicação ou cron. Entrega B2B e gatilho fiscal continuam fechados. O cliente isolado e o banner de preparação não foram alterados.

## Correção da fixture, sem alterar esperados

AUD-FIN001/002 históricos forneciam `original_amount=10300`, `interest_amount=300`, sem origem, esperando 10300. A mesma forma numérica poderia legitimamente representar principal10300 mais mora300. Não existe discriminação segura por números. O teste de mora10300+100 continua esperando10400; legado10000+300 continua10300.

A fixture atual vem de `test-money-origin.py`: gerador Price existente cria a parcela; uma transação sintética, descartável e revertida representa principal10000+financiamento300 no snapshot. A candidata `money-origin-projection.sql.review` lê esse snapshot e produz o envelope real, capturado em `src/test/financeiro/fixtures/money-origin-projection.json`. O ajuste do snapshot é **seam sintético explicitamente identificado**, não dado comercial nem remediação autorizada. A projeção dos valores originais do gerador também foi exercitada sem transformação.

Não foi criada coluna fictícia no esquema operacional. O **candidato Price exercitado no harness** armazena `original_amount` com financiamento e `interest_amount=0`, mantendo breakdown no snapshot imutável. Isso NÃO descreve todos os writers: a captura de `generate_b2b_receivable_secure_impl` grava `original_amount=v_sch.amount` e `interest_amount=COALESCE(v_sch.interest_amount,0)`, confirmando a ambiguidade histórica. A projeção candidata discrimina apenas sua origem comprovada; não atesta automaticamente a origem do writer B2B capturado nem transforma históricos. Auth/h15/staff, origem fiscal e accounting do harness continuam sintéticos; estas provas não homologam JWT/RLS reais.

## Integração efetiva e erro visível

- `src/lib/financeiro/receivableOrigin.ts`: `readProvenReceivables` chama a projeção canônica e valida contrato, título/parcela, soma principal+financiamento e discriminação. Marcador isolado não autoriza operação.
- `src/components/financeiro/ContaDrawer.tsx`: consulta de recebíveis usa o leitor; falta de projeção/origem aparece como **Origem monetária não comprovada. Recebimento bloqueado.** Não monta dados de sucesso a partir de saldo zero.
- `src/pages/financeiro/ContasReceber.tsx`: KPI pagina a projeção; erro mantém indicadores indisponíveis, não valores zero confiáveis.
- `src/components/financeiro/BaixaDialog.tsx`: prova inválida oculta saldo calculado, trava formulário/Confirmar e barra dispatch. A própria mutation revalida a prova. Reenvio de comprovante de baixa já confirmada permanece distinto.
- `scripts/financial-price-generator-20261029/money-origin-projection.sql.review`: candidata inativa, staff/tenant canônicos, snapshot privado, sem GRANTs novos. Não instalada e indisponível no backend antigo. Nenhum fallback à tabela/heurística.

**Limite importante:** origens legadas sem prova monetária versionada permanecem indisponíveis nos consumidores operacionais. As funções puras preservam a convenção legada para controles e histórico; ausência de marcador na função pura não é autorização para baixa. Não foi inventado um atestado de origem legada. A projeção não transforma o gerador manual em gatilho fiscal.

## Price e composto genérico

Contrato/fixture usa `amortization_type='price'` explicitamente; composto genérico continua legítimo. O formulário expõe prévia Price local e impede salvamento Price com contrato indisponível. O controle de composto genérico mantém final92720,25 para principal90000/taxa1,5%/dois períodos. Não se reinterpretam todos planos compostos.

O esperado histórico AUD-CROSS001 **62172,85 ficou preservado no RED original**. A revisão independente 02:30 confirmou a política de amortização em centavos por período: 20724,28 em cada parcela, soma62172,84 e saldozero. O assert corrente passou a62172,84 com justificativa e oracle Decimal independente; não se acrescentou centavo sem fundamento. Taxas da fixture não são defaults nem condições comerciais publicadas.

## Evidências antes/depois

| Execução | Resultado | Limite |
|---|---:|---|
| Mesma fixture/probe sobre b1677a6 | 2 PASS / 2 FAIL | FIN001/002 falham10600≠10300; controles legados passam |
| Aceitação atual origem/UI/Price genérico | 25 PASS / 0 FAIL | Transporte local e fixture capturada do PG |
| Regressões financeiras + preview + contenção | 968 PASS / 2 FAIL | AUD-CROSS001 e runner de proveniência financeira |
| Harness Price descartável | 338 PASS | Auth/fiscal/accounting sintéticos, não E2E hospedado |
| Projeção descartável | 5 PASS | Inclui tenant estrangeiro negado e fixture sintética revertida |

A primeira comparação PG falhou por soma float no verificador; corrigida para Decimal, sem mudar esperado, preservando log FAIL inicial. Históricos RED originais estão em `docs/correcoes-b2b-arbio-20261031-evidencias/origin-review/AUD-historical-b1677a6.ts.txt` e commitb1677a6. Todas as rodadas, inclusive falhas, estão na pasta de evidências; `sha256.json` registra hashes. Matriz aditiva JSON/CSV aponta cada execução e não modifica a matriz histórica6225.

Build/typecheck do ambiente registraram `build OK` após as correções; não foram executados comandos manuais de build/typecheck. Nenhuma prova autenticada hospedada foi executada por restrição explícita. A prova da UI é componente React real, não sessão real.

## Pendências e critérios

1. **P0 / origem legada:** definir e revisar fonte canônica versionada para cada writer legado; só liberar consumidor quando a projeção validar origem sem heurística e provar saldo/baixa/KPI/replay/estorno pelo mesmo contrato.
2. **P0 / implantação:** candidata SQL e readers não instalados; precisa futura revisão de ACL/RLS/JWT A/B e baseline exata. Esta etapa não autoriza instalação.
3. **Resolvido local / centavo Price:** política por período confirmada, esperado corrente corrigido com48 vetores Decimal; RED histórico intacto.
4. **Resolvido local / proveniência runner:** fingerprints históricos intactos; manifest incremental explicitamente pinado para fontes alteradas. Verifica ancestralidade e hash atual, mantém SOURCE_ONLY/BLOCKED, não prova semântica operacional.
5. **Contrato fiscal e meios/configuração:** snapshots fiscais, autorização NF-e/NFS-e, idempotência/eventos, configuração personalizada server-side completa e origem AR Bio emitente/recebedor ainda não implementados integralmente. Continuam fechados; sem título/nota/cobrança reais.

Os commits são registrados automaticamente pelo ambiente; os hashes observados em cada rodada não representam um commit manual criado pelo agente. Baseline e manifests identificam exatamente o material de teste; não há publicação.

## Revisão adicional 02:28 UTC — contratos capturados

Fonte exclusivamente local: `scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json`. Teste verifica hashes MD5 das definições capturadas, não consulta servidor.

- **Aprovação:** `approve_partner_order`, hash `664f63441c92a6716f0117362255ec9e`, é `RETURNS void`. Corrigido `useApprovePartnerOrder`: `data:null/error:null` é sucesso de transporte válido; mantém releitura por invalidação, fence de sessão, recusa de erro, `success:false` e identificação estrangeira. Não exige envelope positivo universalmente. A expectativa anterior de rejeitar null era incorreta; substituída por controle void positivo sem alterar os RED históricos arquivados. Outros writers com ACK contratual específico continuam exigindo seus próprios envelopes.
- **Exposição:** `fn_b2b_credit_exposure`, hash `213ac31f3a30816ead75365b0d1fed18`, exclui integralmente o pedido ao existir qualquer `partner_order_financial_link`. Caracterização preserva esta lacuna, não declara correção: parcial/múltiplas notas permanece **BLOCKED** até alocação canônica implementar residual não faturado + saldo de títulos sem dupla contagem, reversões, locks/CAS e rechecagem ator/tenant. Não reabrir faturamento/entrega para exercitar isto. Nem candidato de crédito nem estes testes resolvem a alocação.
- **Origem B2B:** `generate_b2b_receivable_secure_impl`, hash `1bdac7fae6d702fb42d3a30539e9c9c3`, persiste amount e interest simultaneamente. A soma ambígua precisa contrato/origem canônicos derivados de snapshot e leitura escopada, nunca comparação por valor/taxa/parceiro. Continuidade desta origem legada ainda pendente; consumidor permanece bloqueado sem prova.
- **Oracle:** taxas usadas nos testes são exclusivamente sintéticas; não são condições contratuais, não autorizar publicação automática nem configuração comercial.

Rodada incremental local: **18 PASS / 0 FAIL**, aprovação (void/positivo/negativo/erro), três caracterizações de captura, integração de origem e contenção SDK. JSON/log brutos em `evidencias/revisao-0228/` na pasta deste relatório; esta rodada não substitui as regressões anteriores de 968 PASS/2 FAIL. Build automático registrou `build OK` às 02:29:26; typecheck separado não reexecutado manualmente. Nenhum acesso hospedado ou instalação.

## Revisão independente 02:30 — correções e evidência final

Relato externo do proprietário sobre commit0c5437:57PASS/3FAIL,48Price concordantes. **EXTERNAMENTE RELATADO**, não executar/atribuir como prova deste ambiente. Oracle próprio adicional: `revisao-0230/decimal_oracle.py`, PythonDecimal70 dígitos,48 vetores, ROUND_HALF_UP em cada período e residual final; comparação com módulo real em `priceDecimalOracle.review.test.ts`. Quatro principais × quatro taxas sintéticas × três contagens. Nenhum dado comercial criado.

### Código efetivamente integrado
- `paymentContract.requirePaymentChoice`: own-property, nega constructor/toString/__proto__/desconhecidos e versão/prazo inválidos. Chamado pelos consumidores pedido/simulação e agora pelo cronograma.
- `paymentSchedule.nextBusinessDay`: valida datas civis da cobertura, ordem, versão, lista e cada feriado dentro da cobertura; deslocamento fora dela falha fechado. Calendário do teste é sintético, não dataset oficial instalado.
- `ContasReceber`: remove SELECT* e parcelas financeiras cruas da listagem. Botão de baixa procura parcela/título na projeção escopada validada dos KPI; ausência mostra bloqueio e não abre pagamento. Drawer/baixa revalidam origem. B2B capturado ambíguo continua bloqueado, não default legado.
- Prazo no seletor e pedido: **data de emissão do documento fiscal autorizado**, nunca data do callback de autorização. Título/gatilho fiscal continuam fechados.
- Void e discriminador monetário da revisão anterior preservados.

### Falhas amplas e ajustes de fixture
O JSON histórico contém **167 arquivos,2358PASS/34FAIL**, não417 arquivos (campo agregado do runner foi interpretado incorretamente na investigação). Rodada exata desses167 arquivos agora: **2394PASS/0FAIL**; total pode variar por testes parametrizados adicionais. Rodada comercial/financeira/pedidos/config selecionada: **1420PASS/0FAIL**,48 vetores incluídos. Não somar rodadas sobrepostas.

As falhas antigas eram: expectativas de monitor B2B antigo versus C2, produtor sem contexto explícito exigido pelo layout, handler sem verifiedClients, drafts técnicos negados segundo regra histórica e produtor sem clientes verificados. Nenhuma autorização runtime alterada. B2B agora oferece envelope C2 real completo e usa guard técnico para papel técnico; teste não fabrica acesso gerencial ao técnico. Expectativas de remontagem em fingerprint idêntico atualizadas à lease existente (não enfraquecida no runtime); revogação/mudança/timeout/Blob continuam assertados. Suítes históricas de producer probe isolam C2 no transporte/módulo de teste e declaram limite; **não são prova do monitor C2**. Multiperfil atual tem suas próprias suítes na rodada ampla. RED anteriores e configurações reais preservados.

### Validação e limites
Logs/matriz JSON/CSV e hashes incrementais em `docs/correcoes-b2b-arbio-20261031-evidencias/revisao-0230/`. Build automático registrou OK após edições. A execução manual de build/typecheck é vedada pelo ambiente; não declarar execução separada de typecheck sem log específico. Nenhuma consulta hospedada, emissão/baixa/fiscal real, instalação, publicação ou cron. SQL crédito/origem permanecem candidatos inativos; alocação parcial, fonte canônica legada B2B e contrato servidor fiscal/config completo ainda bloqueiam operação. Os testes locais não removem esses impedimentos nem alegam integração financeira completa.

## Complemento 02:42 — ACK JSONB independente da ordem

`paymentChoicesEqual` valida o envelope desconhecido por `requirePaymentChoice`, normaliza os campos tipados e compara meio, versão e prazo individualmente. `useCreatePartnerOrder` e `useSimulateB2BPaymentPlan` agora consomem essa comparação; não usam JSON.stringify para comparar payment_choice. Mesmas chaves em ordem diferente são ACK válido; campo faltante, tipo/valor divergente e escopo retornado conflitante são negados. Escopo opcional retornado não substitui capability obrigatória validada por ator/empresa/parceiro; simulação mantém verificação obrigatória do parceiro e plano. Nenhuma nova exigência universal de campos de escopo no ACK legado foi inventada.

Testes integrados em ambos hooks: JSONB reordenado, prazo ausente/divergente, versão string e tenant estrangeiro. Pedido reservado comprova sucesso→committed, divergência→uncertain, inflight liberado, exatamente um writer; não modifica mecanismo de replay, fechamento, journal, chaves ou política de repetição. Rodada focada:57PASS/0FAIL; regressão pedidos/financeiro/comercial/contenção:1345PASS/0FAIL (rodadas sobrepostas, não somar). Logs e matriz aditiva em `revisao-0242/`; resultados anteriores preservados. Não executado hosted/deploy; candidatos servidor/origem B2B e parcial continuam bloqueados.

## Complemento 02:45 — projeção vinculada ao título solicitado

**Falha reproduzida, não exploit RLS:** `src/lib/financeiro/receivableOrigin.ts`, função `readProvenReceivables`, verificava coerência interna de origem mas adotava uma parcela de outro título solicitado. A fixture PG previamente capturada `audit_fixture_projection` foi reutilizada em transporte simulado, sem nova execução PostgreSQL ou conexão hospedada. RED anterior à correção: **8 PASS/5 FAIL**, preservado em `revisao-0245/red.json` e `.log`: alvo diferente, resposta mista, duplicatas nos modos título/KPI e ID numérico eram aceitos.

**Correção integrada:** cada linha deve ter `receivable_id === titleId` quando o alvo não é null. O envelope inteiro é recusado se qualquer linha falhar; IDs de parcelas devem ser strings não vazias e únicos. Várias parcelas distintas do mesmo título continuam válidas. `titleId=null` permanece disponível para KPI com escopo resolvido pelo servidor; não concede autorização. `ContasReceber` também rejeita IDs repetidos entre páginas e impede abrir baixa a partir do cache positivo se a consulta atual falhou ou está em atualização. Não há fallback silencioso, soma duplicada ou saldo zero como substituto de erro; política de repetição/incerteza intacta.

**Consumidor real testado em jsdom:** `ContaDrawer` mantém resultado na chave do título pedido. Resposta atrasada de A após trocar para B não altera parcelas de B; erro com envelope estrangeiro, inclusive após positivo/refetch, mostra indisponibilidade e não resumo/baixa. Não foi necessário substituir o mecanismo de consulta. `ContasReceber` tem regressões específicas para erro de refetch com cache positivo e duplicata entre páginas. Controle positivo preservado: título igual retorna a projeção capturada e saldo **10300**, nunca10600.

**Evidência:** foco inicial24PASS/0FAIL; rodada ampla inicial1304PASS/8FAIL em95 arquivos. Uma falha era o pin de fonte de ContasReceber anterior à alteração autorizada; sete eram timeout5000ms sob concorrência padrão. Preservados logs e asserts. Manifesto incremental `consumer-revision.json` registra hash anterior/atual com razão da mudança, sem reescrever histórico. Reexecução com `--maxWorkers=2`, mesmos asserts/prazos e duas suítes explícitas de homolog: **97 arquivos,1363PASS/0FAIL**. Rodadas sobrepostas não se somam. Matriz JSON/CSV aditiva, hashes e logs em `docs/correcoes-b2b-arbio-20261031-evidencias/revisao-0245/`.

**Limites mantidos:** testes de transporte/consumidores locais, não prova JWT/Storage/RLS nem browser autenticado. Build automático OK; typecheck manual não executado (vedado pelo ambiente). Zero hosted, deploy, publicação, emissão, cobrança, comunicação ou cron. Contrato servidor de condição/configuração e origem legada ainda depende de fonte canônica revisada; parcial sem alocação, candidatos inativos, contenção e NO_GO preservados.