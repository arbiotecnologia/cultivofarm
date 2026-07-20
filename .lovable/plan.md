
# FASE 1 — Inventário da Navegação AR Bio (Somente Leitura)

Nenhum arquivo foi alterado. Este é o entregável da fase.

---

## A. Arquivos analisados

| Papel | Arquivo |
|---|---|
| Sidebar desktop (menu principal + grupos + badges) | `src/components/AppSidebar.tsx` |
| Layout admin (shell com sidebar) | `src/components/AppLayout.tsx` |
| Layout mobile (tabs por perfil) | `src/pages/app/MobileLayout.tsx` |
| Layout Portal Produtor | `src/pages/portal/PortalLayout.tsx` |
| Layout Portal Parceiro B2B | `src/pages/portal-parceiro/PortalParceiroLayout.tsx` |
| Router raiz + todas as `<Route>` | `src/App.tsx` |
| Matriz de permissões por rota | `src/lib/permissions.ts` |
| Guards | `src/components/guards/AppPortalGuard.tsx`, `B2BRouteGuard.tsx`, `TechnicalFeatureGuard.tsx`, `ProducerFeatureGuard.tsx` |
| Contexto de portal ativo | `src/lib/activePortalContext.ts`, `src/lib/portalContext.ts`, `src/hooks/useAvailableContexts.ts` |
| Redirect de login | `AuthRoute` em `src/App.tsx`, `getHomeForRole` em `permissions.ts` |
| Badge dinâmico "Alertas" | `src/components/alertas/AlertasBadgeMenu.tsx` |
| Wrapper `NavLink` c/ classe ativa | `src/components/NavLink.tsx` |

**Não encontrados** (não existem no projeto): breadcrumbs globais, command menu / busca interna.

---

## B. Totais

- **Rotas declaradas em `src/App.tsx`:** 132 (inclui `/app/*`, `/portal/*`, `/portal-parceiro/*`, admin, públicas e redirects).
- **Itens de menu na `AppSidebar` (desktop admin):** 63, distribuídos em 7 grupos.
- **Redirects (`<Navigate>`) preservando URLs antigas:** 9.

---

## C. Matriz de itens do menu — 63 entradas (AppSidebar desktop)

Legenda de perfis (chaves reais de `AppRole`): `admin`=administrador, `gestor`, `gcom`=gestor_comercial, `fin`=financeiro, `admv`=administrativo, `ct`=consultor_tecnico, `ta`=tecnico_agronomo, `apl`=aplicador, `op`=operador_onfarm, `prod`=producao, `cp`=cliente_produtor, `b2b`=parceiro_b2b, `b2bt`=parceiro_b2b_tecnico.

### Grupo "Menu Principal"
| # | Nome | Ícone | Rota | Página / Componente | Perfis (via `canAccess`) | Badge |
|---|---|---|---|---|---|---|
| 1 | Dashboard | LayoutDashboard | `/` | `pages/Index.tsx` → PainelOperacional ou DashboardAgronomico | admin, gestor, ct, op, admv, ta, prod, fin | — |
| 2 | Portal Executivo | Activity | `/executivo` | `pages/executivo/PortalExecutivo.tsx` | admin, gestor | — |
| 3 | Clientes | Users | `/clientes` | `pages/Clientes.tsx` | admin, gestor, gcom, ct, cp, admv, ta, fin | — |
| 4 | Solicitações | Inbox | `/solicitacoes` | `pages/Solicitacoes.tsx` | admin, gestor, ct, admv, ta | — |
| 5 | Agenda Técnica | CalendarClock | `/agenda-tecnica` | `pages/AgendaTecnica.tsx` | admin, gestor, ct, ta | — |
| 6 | Visita Técnica | ClipboardCheck | `/visita-tecnica` | `pages/VisitaTecnicaLista.tsx` (+ `/nova`, `/:id` → `VisitaTecnica.tsx`) | admin, gestor, ct, ta, admv | — |
| 7 | BI Agronômico | BrainCircuit | `/bi-agronomico` | `pages/BIAgronomico.tsx` | admin, gestor, ct, op, admv, ta, prod | — |
| 8 | Portal do Produtor | LayoutDashboard | `/portal` | `pages/portal/PortalDashboard.tsx` (dentro de `PortalLayout`) | cp | — |
| 9 | Configurações | Settings | `/configuracoes` | `pages/Configuracoes.tsx` (+ subrotas objetivos-visita, catalogo-ia, parametros-cq) | admin(rw) e demais (r): gestor, ct, apl, op, cp, admv, ta, prod | — |

### Grupo "Operação"
| # | Nome | Ícone | Rota | Página | Perfis | Badge |
|---|---|---|---|---|---|---|
|10| Ordens de Serviço | ClipboardList | `/ordens-servico` | `OrdensServico.tsx` | admin, gestor, ct, op, admv, ta, prod, fin | — |
|11| Cockpit Laboratório | FlaskConical | `/cockpit-laboratorio` | `CockpitLaboratorio.tsx` | admin, gestor, op, prod, admv | destaque visual p/ producao/op |
|12| Planejamento Produção | Factory | `/operacao/planejamento` | `operacao/PlanejamentoProducao.tsx` (+ `/:id`) | admin, gestor, prod, gcom | — |
|13| Dashboard Produção | Activity | `/operacao/dashboard-producao` | `operacao/DashboardProducao.tsx` | admin, gestor, prod, gcom | — |
|14| Estoque | Warehouse | `/estoque` | `Estoque.tsx` (+ `/embalagens`) | admin, gestor, op, admv, prod | — |
|15| Entregas | Truck | `/entregas` | `Entregas.tsx` (+ `/:id/formulario`) | admin, gestor, op, cp, admv, prod, apl, fin | — |
|16| Aplicações | Sprout | `/aplicacoes` | `Aplicacoes.tsx` | admin, gestor, apl, cp, admv, fin | — |
|17| Painel Operacional | Activity | `/painel-operacional` | `PainelOperacional.tsx` | admin, gestor | — |

### Grupo "Técnico / Auditoria"
| # | Nome | Ícone | Rota | Página | Perfis | Badge |
|---|---|---|---|---|---|---|
|18| Lotes | FlaskConical | `/lotes` | `Lotes.tsx` | admin, gestor, admv, prod, fin | **Técnico** |
|19| Controle de Qualidade | ShieldCheck | `/controle-qualidade` | `ControleQualidade.tsx` | admin, gestor, admv, prod | **Técnico** |
|20| Envase | Package | `/envase` | `EnvasePage.tsx` | admin, gestor, admv, prod | **Técnico** |

### Grupo "Financeiro" (16 itens)
| # | Nome | Rota | Página | Perfis |
|---|---|---|---|---|
|21| Financeiro | `/financeiro` | `financeiro/FinanceiroDashboard.tsx` | admin, gestor, fin |
|22| Fluxo de Caixa | `/financeiro/fluxo-caixa` | `financeiro/FluxoCaixa.tsx` | admin, gestor, fin |
|23| DRE Gerencial | `/financeiro/dre` | `financeiro/DRE.tsx` | admin, gestor, fin |
|24| Relatórios | `/financeiro/relatorios` | `financeiro/FinanceiroRelatorios.tsx` (+ 8 subrelatórios) | admin, gestor, fin |
|25| Recibos | `/financeiro/recibos` | `financeiro/RecibosList.tsx` | admin, gestor, fin |
|26| Contas a Receber | `/financeiro/receber` | `financeiro/ContasReceber.tsx` | admin, gestor, fin |
|27| Contas a Pagar | `/financeiro/pagar` | `financeiro/ContasPagar.tsx` | admin, gestor, fin |
|28| Categorias | `/financeiro/categorias` | `financeiro/Categorias.tsx` | admin, gestor, fin |
|29| Centros de Custo | `/financeiro/centros-custo` | `financeiro/CentrosCusto.tsx` | admin, gestor, fin |
|30| Contas Bancárias | `/financeiro/contas-bancarias` | `financeiro/ContasBancarias.tsx` | admin, gestor, fin |
|31| Formas de Pagamento | `/financeiro/formas-pagamento` | `financeiro/FormasPagamento.tsx` | admin, gestor, fin |
|32| Recorrências | `/financeiro/recorrencias` | `financeiro/Recorrencias.tsx` | admin, gestor, fin |
|33| Notas Fiscais | `/financeiro/notas-fiscais` | `financeiro/NotasFiscais.tsx` | admin, gestor, fin |
|34| Entregas s/ Fatura | `/financeiro/entregas-nao-faturadas` | `financeiro/EntregasNaoFaturadas.tsx` | admin, gestor, fin |
|35| Auditoria (fin) | `/financeiro/auditoria` | `financeiro/AuditoriaFinanceira.tsx` | admin, gestor, fin |
|36| Configurações Fin. | `/financeiro/configuracoes` | `financeiro/ConfiguracoesFinanceiras.tsx` | admin, gestor, fin |

### Grupo "Financeiro B2B" (colapsável, 10 itens)
| # | Nome | Rota | Página | Perfis |
|---|---|---|---|---|
|37| Visão Geral B2B | `/financeiro/b2b` | `financeiro/FinanceiroB2B.tsx` | admin, gestor, fin, gcom(r), admv(r) |
|38| Dashboard B2B | `/financeiro/b2b/dashboard` | `financeiro/DashboardFinanceiroB2B.tsx` | idem |
|39| Governança | `/financeiro/b2b/governanca` | `financeiro/GovernancaFinanceiraB2B.tsx` | idem |
|40| Aging | `/financeiro/b2b/aging` | `financeiro/AgingFinanceiroB2B.tsx` | idem |
|41| Previsão Receita | `/financeiro/b2b/previsao` | `financeiro/PrevisaoReceitaB2B.tsx` | idem |
|42| Rentabilidade | `/financeiro/b2b/rentabilidade` | `financeiro/RentabilidadeParceirosB2B.tsx` | idem |
|43| Alertas Financeiros | `/financeiro/b2b/alertas` | `financeiro/AlertasFinanceirosB2B.tsx` | idem |
|44| Central Governança | `/financeiro/b2b/central-governanca` | `financeiro/CentralGovernancaB2B.tsx` | admin, gestor, fin |
|45| Regras Governança | `/financeiro/b2b/regras` | `financeiro/RegrasGovernancaB2B.tsx` | admin, gestor, fin |
|46| Dashboard Sócios | `/executivo/socios-b2b` | `executivo/DashboardSociosB2B.tsx` | admin, gestor |

### Grupo "Comercial" (8 itens)
| # | Nome | Rota | Página | Perfis |
|---|---|---|---|---|
|47| Dashboard Consolidado | `/comercial/dashboard-consolidado` | `comercial/DashboardConsolidadoB2B.tsx` | admin, gcom |
|48| Indicadores | `/comercial/indicadores` | `comercial/IndicadoresComerciais.tsx` | admin, gcom |
|49| Pedidos B2B | `/comercial/pedidos-b2b` | `comercial/PedidosB2B.tsx` | admin, gcom |
|50| Solicitações B2B | `/comercial/solicitacoes-b2b` | `comercial/SolicitacoesB2B.tsx` | admin, gcom, fin(r) |
|51| Campanhas | `/comercial/campanhas` | `comercial/CampanhasComerciais.tsx` | admin, gcom |
|52| Catálogo | `/comercial/catalogo` | `comercial/CatalogoComercial.tsx` | admin(r), gestor(r), gcom(r) |
|53| Simulador | `/comercial/simulador` | `comercial/SimuladorComercial.tsx` | admin, gcom |
|54| Alertas Comerciais | `/comercial/alertas` | `comercial/AlertasComerciais.tsx` | admin, gcom |

### Grupo "Gestão e Estratégico" (9 itens)
| # | Nome | Rota | Página | Perfis |
|---|---|---|---|---|
|55| Fazendas | `/fazendas` | `Fazendas.tsx` (+ `/:id` FazendaDetalhe) | admin, gestor, ct, cp, admv, ta, fin |
|56| Protocolos | `/protocolos` | `Protocolos.tsx` | admin, gestor, ct, op, admv, ta, prod |
|57| Equipe Técnica | `/consultor-tecnico` | `ConsultorTecnico.tsx` | admin, gestor, ct, cp, admv, ta |
|58| Fluxo Técnico | `/fluxo-tecnico` | `FluxoTecnico.tsx` | admin, gestor, ct, op, admv, ta, prod |
|59| Relatórios | `/relatorios` | `Relatorios.tsx` | admin, gestor, ct, op, admv, ta, prod |
|60| BI Operacional | `/bi-operacional` | `BIOperacional.tsx` | admin, gestor, ct, op, admv, ta, prod |
|61| Alertas | `/alertas-operacionais` | `AlertasOperacionais.tsx` (badge dinâmico `AlertasBadgeMenu`) | admin, gestor, admv, ct, ta, op, prod |
|62| Monitoramento | `/monitoramento-alertas` | `MonitoramentoAlertas.tsx` | admin, gestor, ct, ta |
|63| Previsão Climática | `/previsao-agronomica` | `PrevisaoAgronomica.tsx` | admin, gestor, ct, op, admv, ta |

**Auditorias** (item 74 do plano "Gestão"): rota `/auditoria` → `Auditoria.tsx` **existe** no `secondaryItems` do código mas foi renderizada como "Auditorias" — presente. Ver seção F.

---

## D. Conferência das 63 entradas informadas

- **Encontradas: 63/63.** Todas as entradas listadas no prompt existem no menu atual.
- **Entradas adicionais NÃO listadas** (visíveis no menu ou rotas do sistema):
  - Item de menu "**Auditorias**" (`/auditoria`) — está no grupo Gestão do código mas não estava na lista de 63. Bate com "Auditorias" do bloco Inteligência.
  - Subrotas de Financeiro fora do menu: `/financeiro/relatorios/{mensal, contas-receber, contas-pagar, inadimplencia, nfe-pendente, entregas-faturamento, por-cliente, prestacao-contas}` (acessíveis via drill-down em Relatórios).
  - Subrotas de Configurações: `/configuracoes/objetivos-visita`, `/configuracoes/catalogo-ia`, `/configuracoes/parametros-cq`.
  - Subrotas de detalhe: `/clientes/:id`, `/parceiros/:id`, `/fazendas/:id`, `/talhoes/:id`, `/estoque/embalagens`, `/etiquetas/:id/imprimir`, `/entregas/:id/formulario`, `/operacao/planejamento/:id`, `/comercial/condicoes-pagamento`, `/comercial/auditoria-motor-b2b`.
  - **Portal Executivo** aparece no menu mas também há `/executivo/socios-b2b` classificado no grupo Financeiro B2B.
- **Rotas em `permissions.ts` sem entrada no menu:** `/comercial/condicoes-pagamento`, `/comercial/parceiros` (redireciona para `/clientes?aba=parceiros`), `/auditoria-sync` (redireciona para `/auditoria?tab=sync`). Preservar.
- **Portais paralelos** (não aparecem na sidebar admin — layouts próprios): `/app/*` (mobile técnico/produtor), `/portal/*` (produtor), `/portal-parceiro/*` (B2B). Ver riscos G.

---

## E. Rotas duplicadas / apontando para o mesmo destino / redirects

| De | Para | Observação |
|---|---|---|
| `/comercial/parceiros` | `/clientes?aba=parceiros` | compatibilidade — preservar |
| `/comercial/dashboard-b2b` | `/comercial/dashboard-consolidado` | idem |
| `/auditoria-sync` | `/auditoria?tab=sync` | idem |
| `/portal/talhoes` | `/portal/fazendas` | idem |
| `/portal/ordens-servico` | `/portal/acompanhamento?tab=ordens-servico` | idem |
| `/portal/producao` | `/portal/acompanhamento?tab=producao` | idem |
| `/portal/entregas` | `/portal/acompanhamento?tab=entregas` | idem |
| `/portal/meus-pedidos` | `/portal` | idem |
| `/portal-parceiro/historico-financeiro` | `/portal-parceiro/financeiro?tab=historico` | idem |
| `/portal-parceiro/meu-historico-financeiro` | `/portal-parceiro/financeiro?tab=historico` | idem |
| `/portal-parceiro/catalogo` e `/portal-parceiro/simulador` | ambos renderizam `ParceiroNovoPedido` | mesma tela com tabs internas |

**Rotas com mesmo componente:** `/portal-parceiro/{novo,catalogo,simulador}` → `ParceiroNovoPedido`; `/visita-tecnica/nova` e `/visita-tecnica/:id` → `VisitaTecnica`.

**Nenhuma rota admin do menu principal está duplicada apontando para páginas diferentes.**

---

## F. Matriz ANTES → DESTINO PLANEJADO (proposta, sem implementação)

```text
GRUPO NOVO                        ORIGEM ATUAL           ITEM                             ROTA
────────────────────────────────────────────────────────────────────────────────────────────────────────
DASHBOARD
  Visão Geral                     Menu Principal         Dashboard                        /
  Visão Executiva                 Menu Principal         Portal Executivo                 /executivo
  Visão Operacional               Operação               Painel Operacional               /painel-operacional

COMERCIAL E RELACIONAMENTO
  Dashboard Consolidado           Comercial              Dashboard Consolidado            /comercial/dashboard-consolidado
  Indicadores                     Comercial              Indicadores                      /comercial/indicadores
  Alertas Comerciais              Comercial              Alertas Comerciais               /comercial/alertas
  Clientes                        Menu Principal         Clientes                         /clientes
  Fazendas                        Gestão                 Fazendas                         /fazendas
  Solicitações                    Menu Principal         Solicitações                     /solicitacoes
  Pedidos B2B                     Comercial              Pedidos B2B                      /comercial/pedidos-b2b
  Solicitações B2B                Comercial              Solicitações B2B                 /comercial/solicitacoes-b2b
  Campanhas                       Comercial              Campanhas                        /comercial/campanhas
  Catálogo                        Comercial              Catálogo                         /comercial/catalogo
  Protocolos                      Gestão                 Protocolos                       /protocolos
  Simulador                       Comercial              Simulador                        /comercial/simulador

CAMPO E ASSISTÊNCIA TÉCNICA
  Agenda Técnica                  Menu Principal         Agenda Técnica                   /agenda-tecnica
  Visita Técnica                  Menu Principal         Visita Técnica                   /visita-tecnica
  Aplicações                      Operação               Aplicações                       /aplicacoes
  Equipe Técnica                  Gestão                 Equipe Técnica                   /consultor-tecnico
  Fluxo Técnico                   Gestão                 Fluxo Técnico                    /fluxo-tecnico
  Monitoramento                   Gestão                 Monitoramento                    /monitoramento-alertas
  Previsão Climática              Gestão                 Previsão Climática               /previsao-agronomica

PRODUÇÃO ON-FARM
  Dashboard Produção              Operação               Dashboard Produção               /operacao/dashboard-producao
  Cockpit Laboratório             Operação               Cockpit Laboratório              /cockpit-laboratorio
  Planejamento Produção           Operação               Planejamento Produção            /operacao/planejamento
  Ordens de Serviço               Operação               Ordens de Serviço                /ordens-servico
  Lotes                           Técnico/Auditoria      Lotes (Técnico)                  /lotes
  Controle de Qualidade           Técnico/Auditoria      Controle de Qualidade (Técnico)  /controle-qualidade
  Envase                          Técnico/Auditoria      Envase (Técnico)                 /envase
  Estoque                         Operação               Estoque                          /estoque
  Entregas                        Operação               Entregas                         /entregas

FINANCEIRO (16 itens — preservar todos, na ordem atual)
  Todos os itens 21–36 (ver seção C)

FINANCEIRO B2B (10 itens — preservar todos)
  Todos os itens 37–46 (ver seção C)

INTELIGÊNCIA E CONTROLE
  BI Agronômico                   Menu Principal         BI Agronômico                    /bi-agronomico
  BI Operacional                  Gestão                 BI Operacional                   /bi-operacional
  Relatórios Gerenciais           Gestão                 Relatórios                       /relatorios
  Alertas                         Gestão                 Alertas (badge dinâmico)         /alertas-operacionais
  Auditorias                      Gestão                 Auditorias                       /auditoria

ADMINISTRAÇÃO
  Configurações                   Menu Principal         Configurações                    /configuracoes
```

**Pendências para a Fase 2 decidir** (item preservado onde está — regra 16):
- **Portal do Produtor** (item 8, `/portal`) — não consta nos grupos-alvo. Manter em Menu Principal / Administração até definição.
- **Dashboard Sócios** (`/executivo/socios-b2b`) hoje está em Financeiro B2B; poderia ir para Dashboard/Visão Executiva. **Preservar em Financeiro B2B**.
- **Auditoria Financeira** (`/financeiro/auditoria`) vs **Auditorias** (`/auditoria`) — nomes similares, escopos distintos (ver seção I).

---

## G. Duplicidades e páginas semelhantes (comparação exigida)

| Comparação | Veredito | Base técnica |
|---|---|---|
| **Dashboard** (`/`) vs **Portal Executivo** (`/executivo`) vs **Painel Operacional** (`/painel-operacional`) | **Não são duplicatas.** `/` faz roteamento dinâmico por perfil (`Index.tsx`: admin/gestor → `PainelOperacional`, técnicos → `DashboardAgronomico`, produtor → `/portal`); `/executivo` é `PortalExecutivo` (KPIs executivos); `/painel-operacional` é o painel operacional cru. Todos preservar. |
| **Financeiro** vs **Dashboard B2B** vs **Visão Geral B2B** | **Não são duplicatas.** `/financeiro` = dashboard financeiro geral; `/financeiro/b2b` = visão geral B2B; `/financeiro/b2b/dashboard` = dashboard financeiro B2B agregado. Componentes distintos. |
| **Governança** (`/financeiro/b2b/governanca`) vs **Central Governança** (`/financeiro/b2b/central-governanca`) vs **Regras Governança** (`/financeiro/b2b/regras`) | **Não duplicadas.** Três componentes distintos, escopos distintos. Preservar. |
| **Relatórios** (`/relatorios`, Gestão) vs **Relatórios** (`/financeiro/relatorios`) | **Não duplicadas** (nomes iguais no menu, componentes distintos: `Relatorios.tsx` gerencial vs `FinanceiroRelatorios.tsx`). Renomear rótulo do primeiro para "Relatórios Gerenciais" na Fase 2 (destino já indicado em INTELIGÊNCIA). |
| **Alertas** (`/alertas-operacionais`) vs **Alertas Comerciais** (`/comercial/alertas`) vs **Alertas Financeiros** (`/financeiro/b2b/alertas`) | **Não duplicadas.** Três domínios. Preservar. |
| **Solicitações** (`/solicitacoes`) vs **Solicitações B2B** (`/comercial/solicitacoes-b2b`) | **Não duplicadas.** Fluxos distintos (produtor vs B2B). Preservar. |
| **Portal Executivo** vs **Dashboard Sócios** | Escopos diferentes. Não fundir. |

---

## H. Matriz resumida de permissões por grupo alvo

| Grupo alvo | Perfis com acesso a **algum** item do grupo (união) |
|---|---|
| Dashboard | admin, gestor, ct, ta, admv, op, prod, fin (raiz `/` — visibilidade heterogênea) |
| Comercial e Relacionamento | admin, gestor, gcom, fin(r), ct, cp, admv, ta (por item) |
| Campo e Assistência Técnica | admin, gestor, ct, ta, apl, admv, op |
| Produção On-Farm | admin, gestor, prod, op, admv, gcom(r), fin(r), cp(r em Entregas/Aplicações) |
| Financeiro | admin, gestor, fin |
| Financeiro B2B | admin, gestor, fin, gcom(r), admv(r) |
| Inteligência e Controle | admin, gestor, ct, ta, admv, op, prod |
| Administração | admin(rw), demais (r) por design atual |

**Regra 5 preservada:** nenhuma matriz de permissão será alterada.

---

## I. Inconsistências encontradas (registro, sem correção nesta fase)

1. **`AppRole` legado com `financeiro` em `getHomeForRole`** não redireciona (cai no default `/`). Ver `permissions.ts:199`.
2. **`/auditoria-sync`** está em `permissions.ts` mas é apenas redirect em `App.tsx`. Sem impacto funcional.
3. **`/portal-parceiro/novo|catalogo|simulador`** apontam para o mesmo componente `ParceiroNovoPedido` — intencional (tabs internas), documentar.
4. **Item de menu "Portal do Produtor"** (`/portal`) só é acessível para `cliente_produtor`, mas figura no `menuItems` admin do `AppSidebar` — filtrado por `canAccess` para admins some corretamente; para `cliente_produtor` o layout admin não é usado (Home = `/portal`).
5. **`AlertasBadgeMenu`** só é renderizado no item `/alertas-operacionais`. Preservar.
6. **Rótulo "Relatórios"** aparece duas vezes na sidebar (grupo Financeiro e grupo Gestão) — não é duplicidade funcional; renomear na Fase 2 conforme matriz F.
7. **Grupo "Financeiro B2B"** é o único colapsável (`Collapsible`); os demais não são. Padronização é decisão da Fase 2.
8. **`MobileLayout` e `PortalLayout`** definem suas próprias tabs; não são regidas por `AppSidebar`. Qualquer reorganização da sidebar admin **não** afeta esses layouts — regra 12.
9. **`Auditorias`** aparece no `secondaryItems` como último item mas não foi contado explicitamente entre os 9 "Gestão e Estratégico" do prompt (contagem: 9 + Auditorias = 10 no código). Preservar.

---

## J. Riscos da reorganização (Fase 2)

1. Reagrupar itens pode alterar ordem de visibilidade dependente de perfil se `canAccess` divergir por acidente. Mitigação: manter todos os `MenuItem` intactos, mover apenas entre arrays de grupo.
2. Rótulo "Relatórios Gerenciais" (renomeio visível): risco baixo (só `title`), zero em rota. Compatibilidade URL preservada.
3. `AlertasBadgeMenu` está acoplado à url `/alertas-operacionais` no `renderItem`; qualquer split precisa manter o mesmo `url` para não perder o badge.
4. Grupo "Técnico/Auditoria" será dissolvido na proposta (itens vão para Produção On-Farm com badge "Técnico"). Badge deve ser preservado no `MenuItem.badge`.
5. Os portais mobile (`/app`), produtor (`/portal`) e B2B (`/portal-parceiro`) têm navegação própria — Fase 2 deve declarar explicitamente que só toca em `AppSidebar` desktop.
6. `Index.tsx` decide qual dashboard renderizar em `/` por perfil — não alterar aqui.

---

## K. Pontos que exigem compatibilidade

- Preservar TODOS os 9 redirects listados em E.
- Preservar rota `/` como agregadora com routing por role.
- Preservar chaves de `ACCESS_MAP` (não renomear rotas).
- Preservar `badge: "Técnico"` em Lotes/CQ/Envase.
- Preservar `AlertasBadgeMenu` em `/alertas-operacionais`.
- Preservar subrotas de detalhe (`/:id`) mesmo que não apareçam no menu.

---

## L. Critério de conclusão da Fase 1

Cada uma das 63 entradas do prompt tem, nesta fase, registrado: **rota, componente/página, perfis autorizados e destino planejado**. ✅

**Confirmação:** nenhum arquivo funcional foi alterado nesta fase. Nenhuma migration, RLS, RPC, rota ou componente foi tocado.

**Aguardando auditoria antes da Fase 2.** Não avançar automaticamente (regra 14).
