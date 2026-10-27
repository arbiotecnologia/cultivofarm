# Revisão de clientes — rascunho fiscal e reprogramação, 27/10/2026

## Limites e instalação

- Apenas código/testes/documentação locais. Nenhum SQL/DDL hosted, publicação, mudança contábil/tributária, papel ou fluxo novo. Cliente Supabase canônico preservado (`swzpzcwiasxmjutrmvkm`); tipos gerados não alterados.
- Aplicações confirmadas pelo proprietário27/10 00:19UTC; **contagem atual42 funções40001**. NÃO reaplicar. Hashes abaixo são informados pelo auditor, não recapturados pelo agente.
- `fiscal_draft_required_revision_http409_20261027`, pósMD5 `224ab7944abd13190fe8ea1044216218`: update rejeita revisãoNULL/<=0/stale comPT409 e CAS no UPDATE. A NULL/zero/stale409, B referênciaA403 e corrida versão1→um200/outro409 reais relatados. Rascunho fictícioA `0e3e8145-7a35-40ee-82db-86fa3a9c6651` DRAFT R$1 sem emitir; nenhuma edição pelo agente.
- `monitoring_tenant_boundary_required_cas_20261027`, pósMD5 `b32bf163ed7ccb989f4f0b653827d825`: helper privado `monitoring_refs_in_actor_tenant(fazenda,talhao,origem)` e policy RESTRICTIVE ALL authenticated; fazenda/cliente/talhão tenant, origem mesma fazenda. RPC gate cfstate/technical_actor_ready/roles admin-gestor, recheck/FOR UPDATE/CAS obrigatório, PT404 alheio-ausente ePT409stale. Nenhuma mudança contábil/tributária.

## Callers encontrados e desvios

| Serviço | Caller runtime / componente | Situação anterior | Preparação local |
|---|---|---|---|
| `rpc_fiscal_draft_save` | `src/hooks/useFiscalRascunho.ts` → `src/components/fiscal/documentos/RascunhoWizard.tsx` → `src/pages/fiscal/FiscalDocumentos.tsx` | versão por argumento; hook sem fence/retry explícito; wizard assumia1 também em update sem revisão | revisão positiva obrigatória em update; PT409/contexto; resposta validada; fence/trava; wizard mantém edits/revisão e não assume1 em update |
| `rpc_reprogramar_monitoramento_v1` | novo adaptador `src/hooks/useReprogramarMonitoramento.ts` → `src/pages/MonitoramentoAlertas.tsx` | nenhum caller da RPC no runtime; página escrevia alerta e registro separadamente, timestamp fabricado, sem CAS | RPC canônica única, `p_expected_updated_at` recebe `selectedAlert.updated_at` exato; sem segundo writer/fallback; conflito mantém diálogo/data |

- Busca literal e indireta local não encontrou outro caller de runtime das RPCs. Referências em tipos, migrations/restoration e auditorias históricas não são callers ativos. Ausência textual não é prova global de inacessibilidade.
- `FiscalDocumentos.tsx` monta wizard só com `invoiceId=null`, `expectedVersion=1`: criação existente, não nova edição habilitada. Após save usa exclusivamente `draft_version` retornada. Se um futuro caller de edição omitir versão, fica bloqueado, nunca usa default1.
- Monitoramento lê `alertas_agronomicos` com `*` (inclui `updated_at`), agora pela wrapper de consulta scoped já existente. Abrir diálogo captura scope e snapshot; troca/revogação fecha/oculta o diálogo e dados. Atualização manual não rebaseia `selectedAlert`/timestamp nem edições automaticamente.
- Tipagem RPC estreita sobre o cliente canônico é necessária: `client.ts` usa `cultivofarm.types.ts`, cuja captura não contém reprogramação, embora `types.ts` a liste com timestamp opcional. Não regenerar/substituir cliente nem tornar revisão opcional no adaptador.

## Resultado e erros

- `retry:false` explícito em ambas mutações, inclusive contra defaults de QueryClient com retry3 nos testes. PT409 mapeado para conflito; verdadeiro40001 não é convertido genericamente para PT409 nem reenviado; SMTP intocado.
- 42501/PT403/PT404/P0002/403/404 mapeados para mensagem uniforme por fluxo, sem UUID/metadata/erro bruto. Isso é tratamento de cliente, não prova da autorização servidor.
- Fiscal rejeita resposta nula/malformada/ID divergente/versão não avançada/total inválido antes de sucesso e invalidação. Não modifica values nem expectedVersion em falha.
- Reprogramação exige envelope exato de5campos: `{success:true,alerta_id:uuid,data_anterior:date|null,nova_data:date,registro_origem_id:uuid|null}`. `success===true`, `alerta_id===args.id` e `nova_data===args.date`; valida UUID/datas civis e nullable obrigatórios. Apenasid/alerta_id nunca confirma. Campos extras/malformados bloqueiam. Invalida apenas consulta de monitoramento do ator capturado após resposta aceita e fence válida.
- Travas locais impedem envio paralelo do mesmo hook; finally só libera ticket próprio. Não é idempotência durável nem teste de atomicidade SQL. Exceção/revogação não gera toast de sucesso nem invalidação. Nenhum retry automático em falha ou formato desconhecido.

## Testes existentes e regressões

- `src/test/monitoramento/alertas.test.ts`: datas/filtros/status e integração estática; asserção antiga exigia writes diretos e foi conciliada para RPC/CAS sem `.update`.
- `src/test/fiscal/fase_h5_a1.draftSave.test.ts`: rascunho de empresa parcial, **não** testava a RPC draft_save.
- `src/test/fiscal/fase3_16.static.test.ts`, `fase3_17.static.test.ts`, `invoice_items_state_guard.test.ts`, `src/test/config/fiscalH15Isolation.test.ts` e `verify-fiscal-types.test.ts`: contratos/migrations/tipos estáticos; não são execução LIVE.
- `src/test/fiscal/sinief49/phase32.test.tsx`: wizard renderizado, save mockado; não é RPC real.
- Novos: `src/test/fiscal/draftSaveCasClient.test.tsx` (14 casos) e `src/test/monitoramento/reprogramarCasClient.test.tsx` (12 casos), hooks reais/QueryClient reais, Auth/transporte simulados: revisão NULL/zero/negativa/inválida; stale PT409 sem retry/limpeza; timestamps com microsegundos; erros uniformes mesmo com mensagemconflict;40001 verdadeiro sem retry; retorno inválido; revogação A→B; duplo envio/exceção/liberação/retry manual.
- Comando: `bun run test -- src/test/fiscal/draftSaveCasClient.test.tsx src/test/monitoramento/reprogramarCasClient.test.tsx src/test/monitoramento/alertas.test.ts src/test/fiscal/fase3_16.static.test.ts src/test/fiscal/fase_h5_a1.draftSave.test.ts src/test/config/fiscalH15Isolation.test.ts src/test/fiscal/verify-fiscal-types.test.ts src/test/fiscal/sinief49/phase32.test.tsx`.
- Resultado: **153/153 em8arquivos**. Validação automática `build OK`00:09:37UTC; git diff --check sem erros. Teste SINIEF exibe aviso React preexistente de nesting `<p>/<div>`, sem falha; não corrigido fora do recorte. HEAD observado `c5eaf3847d3e7353cd2983a65a469f4719b8ee44`, sem commit manual.
- Não foram executadas sessões JWT reais, SQL descartável/hosted, reprogramação real ou rascunho fiscal produtivo. Positivos simulados validam somente contrato/controle cliente, jamais autenticação positiva.

## Caminhos exatos para fixture canônica de alertas_agronomicos

- `/previsao-agronomica` em `src/App.tsx:582` → `src/pages/PrevisaoAgronomica.tsx:31` aba **Previsão Inteligente** → `src/components/previsao/PrevisaoInteligente.tsx:69–72` mutação `createAlert`, INSERT canônico em `alertas_agronomicos`. Botão **Gerar Alerta** linhas167–182 envia fazenda_id/talhao_id/tipo_alerta/nivel_risco/descricao; não envia status/data_vencimento/origem, depende dos defaults servidor. Só aparece com dados climáticos existentes suficientes e risco alto/crítico; não fabricar clima/risco para conseguir fixture.
- Mesma página, aba **Alertas** (`PrevisaoAgronomica.tsx:29`) → `src/components/previsao/PainelAlertas.tsx:31–39` `updateStatus`, UPDATE id+status anterior, selectid confirma linha; botão **Colocar em monitoramento** linha110 (`ativo`→`monitoramento`). Não fornece data_vencimento/origem e não é a RPC de reprogramação. Este writer foi apenas identificado, não modificado/certificado integralmente.
- `/monitoramento-alertas` (`src/App.tsx:584`) → `src/pages/MonitoramentoAlertas.tsx:73–87` lê `alertas_agronomicos.status=monitoramento`; linhas151–153 chamam `src/hooks/useReprogramarMonitoramento.ts` com id/data/updated_at observado. Não cria alertas nem altera status.
- `src/components/visita/PlanoMonitoramentoEditor.tsx:106–126` apenas procura alerta existente e altera data_alerta/descrição; não cria e não coloca statusmonitoramento. Não confundir tipo_alerta comstatus; componente não é o percurso de criação pedido.
- Referências fornecidas pelo proprietário: A farm `ff35e2a0-8cdc-4913-b732-61875ebd1831`, plot `a3144e03-dae2-4a05-9f07-f6943f3947f3`; B farm `46bea8e9-79fc-440b-bdb5-76f40ba4550f`, plot `806d9789-a87e-4e25-8d59-aa9eea24dabe`. Nenhuma fixture criada, vínculo/tenant não consultado pelo agente. **Não é monitoramento_avisos**.

## Conciliação cliente e pendências independentes

- 26 testes cliente anteriores PASS segundo revisão independente do proprietário; regressões novas executam hooks reais/QueryClient com Auth/transporte simulados, não novas provas JWT/RLS.
- Homologação de fixture/reprogramação A/B/revogação/origem/tenant pelo auditor permanece pendente aqui. Provas fiscais reais específicas acima são relatos externos, não execução do agente; nenhum PASS integral presumido.