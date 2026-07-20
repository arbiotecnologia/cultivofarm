
## Objetivo

Tornar as linhas da lista de **Usuários** (Configurações → Usuários) clicáveis, abrindo o diálogo de detalhes/edição já existente. Em seguida, propagar o mesmo padrão de "linha clicável" para outras listas equivalentes do sistema, usando um utilitário único para garantir consistência de UX, acessibilidade e mobile.

## Padrão a adotar

Já existe o helper `src/lib/rowClick.ts` com:
- `rowClickProps(onActivate)` — spread em `<TableRow>` ou `<MobileCard>`. Adiciona `cursor-pointer`, hover, `role="button"`, `tabIndex=0`, Enter/Espaço.
- `stopRowClick` — usar em `<TableCell>` que contém botões/menus (Editar, Excluir, dropdowns) para evitar disparar o clique da linha.

Regra: **a linha inteira abre detalhes/edição**; ações destrutivas ou secundárias permanecem como botões, isoladas com `stopRowClick`. Nada de duplicar handlers — sempre reutilizar o handler existente (ex.: `setEditUser(u); setEditOpen(true)`).

## Etapa 1 — Usuários (Configurações)

Arquivo: `src/pages/Configuracoes.tsx`

- Desktop (`TableRow` linha 739): aplicar `{...rowClickProps(() => { setEditUser(u); setEditOpen(true); })}` e envolver a `TableCell` de ações (linha ~770) com `onClick={stopRowClick}`.
- Mobile (`MobileCard` linha 671): mesmo tratamento — card inteiro clicável e botão "Editar" com `stopRowClick`.
- Não alterar consulta, RLS, mutations ou permissões. Botão "Editar" permanece visível como affordance redundante.

## Etapa 2 — Propagar para listas equivalentes

Critério: lista com ação primária "abrir/editar" via botão de ícone (lápis) ou drawer. Aplicar `rowClickProps` + `stopRowClick`, reutilizando o handler já existente. Sem mudar regras de negócio.

Alvos priorizados (todos já têm handler de edição/detalhe):

1. `src/pages/financeiro/FormasPagamento.tsx` — linhas abrem o `Dialog` de edição.
2. `src/pages/comercial/ParceirosB2B.tsx` / `src/pages/clientes/ParceirosB2BTab.tsx` — abre detalhe do parceiro.
3. `src/pages/clientes/ProdutoresTab.tsx` — abre `ClienteDetalhe`.
4. `src/pages/Fazendas.tsx`, `src/pages/Talhoes.tsx` — abrem edição/detalhe.
5. `src/pages/comercial/PedidosB2B.tsx` e `src/pages/comercial/SolicitacoesB2B.tsx` — abrem drawer de detalhe.
6. `src/pages/portal/PortalMeusPedidos.tsx`, `PortalEntregas.tsx`, `PortalRegistros.tsx` — abrem detalhe.
7. `src/pages/Entregas.tsx`, `src/pages/OrdensServico.tsx`, `src/pages/Aplicacoes.tsx`, `src/pages/Lotes.tsx`, `src/pages/Protocolos.tsx`, `src/pages/Estoque.tsx`, `src/pages/EnvasePage.tsx`, `src/pages/ControleQualidade.tsx`, `src/pages/FluxoTecnico.tsx`, `src/pages/ConsultorTecnico.tsx` — cada tela é revisada: se já existe navegação/drawer por linha, aplicar; caso contrário, deixar de fora desta etapa.
8. `src/components/comercial/ParceiroUsuariosTab.tsx` — coerência com Usuários.

Excluídos desta rodada (não têm ação de detalhe única, ou linha inteira é um formulário editável in-line): `RegrasGovernancaB2B.tsx`, `AlertasNotificacaoConfig.tsx`, `HistoricoExportacoes.tsx`, `AuditoriaSync.tsx`, `AuditoriaMotorB2B.tsx`. Manter como estão.

## Etapa 3 — Validação

- `bun run typecheck`
- `bun run build`
- `bun run test`
- Verificação visual no preview: clicar em uma linha de Usuários e uma linha de Formas de Pagamento; confirmar Enter/Espaço via teclado; confirmar que botões de ação (excluir, dropdown) **não** disparam o clique da linha.

## Fora de escopo

- Alterações em RLS/RPC/migrations.
- Mudanças em regras de negócio, permissões ou telas de detalhe em si.
- Publicação.
