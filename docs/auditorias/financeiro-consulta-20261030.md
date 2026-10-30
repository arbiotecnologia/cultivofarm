# Complemento: financeiro da entrega somente consulta

Base: `8eefab7e2581b34164e989d50416faad44f7b518`. Sem publicação, SQL, alteração de dados reais, geração financeira/fiscal ou mensagens externas.

## Correção do achado

- `src/components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx`: agora **Consulta financeira da entrega**; removidos agenda1–36, cálculo simples, valores editáveis, categorias, centro de custo, método, decisão de NF e botão de revisão de emissão. Nenhuma regra Price transplantada. Exibe somente contexto, consulta autorizada, total do título realmente retornado e abertura do lançamento existente.
- `src/hooks/useDeliveryFinanceReconciliation.ts`: retirados promessa de rascunho preservado e callback `reject`; estados explícitos `indisponivel`, `carregando`, `nenhum_titulo`, `resposta_incerta`, `recebivel_confirmado`, `fiscal_pendente`. Ausência fresca não prova rollback/estorno. Erro/duplicidade/vínculo inconsistente escondem título e navegação. Consulta mantém filtros organização+origem+cliente e fences existentes; reconsulta programática também verifica fence atual antes da invalidação, sem writer.
- Sem SELECT de `financial_categories`, `financial_cost_centers` ou `payment_methods` neste diálogo. Somente `entregas` e `accounts_receivable`; revisão de segurança não impede o caminho positivo de título existente.

## Evidências

`src/test/financeiro/deliveryFinanceReconciliation.test.tsx`: teste real do diálogo/hook/QueryClient com SDK/Auth completamente simulados, spies de RPC e insert/update/delete/upsert. Cobertura positiva de título existente, reconsulta e cache scoped; fiscal pendente, loading, ausência, erro403/PT409, duplicidade/alvo estrangeiro, mudança tenant/actor/epoch, callback programático capturado após revogação, submissão programática/Enter e zero catálogos/writes.

- Focada financeiro: **23/23 PASS**, 2 arquivos, 5,14s.
- Gate completo anterior reexecutado: **595/595 PASS**, 42 arquivos, 74,61s, zero skip.
- Transporte real bloqueado por configuração Vitest; timeout10s/teste e180s/grupo, maxWorkers2. Comandos/resultados em `financeiro-consulta-20261030/execution.json`, `focused.json`, `full-gate.json` e logs.
- Build automático após alterações: **build OK 01:32:34 UTC**; erro intermediário de interface hook/dialog em edição resolvido, registro preservado. Typecheck separado manual não executado (validação gerenciada pelo harness).
- Sem mudança em carteira/deduplicação, gates de entrega, regras Price, dependências, permissões, migrations ou funções Supabase. Não houve acesso ao banco nesta rodada.

O título exibido é apenas um registro financeiro confirmado por leitura autorizada, não prova de emissão fiscal, pagamento, quitação, fluxo operacional homologado ou rollback. Reabertura atômica/financeiro/fiscal permanece com os bloqueios concretos já registrados, sem nova exigência administrativa.