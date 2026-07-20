# Portal Executivo / Painel do Gestor — Fase 13.1

## Objetivo
Visão consolidada da operação AR Bio para tomada de decisão por administradores e gestores. Reutiliza as fontes operacionais já existentes — não há fluxo paralelo nem mocks.

## Perfis permitidos
- `administrador`
- `gestor`

Bloqueado nesta fase: `cliente_produtor`, `consultor_tecnico`, `tecnico_agronomo`, `producao`, `operador_onfarm`, `aplicador`, `financeiro`, `administrativo`.

A validação ocorre em três camadas:
1. `ACCESS_MAP["/executivo"]` em `src/lib/permissions.ts`.
2. Componente `ExecutivoPermissionGate`.
3. RPCs (`is_executivo` + `RAISE EXCEPTION` com `42501`).

## Rota
`/executivo` → `src/pages/executivo/PortalExecutivo.tsx`.

## Fontes de dados
- `portal_solicitacoes`, `visitas_checkin`, `aprovacoes_tecnicas`
- `ordens_servico_onfarm`, `lotes`, `controle_qualidade`, `envase`
- `estoque_embalagens`, `estoque_embalagem_movimentacoes`
- `entregas`, `entrega_comprovantes`
- `alertas_operacionais`, `alertas_sla_eventos`
- `accounts_receivable`, `fiscal_invoices`
- `clientes`, `fazendas`, `profiles`, `user_roles`

## RPCs
- `rpc_executivo_resumo_geral(p_filtros jsonb)` — contagens + score.
- `rpc_executivo_gargalos(p_filtros jsonb, p_limit int)` — top 10 (máx 50).
- `rpc_executivo_timeline_operacional(p_filtros jsonb, p_limit int)` — 20 últimos (máx 100).

Todas `SECURITY DEFINER`, `SET search_path = public`, validam permissão e retornam `jsonb`.

## Indicadores
Solicitações abertas, visitas pendentes, recomendações pendentes, OS ativas/atrasadas, lotes em produção, CQ pendente, envases pendentes, embalagens em estoque/sem etiqueta, entregas pendentes/sem comprovante/não faturadas, alertas críticos/altos, SLA vencidos. Métricas com fonte indisponível são listadas em `dados_indisponiveis` e mostradas como **“Sem dados suficientes.”**

## Score de saúde operacional
- `critico` (40) — qualquer alerta crítico ou SLA vencido.
- `atencao` (70) — pendências relevantes (OS atrasadas, entregas sem comprovante, sem fatura, embalagens sem etiqueta, CQ pendente, alertas altos).
- `saudavel` (95) — nenhuma pendência crítica.
- `sem_dados` (0) — 5+ fontes indisponíveis.

Os motivos textuais são reais (ex.: “3 entregas sem comprovante”).

## Tabela de preferências
`public.executivo_user_preferences` (1 por usuário). RLS: cada usuário gerencia as próprias; administradores podem ler para suporte.

## Status oficiais usados pelas RPCs (Fase 13.1.1)
- **`ordens_servico_onfarm.status`** (enum `status_os_onfarm`): `aberta`, `aprovada`, `programada`, `em_producao`, `em_cq`, `envase`, `pronto_entrega`, `entregue`, `finalizada`, `cancelada`. Ativos = todos exceto `entregue`, `finalizada`, `cancelada`. Atrasadas = ativas com `data_recomendada < current_date`.
- **`entregas.status`** (enum `status_entrega`): `separado`, `em_rota`, `entregue`, `cancelada`. Pendentes = `separado` ou `em_rota`. Sem comprovante = `entregue` + (`comprovante_id IS NULL` ou `comprovante_status ≠ 'confirmado'`). Não faturadas = `entregue` + `receivable_id IS NULL` + `COALESCE(financial_status,'PENDING_BILLING') = 'PENDING_BILLING'`.
- **`entregas.financial_status`**: `BILLED`, `NOT_BILLABLE`, `PENDING_BILLING`, `CANCELED` (apenas `PENDING_BILLING` conta como não faturada).
- **`estoque_embalagens.status`**: `em_estoque`, `reservado`, `separado`, `entregue`, `cancelado`, `descartado`, `vencido`, `bloqueado_cq`, `bloqueado_operacional`. Em estoque = `em_estoque`, `reservado`, `separado`. Sem etiqueta = `etiqueta_id IS NULL` e `status` fora de `cancelado`, `descartado`, `entregue`.

## Vínculos e campos oficiais (Fase 13.1.2)
- **Entregas → Fazenda**: a tabela `entregas` **não possui** `fazenda_id`. O filtro/exibição de fazenda nas RPCs executivas usa `LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id` e `oso.fazenda_id`. Entregas sem OS vinculada aparecem com `fazenda = null`.
- **Entregas → Cliente**: mantido `en.cliente_id` com `LEFT JOIN public.clientes c ON c.id = en.cliente_id`.
- **Descrição de entrega**: como não existe `entregas.numero_entrega`, gargalos e timeline usam `'Entrega ' || substring(en.id::text,1,8)`. Padronização de código oficial fica para fase própria.
- **Embalagem**: o campo correto é `estoque_embalagens.codigo_embalagem` (não `codigo`). Gargalo de embalagem sem etiqueta exibe `COALESCE(e.codigo_embalagem, substring(e.id::text,1,8))`.
- As RPCs executivas não referenciam mais `en.fazenda_id`, `en.numero_entrega` nem `e.codigo`.

## Filtros de período
Aplicados aos indicadores históricos via `v_data_inicio`/`v_data_fim` (períodos `hoje`, `7_dias`, `15_dias`, `30_dias`, `safra_atual`, `personalizado`). Indicadores de **fotografia atual** (embalagens em estoque/sem etiqueta, CQ pendente, envases pendentes, OS atrasadas, alertas críticos abertos) ignoram o período — refletem o estado corrente da operação.

## Limitações Fase 13.1.1
- Drilldown por gargalo navega para o módulo raiz; abertura por ID virá em fase futura.
- Timeline não diferencia ainda eventos de assinatura digital de comprovante.
- Não há aba financeira dedicada (planejada para Fase 13.2).
- Pré-requisito Envase 2.2.1 (tipos válidos no `GerarEtiquetaEmbalagemDialog`): já aplicado.

## Fases futuras
- Aba executiva financeira (com permissão para perfil `financeiro`).
- Comparativo período vs. período anterior (tendências).
- Notificações push de score crítico.
- Personalização por usuário via `cards_config` / `layout_config`.

## Fase 13.2 — Indicadores Financeiros Executivos

Adicionada aba **Financeiro** ao Portal Executivo (`/executivo`), com:
- Cards de receitas (a receber, vencido, recebido, a vencer), despesas (a pagar, vencido, pago) e faturamento (entregas não faturadas, valor faturado, fiscal pendente, recibos pendentes).
- Bloco de **risco financeiro** (`saudavel | atencao | critico | sem_dados`) com motivos textuais reais.
- **Gargalos financeiros** priorizados (AR vencido, AP vencido, entregas não faturadas, fiscal pendente) com botão "Abrir origem".
- **Ranking de clientes** por pendência (a receber, vencido, títulos abertos, entregas não faturadas, entregas sem comprovante).

### RPCs (SECURITY DEFINER + is_executivo)
- `rpc_executivo_financeiro_resumo(p_filtros jsonb)`
- `rpc_executivo_financeiro_gargalos(p_filtros jsonb, p_limit int default 10)` — máx 50
- `rpc_executivo_financeiro_ranking_clientes(p_filtros jsonb, p_limit int default 10)` — máx 50

### Status financeiros oficiais
- **AR/AP installments**: `OPEN | PARTIAL | PAID | CANCELED | OVERDUE`.
- **Vencido** = parcela não paga (status ≠ PAID/CANCELED) com `due_date < current_date`.
- **A vencer** = parcela não paga com `due_date >= current_date`.
- **Recebido/Pago** = `*_payments` confirmados (`is_reversal = false`) no período.
- **Fiscal pendente** = `accounts_receivable.fiscal_invoice_required = true` e `fiscal_invoice_status NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')`.
- **Recibos pendentes** = `receivable_payments` sem `financial_receipts` ativo vinculado por `receivable_payment_id`.
- **Entregas não faturadas** = `status='entregue' AND receivable_id IS NULL AND COALESCE(financial_status,'PENDING_BILLING')='PENDING_BILLING'`.

### Snapshots vs histórico
- **Snapshot (ignora período)**: a receber/a pagar/vencidos abertos, entregas não faturadas, fiscal pendente, recibos pendentes.
- **Histórico (respeita período)**: total recebido, total pago, entregas faturadas (via `billing_generated_at | updated_at | created_at`).

### Permissões
Apenas `administrador` e `gestor`. RPCs validam `auth.uid()` + `public.is_executivo(...)` internamente. Frontend usa `ExecutivoPermissionGate`.

### Limitações 13.2
- **Valor estimado não faturado**: sem fonte agregada confiável nesta fase — sempre em `dados_indisponiveis`.
- Portal Executivo **não executa ações financeiras** (baixa, faturamento, fiscal). Apenas leitura/navegação.
- Filtro por fazenda em entregas usa `ordens_servico_onfarm.fazenda_id` (entregas sem OS ignoram filtro de fazenda).

## Fase 13.2.1 — Correções finais

### Títulos vs parcelas
- `quantidade_titulos_abertos` = `COUNT(DISTINCT ar.id)` / `COUNT(DISTINCT ap.id)` — documentos financeiros distintos.
- `quantidade_parcelas_vencidas` = contagem real de **parcelas** (`accounts_*_installments`) vencidas.
- O mesmo critério vale para `titulos_abertos` no ranking de clientes.

### Filtros aplicados por indicador
- **Resumo (receitas/despesas em aberto)**: snapshot — respeita `cliente_id`; período não afeta o saldo aberto.
- **Recebido/Pago no período**: respeita `cliente_id` e período (`payment_date`).
- **Entregas não faturadas / faturadas**: respeitam `cliente_id` e `fazenda_id` (via `ordens_servico_onfarm.fazenda_id`).
- **Fiscal pendente**: respeita `cliente_id` sempre; respeita `fazenda_id` apenas quando `accounts_receivable.origin_type='DELIVERY'` e a entrega está vinculada a uma OS On-Farm (`entregas.ordem_servico_onfarm_id → ordens_servico_onfarm.fazenda_id`). ARs sem origem em entrega são excluídas quando o filtro de fazenda está ativo. Snapshot atual.
- **Recibos pendentes**: respeitam período (`receivable_payments.payment_date`), `cliente_id` (via `accounts_receivable.customer_id`) e, quando `origin_type='DELIVERY'`, `fazenda_id` (entrega → OS → fazenda). Recibos sem origem em entrega ignoram o filtro de fazenda.
- **Ranking de clientes**: fotografia atual de pendências; filtros `cliente_id` e `fazenda_id` aplicados; período limita `accounts_receivable.issue_date <= data_fim`.
- **Gargalos**: AR/Fiscal pendente aplicam `cliente_id` + `fazenda_id` quando `origin_type='DELIVERY'`. Entregas não faturadas aplicam `cliente_id`, `fazenda_id` (via OS) e período por `entregue_em`/`created_at`. AP vencido não tem vínculo com cliente/fazenda (omitido quando filtro de cliente ou fazenda está ativo).

### Rotas oficiais
- Contas a receber: `/financeiro/receber` (não `/financeiro/contas-receber`).
- Contas a pagar: `/financeiro/pagar` (não `/financeiro/contas-pagar`).

## Fase 13.2.2 — Ajuste final de ranking, gargalos e fiscal pendente

### Ranking financeiro
- A RPC calcula todas as métricas por cliente, aplica filtros (`cliente_id`, `fazenda_id`, período via `issue_date <= data_fim`), **ordena** e só então aplica `LIMIT`.
- Ordenação: `valor_vencido DESC → valor_a_receber DESC → entregas_nao_faturadas DESC → entregas_sem_comprovante DESC`.
- Garantia: o ranking nunca aplica `LIMIT` antes de `ORDER BY`.

### Gargalos financeiros
- Cada bloco (AR vencido, AP vencido, entregas não faturadas, fiscal pendente) é coletado num pool consolidado (`v_pool_limit = p_limit * 5`) antes da seleção final.
- Ordenação final única: `gravidade (critica → alta → media → baixa) → dias_atraso DESC → valor DESC → data mais antiga ASC`.
- `LIMIT` é aplicado **uma única vez** no conjunto consolidado — `p_limit=10` retorna no máximo 10 gargalos no total, não 10 por bloco. Máximo permitido = 50.
- AP vencido só entra no pool quando não há filtro de `cliente_id` nem `fazenda_id` (não há vínculo entre conta a pagar e cliente/fazenda).

### Fiscal pendente
- Sempre respeita `cliente_id`, `fiscal_invoice_required=true` e `fiscal_invoice_status NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')`.
- Quando `fazenda_id` está informado, conta apenas ARs com `origin_type='DELIVERY'` cuja entrega esteja vinculada à OS On-Farm da fazenda em questão. ARs sem origem em entrega ficam fora do filtro.
- Sem `fazenda_id`, o comportamento permanece o snapshot global por cliente.
- Nunca usa `entregas.fazenda_id` (campo inexistente) nem `entregas.numero_entrega`.

## Fase 13.3.1 — Correção da aba Clientes & Fazendas

- **Drawers padronizados**: `rpc_executivo_cliente_detalhe` agora devolve fazendas com `id`, `nome`, `municipio`, `estado`, `area_total`; `rpc_executivo_fazenda_detalhe` retorna `municipio`, `estado`, `area_total` e financeiro com nomes finais `valor_a_receber`, `valor_vencido`, `valor_recebido_periodo`, `valor_faturado` e `fiscal_pendente`. Eventos passam a expor `tipo`, `titulo`, `descricao`, `data`.
- **Filtro financeiro por fazenda**: quando o filtro `fazenda_id` está preenchido, `rpc_executivo_clientes_ranking` e `rpc_executivo_cliente_detalhe` calculam `valor_a_receber`, `valor_vencido`, `valor_recebido_periodo` e `fiscal_pendente` apenas a partir de `accounts_receivable` com `origin_type = 'DELIVERY'`, `origin_id = entregas.id` e `entregas.ordem_servico_onfarm_id → ordens_servico_onfarm.fazenda_id`. Sem filtro, segue o cálculo consolidado por cliente. Cada bloco financeiro inclui o campo `fonte` indicando `cliente_consolidado` ou `entregas_vinculadas_os_onfarm`.
- **Limitação**: contas a receber criadas manualmente, sem origem em `DELIVERY` vinculada a OS On-Farm, não compõem o valor financeiro da fazenda — esses lançamentos só aparecem na visão consolidada do cliente.
- **Card Oportunidades**: navega para `/visita-tecnica` (rota existente). A rota `/visitas` não existe no projeto.
- **Botões dos drawers**: `Ver clientes` aponta para `/clientes` (lista), `Ver fazenda` para `/fazendas/:id`, `Contas a receber` para `/financeiro/receber?cliente=...`, `Entregas` para `/entregas?cliente=...` ou `/entregas?fazenda=...`, `OS On-Farm` para `/ordens-servico?fazenda=...`. Não existe `/clientes/:id`.
- **Fase 14**: se houver migration de BI Operacional Fase 14 incluída no ZIP, deve ser auditada em escopo separado; esta correção não altera nada do BI/Fase 14.

## Fase 13.3.2 — Correção final de campos inexistentes nas RPCs

- **OS On-Farm**: as RPCs `rpc_executivo_cliente_detalhe` e `rpc_executivo_fazenda_detalhe` passam a usar `ordens_servico_onfarm.numero_os`. Quando `numero_os` for nulo, exibem `substring(o.id::text,1,8)` como fallback. O campo `ordens_servico_onfarm.numero` não existe e foi removido das RPCs executivas.
- **Contas a receber**: `accounts_receivable` não possui `original_amount` — esse campo existe apenas em `accounts_receivable_installments`. O cálculo de `valor_faturado` na fazenda agora usa exclusivamente `SUM(COALESCE(ar.total_amount, 0))`. Cálculos de parcelas (saldo a receber/vencido) continuam usando `COALESCE(i.net_amount, i.original_amount)` em `accounts_receivable_installments`, sem alteração.
- Demais comportamentos (filtros por fazenda via OS On-Farm, `SECURITY DEFINER`, validação `is_executivo`) permanecem inalterados.

## Fase 13.4 — Alertas Executivos, SLA e Plano de Ação

Aba **Alertas & Ações** (`/executivo` → tab "alertas") consolida e prioriza pendências para administradores e gestores. **Não substitui** a Central de Alertas: apenas lê e direciona.

### RPCs (SECURITY DEFINER + `is_executivo(auth.uid())`)
- `rpc_executivo_alertas_resumo(p_filtros jsonb)` — contagens + score (`saudavel | atencao | critico | sem_dados`) + motivos textuais.
- `rpc_executivo_alertas_prioridades(p_filtros jsonb, p_limit int default 15, max 50)` — pool consolidado (5x o limite) e `LIMIT` aplicado **uma única vez** no conjunto final.
- `rpc_executivo_plano_acao(p_filtros jsonb, p_limit int default 20, max 50)` — ações recomendadas (sem executar nada).
- `rpc_executivo_responsaveis_pendencias(p_filtros jsonb, p_limit int default 10, max 50)` — agrupado por responsável; `responsavel_id IS NULL` vira "Sem responsável".

### Critérios oficiais
- **Alertas abertos** = `status IN ('aberto','lido','reaberto')`.
- **SLA vencidos** = `sla_vencido = true` (campo real em `alertas_operacionais`).
- **SLA vencendo hoje** = `sla_resolucao_em::date = current_date` e `sla_vencido = false`.
- **Sem responsável** = `responsavel_id IS NULL` e status ativo.
- **Entregas sem comprovante** = `status='entregue'` + (`comprovante_id IS NULL` ou `comprovante_status ≠ 'confirmado'`).
- **Entregas não faturadas** = `status='entregue'` + `receivable_id IS NULL` + `COALESCE(financial_status,'PENDING_BILLING')='PENDING_BILLING'`.
- **OS atrasadas** = `status IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')` + `data_recomendada < current_date`.
- **Embalagens sem etiqueta** = `etiqueta_id IS NULL` + `status NOT IN ('cancelado','descartado','entregue')`.
- **Filtro por fazenda em entregas** sempre via `entregas.ordem_servico_onfarm_id → ordens_servico_onfarm.fazenda_id` (nunca `entregas.fazenda_id`).
- **OS On-Farm** usa `numero_os` com fallback `substring(id::text,1,8)`.

### Ordenação de prioridades
`sla_vencido DESC → gravidade (crítica → alta → média → baixa) → dias_em_aberto DESC → created_at ASC`. `LIMIT` aplicado no conjunto consolidado.

### Plano de ação — categorias
Resolver alerta crítico, Atribuir responsável, Regularizar SLA vencido, Confirmar comprovante de entrega, Faturar entrega, Revisar OS atrasada, Gerar etiqueta para embalagem.

### Rotas usadas
- `/alertas-operacionais`, `/entregas`, `/financeiro/entregas-nao-faturadas`, `/financeiro/receber`, `/estoque/embalagens`, `/ordens-servico`, `/visita-tecnica`. Nenhuma rota nova foi criada.

### Limitações
- Portal Executivo **não resolve** alertas, **não confirma** comprovantes, **não fatura** entregas e **não altera** estoque. Apenas navega para a origem.
- CQ pendente é uma estimativa por lotes sem registro em `controle_qualidade`; não diferencia ainda CQ em andamento.
- SLA não é recalculado no Portal Executivo; consome o estado vigente em `alertas_operacionais.sla_*`.

## Fase 13.4.1 — Correção Final Alertas & Ações

Esta fase corrige inconsistências de filtros nas RPCs da aba Alertas & Ações.

### RPCs corrigidas
- `rpc_executivo_alertas_resumo(p_filtros)`
- `rpc_executivo_alertas_prioridades(p_filtros, p_limit=15)`
- `rpc_executivo_plano_acao(p_filtros, p_limit=20)`
- `rpc_executivo_responsaveis_pendencias(p_filtros, p_limit=10)`

### Comportamento de período
Todos os indicadores agora respeitam `v_data_inicio`/`v_data_fim`, com os campos de referência por origem:

| Origem | Campo de período |
| --- | --- |
| `alertas_operacionais` | `created_at` |
| `entregas` | `COALESCE(entregue_em, created_at)` |
| `ordens_servico_onfarm` | `COALESCE(data_recomendada, created_at::date)` |
| `estoque_embalagens` | `created_at` |
| `lotes` (CQ) | `created_at` |

### Filtro por fazenda em entregas
Entregas **não possuem** `fazenda_id`. Em todos os blocos (resumo, prioridades, plano de ação) o filtro de fazenda usa:

```
LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
```

A descrição da entrega usa `'Entrega ' || substring(en.id::text,1,8)` (não há `numero_entrega`).

### CQ pendente — indicador global
`cq_pendente` é calculado em `lotes` sem registro em `controle_qualidade`. Como não há vínculo confiável entre `lotes` e `cliente`/`fazenda`, o indicador é **global** e:

- respeita apenas o filtro de **período** via `lotes.created_at`;
- quando `cliente_id` ou `fazenda_id` estão definidos no filtro, o indicador é incluído em `dados_indisponiveis` com o motivo "CQ pendente é indicador global por lote".
- O JSON do resumo inclui `cq_pendente_escopo = "global"`.

### Plano de ação — filtro por fazenda
Os blocos de entrega aplicam fazenda via OS On-Farm e respeitam o período por entrega. Pool ampliado para `v_limit * 5` por bloco com `LIMIT` final único de `v_limit`.

### Pendências por responsável — escopo
Mantemos a opção mínima documentada:
- agrupamento considera apenas `alertas_operacionais`;
- JSON retorna `escopo = "alertas_operacionais"` e `observacao` explicando que OS, entregas e estoque ainda não entram no agrupamento;
- frontend exibe a observação acima da tabela.

### Segurança
- Todas as RPCs permanecem `SECURITY DEFINER`, `SET search_path = public`.
- Validação `auth.uid() IS NULL` + `public.is_executivo(auth.uid())` no início de cada função.
- Portal Executivo continua **somente leitura**: não resolve alertas, não confirma comprovantes, não fatura entregas, não movimenta estoque, não altera CQ.

## Fase 13.4.2 — Correção de vínculo de responsáveis

`alertas_operacionais.responsavel_id` armazena `auth.uid()` (não `profiles.id`). As RPCs executivas de alertas foram corrigidas para resolver o nome do responsável via `public.profiles.user_id = alertas_operacionais.responsavel_id`.

### RPCs corrigidas
- `rpc_executivo_alertas_prioridades` — JOIN `profiles p ON p.user_id = a.responsavel_id`.
- `rpc_executivo_plano_acao` — blocos "Resolver alerta crítico" e "Regularizar SLA vencido" agora usam `SELECT nome FROM profiles WHERE user_id = a.responsavel_id`.
- `rpc_executivo_responsaveis_pendencias` — agrupamento mantém `responsavel_id` como `auth.uid()` original; nome resolvido via `profiles.user_id`.

### Comportamento
- Fallback "Sem responsável" preservado quando `responsavel_id IS NULL` ou sem profile correspondente.
- O campo `responsavel_id` retornado pelas RPCs continua sendo o `auth.uid()` do responsável — o frontend usa esse valor diretamente no filtro `p_filtros.responsavel_id` (não converter para `profiles.id`).
- Demais módulos que usam `profiles.id` em outros contextos não foram alterados — a correção é restrita ao escopo do Portal Executivo.

## Fase 13.5 — Relatórios Executivos e Exportações

Adiciona a aba **Relatórios** ao Portal Executivo, permitindo gerar, visualizar, imprimir/exportar e arquivar relatórios consolidados.

### Tabelas

- `public.executivo_relatorios` — relatório consolidado (jsonb por seção, status, hash, ativo, versão).
- `public.executivo_relatorio_eventos` — auditoria (`gerado`, `visualizado`, `exportado_pdf`, `exportado_csv`, `arquivado`, `cancelado`, `erro_exportacao`).
- Sem DELETE físico em nenhuma camada. Arquivamento via `status='arquivado'` + `ativo=false`.

### RPCs

- `rpc_executivo_gerar_relatorio(p_tipo, p_filtros, p_titulo)` — consolida e persiste.
- `rpc_executivo_listar_relatorios(p_filtros)` — lista com filtros (tipo, status, datas, gerado_por, texto, ativo).
- `rpc_executivo_obter_relatorio(p_relatorio_id)` — retorna detalhe e grava evento `visualizado`.
- `rpc_executivo_arquivar_relatorio(p_relatorio_id, p_motivo)` — arquivamento lógico.
- `rpc_executivo_exportar_relatorio_evento(p_relatorio_id, p_tipo_exportacao)` — grava `exportado_pdf` ou `exportado_csv`.

Todas validam `is_executivo(auth.uid())` internamente.

### Frontend

- Aba **Relatórios** entre "Alertas & Ações" e "Gargalos".
- Componentes em `src/components/executivo/relatorios/`.
- Hooks: `useExecutivoRelatorios`, `useExecutivoGerarRelatorio`, `useExecutivoRelatorioDetalhe`, `useExecutivoArquivarRelatorio`, `useExecutivoRegistrarExportacao`.
- Exportação CSV em `src/lib/executivoCsv.ts` (protegido contra CSV injection: prefixo `'` em células iniciadas por `= + - @ \t \r`).
- Impressão/PDF via `window.print()` + regras `@media print` em `src/index.css` isolando `#executivo-relatorio-print`.

### Tipos de relatório

`resumo_geral`, `operacional`, `financeiro`, `clientes_fazendas`, `alertas_acoes`, `completo`, `diretoria`, `reuniao_semanal` (7d default), `reuniao_mensal` (30d default).

### Restrições de segurança

- Nenhuma alteração em módulos operacional/financeiro/entregas/produção/alertas/SLA.
- Não exporta anexos, comprovantes, XML/DANFE, assinaturas, e-mails/telefones, metadata bruta.
- RLS exclusiva para executivos em ambas as tabelas; sem `USING (true)`.
- Limites aplicados na consolidação: gargalos/plano/alertas ≤20, rankings ≤10.

Detalhe completo: `docs/relatorios-executivos.md`.
