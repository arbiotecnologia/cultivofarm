# Fase 4 — Reorganização de Comercial, Campo e Produção

Alteração puramente **declarativa e visual** na fonte central de navegação. Nenhuma rota, componente, hook, RPC, permissão ou regra de negócio será modificada. Financeiro, Financeiro B2B, Inteligência e Administração ficam intocados.

## Estado atual detectado

Fonte única: `src/config/navigation.ts` (consumida por `AppSidebar.tsx` via `desktopItemsBySection()` e `MobileLayout.tsx` via `itemsForPlatform()`).

Seções desktop hoje: `Menu Principal`, `Operação`, `Técnico / Auditoria`, `Financeiro`, `Financeiro B2B`, `Comercial`, `Gestão e Estratégico`.

Itens em escopo estão espalhados entre `Menu Principal`, `Operação`, `Técnico / Auditoria`, `Comercial` e `Gestão e Estratégico`. Campo `subSection` já existe no tipo `NavItem` mas ainda não é usado como header visual na sidebar.

## Arquivos a editar

1. **`src/config/navigation.ts`** — reatribuir `section`, adicionar `subSection`, `order` e expandir `searchKeywords` dos itens em escopo. Adicionar as três novas seções ao tipo `NavSection` e ao `DESKTOP_SECTION_ORDER`. Manter os itens fora de escopo inalterados. Nenhuma rota, `matchRoutes`, `legacyRoutes`, `badge`, `badgeSlot`, `allowedRoles`, `platforms`, `children`, `icon` ou `id` será alterado.

2. **`src/components/AppSidebar.tsx`** — renderizar headers de `subSection` (labels menores, agrupando itens contíguos dentro de cada grupo). Preservar: busca, destaque de rota ativa, `aria-current`, `aria-expanded`, colapsada com tooltips, drawer mobile, ordenação por `order`, persistência de grupo aberto.

3. **`src/config/navigation.ts` (função `desktopItemsBySection`)** — passar a ordenar itens dentro do grupo pelo campo `order` para garantir a ordem visual obrigatória.

4. **Breadcrumbs** — auditar componentes de breadcrumb existentes; se derivarem de `section`/`subSection`, atualização é automática. Se estáticos por página, ajustar apenas os títulos visuais das páginas em escopo (ver Parte 6 do prompt). Nenhuma renomeação interna.

5. **Testes** — atualizar `src/test/sidebar.dashboard.active.test.tsx` só se as asserções dependerem de nomes de section antigos dos itens movidos. Novos testes: um verificando que cada item em escopo cai na section+subSection correta e na ordem esperada; um verificando que as searchKeywords antigas ainda encontram os itens ("dashboard-b2b", "consultor", "propriedade", "os", etc.).

## Nova estrutura declarativa

### COMERCIAL E RELACIONAMENTO

```text
Visão Comercial
  1. Dashboard Consolidado          (com-consolidado    → /comercial/dashboard-consolidado)
  2. Indicadores                    (com-indicadores    → /comercial/indicadores)
  3. Alertas Comerciais             (com-alertas        → /comercial/alertas)
Clientes e Propriedades
  4. Clientes                       (clientes           → /clientes)             [movido de Menu Principal]
  5. Fazendas                       (fazendas           → /fazendas)             [movido de Gestão e Estratégico]
Demandas e Vendas
  6. Solicitações                   (solicitacoes       → /solicitacoes)         [movido de Menu Principal]
  7. Pedidos B2B                    (com-pedidos-b2b    → /comercial/pedidos-b2b)
  8. Solicitações B2B               (com-solicitacoes-b2b → /comercial/solicitacoes-b2b)
  9. Campanhas                      (com-campanhas      → /comercial/campanhas)
Produtos e Planejamento
 10. Catálogo                       (com-catalogo       → /comercial/catalogo)
 11. Protocolos                     (protocolos         → /protocolos)           [movido de Gestão e Estratégico]
 12. Simulador                      (com-simulador      → /comercial/simulador)
```

### CAMPO E ASSISTÊNCIA TÉCNICA

```text
 1. Agenda Técnica          (agenda-tecnica       → /agenda-tecnica)         [de Menu Principal]
 2. Visita Técnica          (visita-tecnica       → /visita-tecnica)         [de Menu Principal]
 3. Aplicações              (aplicacoes           → /aplicacoes)             [de Operação]
 4. Equipe Técnica          (equipe-tecnica       → /consultor-tecnico)      [de Gestão e Estratégico]
 5. Fluxo Técnico           (fluxo-tecnico        → /fluxo-tecnico)          [de Gestão e Estratégico]
 6. Monitoramento           (monitoramento        → /monitoramento-alertas)  [de Gestão e Estratégico]
 7. Previsão Climática      (previsao-climatica   → /previsao-agronomica)    [de Gestão e Estratégico]
```

Sem subseções (conforme "não criar subníveis desnecessários").

### PRODUÇÃO ON-FARM

```text
Acompanhamento
 1. Dashboard Produção            (dashboard-producao     → /operacao/dashboard-producao)
Central Operacional
 2. Cockpit Laboratório           (cockpit-lab            → /cockpit-laboratorio)   [destaque visual mantido]
Fluxo de Produção
 3. Planejamento Produção         (planejamento-producao  → /operacao/planejamento)
 4. Ordens de Serviço             (ordens-servico         → /ordens-servico)
 5. Lotes                         (lotes                  → /lotes)                 [badge Técnico preservado]
 6. Controle de Qualidade         (cq                     → /controle-qualidade)    [badge Técnico preservado]
 7. Envase                        (envase                 → /envase)                [badge Técnico preservado]
 8. Estoque                       (estoque                → /estoque)
 9. Entregas                      (entregas               → /entregas)
```

Cockpit Laboratório: mesma rota, mesmo componente, mesma permissão, mesmo destaque visual (`isCockpit && isProducao` no AppSidebar). Apenas troca `section` de `Operação` para `Produção On-Farm` e recebe `subSection: "Central Operacional"` e `order: 2`.

### Grupos remanescentes

- `Menu Principal` fica com: Dashboard, BI Agronômico, Portal do Produtor, Configurações.
- `Operação`, `Técnico / Auditoria` e `Gestão e Estratégico` esvaziados dos itens realocados. `Gestão e Estratégico` retém: Relatórios, BI Operacional, Alertas, Auditorias. `Operação` e `Técnico / Auditoria` ficam sem itens dentro do escopo desta fase — serão removidos de `DESKTOP_SECTION_ORDER` apenas se ficarem vazios após a movimentação (a função `desktopItemsBySection` já filtra grupos vazios, então não é imprescindível remover do enum, mas fica mais limpo).
- Financeiro, Financeiro B2B, Mobile Consultor, Mobile Produtor: **intocados**.

## Palavras-chave (Parte 5)

Serão mescladas às já existentes (nunca substituídas). Exemplos-chave preservados: "produtor", "parceiro", "consultor", "os", "lote", "cq", "clima", "consolidado", "b2b". Adições conforme lista da Parte 5 do prompt.

## Ordem visual

`desktopItemsBySection` será ajustada para retornar `items.sort((a,b) => (a.order ?? 999) - (b.order ?? 999))`. Cada item em escopo receberá `order` de 1..12 (Comercial), 1..7 (Campo), 1..9 (Produção) conforme tabelas acima. Itens fora de escopo mantêm `order` indefinido → caem no fallback 999 sem afetar seções não tocadas.

## Renderização de subSection na Sidebar

Alteração mínima em `AppSidebar.tsx`, dentro do map de `groups`: agrupar `items` por `subSection` mantendo ordem, e renderizar um pequeno header (`<div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">`) entre blocos. Itens sem `subSection` são renderizados diretamente sob o grupo (comportamento atual). Colapsada: headers ocultos, itens continuam com tooltip.

## Breadcrumbs (Parte 6)

Auditar `src/components/**` procurando `breadcrumb`. Se implementação for derivada de `navigation.ts` via `section`/`subSection`, atualização é automática. Se estiver hardcoded por página, alterar apenas as strings visuais (sem tocar em títulos funcionais internos). Truncamento acessível no mobile mantido.

## Preservação — checklist executado antes de commitar

- Todas as rotas atuais continuam alcançáveis pelas mesmas URLs.
- `matchRoutes` e `legacyRoutes` inalterados → redirecionamentos antigos seguem funcionando.
- Badges "Técnico" (Lotes, CQ, Envase) preservados.
- `badgeSlot: "alertas"` preservado em Alertas.
- Nenhum `allowedRoles` novo introduzido; `canAccess()` continua sendo a fonte de verdade.
- Destaque especial do Cockpit (`isCockpit && isProducao`) permanece — depende de `item.route`, não de `section`.
- Busca continua respeitando permissões via `canAccess`.
- `useSidebarGroupState` persistência funciona com nomes novos (chave é a string da section).

## Validações técnicas (Parte 9)

- `bun run typecheck`
- `bun run build`
- `bunx vitest run` (315 atuais + testes novos de reorganização)
- Playwright rápido: `/comercial/dashboard-consolidado`, `/cockpit-laboratorio`, `/agenda-tecnica`, `/fazendas` — verificar que aparecem nos novos grupos, que a busca por termos antigos ("dashboard-b2b", "consultor", "os") localiza, e que a rota ativa realça o grupo/subseção corretos.
- Console/network limpos.
- Lint: registrado como indisponível (dívida aceita); não instalar.

## Fora de escopo

- Financeiro, Financeiro B2B, Inteligência, Administração.
- Conteúdo interno das páginas.
- Roteamento inicial por perfil.
- Rotas mobile e `AppPortalGuard`.
- `ACCESS_MAP` e `permissions.ts`.
- Sidebar colapsada (comportamento de design aceito).
- Configuração de lint.

## Relatório final

Ao concluir, entrega estruturada A–W conforme prompt: matriz antes/depois, listas de rotas/componentes/permissões/badges preservados, resultado por perfil, resultados desktop/tablet/mobile, typecheck/build/testes, situação do lint, riscos residuais e recomendação para auditoria da Fase 4. Fase 5 **não** será iniciada.
