# BI Operacional — Fase 14: Interatividade e Drill-Down

## Visão Geral
A Fase 14 adiciona capacidade de drill-down interativo ao BI Operacional, permitindo que gestores cliquem em qualquer linha das tabelas de consultor, cliente, fazenda, talhão, produto ou microrganismo e vejam todos os registros subjacentes em um modal detalhado. Também inclui uma nova aba **Estoque** com gráficos interativos de volume vs. demanda e movimentações.

## Funcionalidades

### 1. Drill-Down Interativo
Todas as tabelas do BI Operacional agora suportam clique para detalhamento:
- **Consultor** → todas as visitas técnicas do consultor
- **Cliente** → todas as visitas e OS do cliente
- **Fazenda** → todas as visitas e entregas da fazenda
- **Talhão** → todas as visitas do talhão
- **Produto** → todas as OS da esteira laboratorial vinculadas ao produto
- **Microrganismo** → todas as OS da esteira vinculadas ao microrganismo

O modal `BIDrillDownModal` exibe até o limite de registros carregados no cache local (500 linhas), com colunas adaptativas conforme a origem (visitas ou esteira laboratorial).

### 2. Nova Aba "Estoque"
Aba dedicada à análise de estoque com:
- **KPIs**: Volume em estoque, volume solicitado, solicitado entregue, total de movimentações
- **Gráfico Estoque vs. Demanda**: barras comparando volume em estoque (L) com volume entregue (L) por produto/microrganismo
- **Gráfico de Movimentações**: barras por tipo de movimentação (entrada, saída, ajuste)
- **Tabela de produtos**: estoque, entregue, OS vinculadas e entregas pendentes
- **Produtos críticos**: lista dos produtos com entregas pendentes

### 3. Tabela de Filtros Favoritos (`bi_filtro_config`)
Tabela criada para persistir filtros salvos por usuário. Cada usuário autenticado pode salvar presets com nome e JSON de filtros.
- RLS: usuário vê apenas seus próprios filtros; admin/gestor vê todos.
- Políticas: SELECT/INSERT/UPDATE/DELETE por dono.

### 4. RPCs de Drill-Down
6 funções `SECURITY DEFINER` para drill-down seguro:
- `rpc_bi_visitas_por_consultor(uuid, date, date)`
- `rpc_bi_visitas_por_cliente(uuid, date, date)`
- `rpc_bi_visitas_por_fazenda(uuid, date, date)`
- `rpc_bi_visitas_por_talhao(uuid, date, date)`
- `rpc_bi_esteira_por_produto(uuid, date, date)`
- `rpc_bi_esteira_por_microrganismo(uuid, date, date)`

Todas verificam `auth.uid() IS NOT NULL`, aplicam filtro de data com `COALESCE`, e retornam vazio em caso de exceção.

### 5. Views Auxiliares
- `vw_bi_estoque_produto`: junta `estoque_produto` + `produtos` + `microrganismos` com volume em L
- `vw_bi_movimentacoes`: junta `estoque_movimentacoes` + `estoque_produto`, mapeando `acao` → `tipo_movimentacao` e `quantidade` → `volume_alteracao`

## Arquivos Criados/Modificados

### Criados
- `src/components/bi/modal/BIDrillDownModal.tsx`
- `src/components/bi/estoque/BIEstoqueTab.tsx`
- `src/components/bi/estoque/BIEstoqueChart.tsx`
- `src/components/bi/estoque/BIMovimentacoesChart.tsx`

### Modificados
- `src/hooks/useBIOperacional.ts` — adiciona estado de drill-down (`detalheAtivo`, `abrirDetalhe`, `fecharDetalhe`, `dadosDetalhe`)
- `src/pages/BIOperacional.tsx` — nova aba "Estoque", integração do modal, `onRowClick` nos componentes filho
- `src/components/bi/visitas/BIVisitasPorConsultor.tsx` — prop `onRowClick`
- `src/components/bi/visitas/BIVisitasPorCliente.tsx` — prop `onRowClick`
- `src/components/bi/visitas/BIVisitasPorFazenda.tsx` — prop `onRowClick`
- `src/components/bi/visitas/BIVisitasResumo.tsx` — propaga `onConsultorClick` / `onClienteClick`
- `src/components/bi/entregas/BIEntregasPorFazenda.tsx` — prop `onRowClick`
- `src/components/bi/laboratorio/BILaboratorioResumo.tsx` — prop `onProdutoClick` / `onClienteClick`

## Segurança
- Sem `USING (true)`.
- Sem DELETE destrutivo.
- Sem create table em view.
- RPCs validam autenticação.
- BI permission gate protege aba "Estoque" via `canAccessBISection("estoque")`.

## Status
**APTO COM AJUSTES** — Frontend completo e funcional. Build limpo. Database: `bi_filtro_config`, 6 RPCs e views auxiliares aplicados com sucesso. A recriação de `vw_fluxo_visita_tecnica` com campos adicionais (`cultura_nome`, `microrganismo_nome`) ficou **pendente** porque a view existente usa CTEs com colunas que divergem do schema atual da tabela `visitas_checkin`. O drill-down funciona via filtragem local no hook (`dadosDetalhe` computed a partir de `rawVisitas` / `rawEsteira`), portanto não há impacto operacional.

## Próximos Passos (Fase 14.x)
- Ajustar `vw_fluxo_visita_tecnica` manualmente para incluir `cultura_nome` e `microrganismo_nome` quando o schema for validado.
- Integrar `bi_filtro_config` com o componente `BIFiltrosGlobais` para salvar/carregar presets.
