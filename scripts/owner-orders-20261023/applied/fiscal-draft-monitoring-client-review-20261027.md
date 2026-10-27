# Revisão de clientes — rascunho fiscal e reprogramação, 27/10/2026

## Limites e instalação

- Apenas código/testes/documentação locais. Nenhum SQL/DDL hosted, publicação, mudança contábil/tributária, papel ou fluxo novo. Cliente Supabase canônico preservado (`swzpzcwiasxmjutrmvkm`); tipos gerados não alterados.
- Backend será preparado/aplicado separadamente pelo auditor. **44 funções com40001 permanecem registradas até aplicação confirmada**. Nenhum novo pós-hash/implantação inferido.
- Fiscal previsto: update rejeita `p_expected_version IS NULL`/<=0, CAS também no UPDATE e conflito/PT409. Não muda criação/DRAFT, validações fiscais, snapshots ou atestação.
- Reprogramação prevista: actor técnico ativo, escopo fazenda/cliente/talhão tenant, origem mesma fazenda, autorização pós-lock e timestamp obrigatório/PT409. Sem corpo/retorno atualizado fornecido: contrato JSON positivo permanece pendente de conciliação com auditor; não assumir homologação por UI.

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
- Reprogramação rejeita retorno nulo/erro/falso/ID divergente/sem ID correspondente; formato positivo completo depende do corpo fornecido pelo auditor. Não aceita apenas flag success/ok isolada. Invalida apenas consulta de monitoramento do ator capturado após resposta aceita e fence válida.
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

## Pendências independentes

1. Auditor: preparação/aplicação/pins/retornos de ambos backends; autorização pré/pós-lock, tenant/origem e CAS/atomicidade reais não certificados aqui.
2. Confirmar envelope JSON positivo de reprogramação para conciliar parser sem falso sucesso; formato desconhecido permanece bloqueado.
3. Homologação JWT/RLS A/B/revogação e corrida real, preservando dados produtivos/contabilidade DRAFT; ausência de credenciais/sessões não implica PASS.