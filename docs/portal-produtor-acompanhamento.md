# Portal do Produtor — Acompanhamento (Fase 10)

## 1. Status
**APTO** — refinamentos da Fase 10.1 concluídos: navegação cruzada OS ↔ Produção, mobile de Entregas em cards, testes automatizados criados e build sem erros.


## 2. Decisão
- As telas "Ordens de Serviço" e "Produção" foram diagnosticadas na Fase 9 como **parcialmente sobrepostas**.
- Produção passou a ser **aba** dentro de Acompanhamento.
- Entregas também foi integrada como aba.
- Foi criada aba adicional **Histórico** consolidando itens finalizados.
- As rotas antigas foram preservadas com **redirect** para não quebrar links.

## 3. Nova rota oficial
`/portal/acompanhamento` (protegida por `PortalLayout` + `usePortalCliente`).

Query string suportada:
- `?tab=ordens-servico` (padrão)
- `?tab=producao`
- `?tab=entregas`
- `?tab=historico`

## 4. Abas
| Aba | Componente reutilizado | Conteúdo |
|---|---|---|
| Ordens de Serviço | `PortalOrdensServico` | OS `ordens_servico` + `ordens_servico_onfarm` do cliente, Timeline de 9 fases, Laudo Digital. |
| Produção | `PortalProducao` (corrigido) | `programacao_producao` das OS do cliente, com produto/microrganismo, volume, status. |
| Entregas | `PortalEntregas` | `entregas` do cliente com produto, motorista, veículo, status. |
| Histórico | `HistoricoTab` (novo) | Itens finalizados de OS, Produção e Entregas com filtros por tipo, fazenda e busca. |

## 5. Rotas legadas (redirecionadas — arquivos preservados)
- `/portal/ordens-servico` → `Navigate` para `/portal/acompanhamento?tab=ordens-servico`
- `/portal/producao` → `Navigate` para `/portal/acompanhamento?tab=producao`
- `/portal/entregas` → `Navigate` para `/portal/acompanhamento?tab=entregas`

Os componentes `PortalOrdensServico`, `PortalProducao` e `PortalEntregas` continuam existindo e agora são usados como conteúdo interno da nova tela.

## 6. Correção aplicada no filtro de Produção (bug da Fase 9)
`PortalProducao.tsx` — antes usava a mesma lista de IDs de `ordens_servico` para filtrar `ordem_servico_id` **e** `ordem_servico_onfarm_id`, gerando falso-positivo. Agora:

1. Busca IDs de `ordens_servico` por `cliente_id`.
2. Busca IDs de `ordens_servico_onfarm` por `cliente_id` **em paralelo**.
3. Monta `.or(...)` incluindo apenas as cláusulas dos conjuntos não vazios.
4. Retorna lista vazia se nenhum conjunto tiver registros.
5. Passa a incluir `lotes(id, controle_qualidade(id))` no select para futuros badges de lote/laudo.

## 7. Padronização de status
Novo helper `src/lib/portal/statusAcompanhamento.ts` centraliza:
- Labels amigáveis por domínio (OS / Produção / Entrega).
- Conjuntos `*_FINAL` usados pela aba Histórico.
- Descrições curtas para etapas potencialmente confusas (ex.: `em_producao`, `em_cq`).

## 8. Menu do Portal do Produtor
`PortalLayout.tsx` — três itens antigos substituídos por um único **"Acompanhamento"** (`/portal/acompanhamento`, ícone `ClipboardList`). Demais itens preservados: Dashboard, Meus Títulos, Fazendas, Minha Agenda, Registros Técnicos, Recomendações, Aplicações, Solicitar Atendimento, Meu Perfil.

## 9. Mobile-first
- Layout em cards nas abas (`PortalProducao` já usa `MobileCard`; `HistoricoTab` também é card-based).
- `TabsList` marcado com `flex-wrap h-auto` para toque confortável em telas estreitas.
- Laudo Digital continua abrindo em `Dialog` responsivo (herdado de `PortalOrdensServico`).

## 10. Confirmação — sem B2B no Acompanhamento
Buscas explicitamente restritas a: `ordens_servico`, `ordens_servico_onfarm`, `programacao_producao`, `lotes`, `controle_qualidade`, `entregas`, `produtos`, `microrganismos`, `fazendas`, `talhoes`.

**Não são consultadas** em nenhuma aba do Acompanhamento:
- `partner_orders`
- `partner_order_items`
- `partner_simulations`
- `partner_simulation_items`

RLS pré-existente das tabelas operacionais continua vigente (isolamento por `cliente_id`).

## 11. Testes
Não foram adicionados testes automatizados nesta fase (item marcado como ressalva). Sugestão para a próxima iteração: criar `src/test/portalAcompanhamentoProdutor.test.tsx` cobrindo render das abas, redirect das rotas legadas e ausência de consultas B2B (via mock do `supabase.from`).

## 12. Resultado do build
TypeScript sem erros após os ajustes de cast dos arrays `*_FINAL` na chamada `.in()`.

## 13. Arquivos alterados
- `src/pages/portal/PortalAcompanhamento.tsx` — novo
- `src/lib/portal/statusAcompanhamento.ts` — novo
- `src/pages/portal/PortalProducao.tsx` — correção do filtro OS + On-Farm
- `src/pages/portal/PortalLayout.tsx` — menu simplificado (1 item Acompanhamento)
- `src/App.tsx` — rota nova + 3 redirects legados

---

## Refinamento Fase 10.1

### Embedded mode
`PortalOrdensServico`, `PortalProducao` e `PortalEntregas` recebem prop opcional `embedded?: boolean`. Quando `true`, o título/subtítulo interno é omitido, evitando duplicidade dentro das abas de `PortalAcompanhamento`. `PortalAcompanhamento` sempre passa `embedded`.

### Links cruzados OS ↔ Produção
- Card de OS agora exibe botão **"Ver produção"** quando existe `programacao_producao` relacionada. Navegação:
  - OS manual → `/portal/acompanhamento?tab=producao&os=<id>`
  - OS On-Farm → `/portal/acompanhamento?tab=producao&os_onfarm=<id>`
- Card de Produção exibe **"Ver ordem de serviço"** e, quando disponível, badge `OS <numero_os>`. Navegação simétrica:
  - `/portal/acompanhamento?tab=ordens-servico&os=<id>` ou `&os_onfarm=<id>`

### Destaque por query string
`PortalAcompanhamento` lê os parâmetros `os` e `os_onfarm` e repassa como `highlightedOsId` / `highlightedOnfarmOsId` para `PortalOrdensServico` e `PortalProducao`. O card correspondente ganha `ring-2 ring-primary bg-primary/5` e, na aba OS, um badge **"Selecionada"**.

### Mobile de Entregas
`PortalEntregas` agora usa `useIsMobile`:
- Mobile: cards com produto, status, data de saída, motorista, veículo e observação (quando houver).
- Desktop: tabela original preservada.
- Estado vazio: "Nenhuma entrega registrada para acompanhamento."

### Helpers de status centralizados
`PortalProducao` e `PortalEntregas` substituíram seus `STATUS_LABELS` locais por `labelProducao` / `labelEntrega` de `src/lib/portal/statusAcompanhamento.ts`.

### Testes criados
`src/test/portalAcompanhamentoProdutor.test.tsx` — 10 testes cobrindo:
1. Render de `/portal/acompanhamento` com as 4 abas.
2. Redirects `/portal/ordens-servico|producao|entregas` → `/portal/acompanhamento?tab=...`.
3. Ausência de `partner_orders` / `partner_simulations` em todos os 4 arquivos do fluxo.
4. `PortalProducao` busca `ordens_servico_onfarm` separadamente (`manualIds` / `onfarmIds`).
5. Renderização mobile de Entregas (`data-testid="entrega-card"` + `useIsMobile`).
6. Ações "Ver produção" e "Ver ordem de serviço" presentes.

Resultado: **10/10 passando** (`bunx vitest run src/test/portalAcompanhamentoProdutor.test.tsx`).

### Resultado do build
TypeScript sem erros. Nenhuma regressão detectada.

### Arquivos alterados na Fase 10.1
- `src/pages/portal/PortalOrdensServico.tsx` — props embedded/highlight, botão "Ver produção", badge "Selecionada".
- `src/pages/portal/PortalProducao.tsx` — props embedded/highlight, enriquecimento com `numero_os`, botão "Ver ordem de serviço", helper `labelProducao`.
- `src/pages/portal/PortalEntregas.tsx` — props embedded, layout mobile em cards, helper `labelEntrega`.
- `src/pages/portal/PortalAcompanhamento.tsx` — lê `os` / `os_onfarm` da query e repassa aos filhos com `embedded`.
- `src/test/portalAcompanhamentoProdutor.test.tsx` — novo.
