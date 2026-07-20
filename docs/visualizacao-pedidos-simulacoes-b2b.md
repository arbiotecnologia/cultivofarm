# Visualização de Pedidos e Simulações B2B — Relatório Final

**Status geral: ✅ APTO**

Todas as regras de visualização por perfil foram implementadas, testadas e o build está sem erros.

---

## 1. Portais contemplados

| Portal | Rota principal | Perfis |
|---|---|---|
| Portal do Produtor | `/portal/meus-pedidos` | `produtor` (via `user_clientes`) |
| Portal Parceiro Gestor | `/portal-parceiro/solicitacoes` | `parceiro_b2b`, `administrador`, `gestor_comercial` |
| Portal Parceiro Técnico | `/portal-parceiro/simulacoes` | `parceiro_b2b_tecnico` |
| Comercial AR Bio | `/comercial/solicitacoes-b2b` | `administrador`, `gestor_comercial`, `financeiro` (r) |

---

## 2. Regras por perfil

### Produtor (`viewerScope="produtor"`)
- Vê **apenas pedidos** vinculados ao seu cliente (`user_clientes` → RPC segura).
- Vê **apenas simulações** liberadas do seu cliente (status `enviada_gestor` e `convertida_pedido`).
- **Não vê**: desconto, margem, notas comerciais, status financeiro, responsáveis internos, observações gerais.
- Simulações `rascunho` e `arquivada` são filtradas na UI e não retornadas pela RPC.

### Gestor B2B (`viewerScope="parceiro_gestor"`)
- Vê pedidos e simulações do seu `partner_id`.
- Consegue converter simulação em pedido (fluxo existente).
- Vê descontos, notas do parceiro, condição comercial do parceiro.
- **Não vê**: status financeiro interno da AR Bio, notas comerciais internas.
- Vê badge de origem (Manual / Originado de simulação) e navegação cruzada simulação↔pedido.

### Técnico B2B (`viewerScope="parceiro_tecnico"`)
- Vê **apenas as próprias simulações** que ele criou.
- **Bloqueado** em `/portal-parceiro/solicitacoes` (redirect no `PortalParceiroLayout` + `ACCESS_MAP` sem entrada).
- **Não abre** detalhe de pedido oficial (`scopeCan.openOrderDetail` = false).
- **Não vê** desconto, financeiro, margem.

### Comercial AR Bio (`viewerScope="comercial"`)
- Visão consolidada de **todos** os pedidos e simulações B2B.
- KPIs: total pedidos, total simulações, convertidas, pendentes, valor total pedidos, valor total simulado.
- Filtros: parceiro, cliente, status, período, tipo (pedido / simulação / pedido de simulação / simulação não convertida).
- Navegação cruzada: abre pedido gerado a partir da simulação e abre simulação de origem a partir do pedido.
- Vê todos os campos sensíveis (financeiro, comercial, margem, responsáveis).

---

## 3. RPCs criadas (SECURITY DEFINER)

| RPC | Uso |
|---|---|
| `get_portal_cliente_b2b_orders_secure(p_cliente_id)` | Lista pedidos do cliente vinculado ao produtor |
| `get_portal_cliente_b2b_simulations_secure(p_cliente_id)` | Lista simulações liberadas (`enviada_gestor`, `convertida_pedido`) |
| `get_portal_cliente_b2b_order_detail_secure(p_order_id)` | Detalhe seguro do pedido (header + itens) para produtor |
| `get_portal_cliente_b2b_simulation_detail_secure(p_simulation_id)` | Detalhe seguro da simulação para produtor |

Todas validam vínculo via `_portal_cliente_user_has_link(auth.uid(), cliente_id)`. Sem vínculo → `forbidden_cliente_vinculo`.

---

## 4. Componentes atualizados

- `src/pages/portal/PortalMeusPedidos.tsx` — título "Pedidos e Simulações B2B", aviso de tabela, filtros, cards mobile, ocultação de rascunho/arquivada, link "pedido gerado".
- `src/pages/portal-parceiro/Solicitacoes.tsx` — abas Pedidos/Simulações, filtros avançados, badges de origem/conversão, navegação cruzada, cards mobile.
- `src/pages/comercial/SolicitacoesB2B.tsx` — KPIs no topo, filtros multi-dimensão, colunas ampliadas, navegação cruzada, `viewerScope="comercial"`.
- `src/components/pedidos-b2b/DetalhePedidoDrawer.tsx` — respeita `viewerScope`, bloqueia técnico, usa RPC segura para produtor.
- `src/components/pedidos-b2b/DetalheSimulacaoDrawer.tsx` — respeita `viewerScope`, usa RPC segura para produtor.
- `src/components/pedidos-b2b/PedidoHeaderFormal.tsx` — oculta blocos financeiros/internos por escopo.
- `src/components/pedidos-b2b/viewerScope.ts` — regras centralizadas (`scopeCan`).
- `src/lib/permissions.ts` — remoção de `parceiro_b2b_tecnico` de `/portal-parceiro/solicitacoes`.

---

## 5. Testes criados

- `src/test/portalProdutorPedidosSimulacoes.test.tsx` — vínculo por cliente, ocultação de rascunho/arquivada, bloqueio de campos comerciais.
- `src/test/portalParceiroSolicitacoes.test.tsx` — gestor vê pedidos/sims do parceiro, técnico bloqueado em solicitações e sem detalhe de pedido/desconto.
- `src/test/comercialSolicitacoesB2B.test.tsx` — acesso total do comercial e permissões de escopo.

---

## 6. Build

✅ Build sem erros. Tipos regenerados após migrations.

---

## 7. Critérios de APTO — checklist

- [x] Produtor vê apenas seus dados (via RPC + `user_clientes`).
- [x] Técnico B2B não acessa solicitações consolidadas (ACCESS_MAP + redirect).
- [x] Gestor B2B vê pedidos e simulações do parceiro.
- [x] Comercial vê visão consolidada com KPIs e funil.
- [x] Simulações rascunho/arquivadas não aparecem para produtor.
- [x] Detalhes respeitam `viewerScope`.
- [x] Build sem erro.

**Conclusão: APTO para produção.**

---

## Validação prática pós-implementação

**Data:** 02/07/2026

### Resultado dos testes
✅ 3/3 arquivos de teste passaram — **19/19 testes verdes**.
- `src/test/portalProdutorPedidosSimulacoes.test.tsx` — 6/6
- `src/test/portalParceiroSolicitacoes.test.tsx` — 9/9
- `src/test/comercialSolicitacoesB2B.test.tsx` — 4/4

### Resultado do build
✅ Build sem erros. TypeScript sem falhas.

### RPCs verificadas no banco
Todas as 4 funções existem e estão registradas em `pg_proc`:
- `get_portal_cliente_b2b_orders_secure`
- `get_portal_cliente_b2b_simulations_secure`
- `get_portal_cliente_b2b_order_detail_secure`
- `get_portal_cliente_b2b_simulation_detail_secure`

Cada função valida `_portal_cliente_user_has_link(auth.uid(), p_cliente_id)` e lança `forbidden_cliente_vinculo` quando o usuário não tem vínculo. Simulações `rascunho`/`arquivada` são filtradas dentro da RPC de listagem, portanto não trafegam para o cliente mesmo com manipulação da UI.

### Validação por perfil

| Perfil | Rota | Situação |
|---|---|---|
| Produtor | `/portal/meus-pedidos` | ✅ vê só cliente vinculado; rascunho/arquivada ocultas; scopeCan bloqueia desconto/margem/financeiro/notas |
| Gestor B2B | `/portal-parceiro/solicitacoes` | ✅ filtro por `partner_id`; badges de origem/conversão; drawer `parceiro_gestor`; sem margem interna |
| Técnico B2B | `/portal-parceiro/simulacoes` | ✅ bloqueado em `/portal-parceiro/solicitacoes` via `ACCESS_MAP` + redirect no layout; sem detalhe de pedido; sem desconto |
| Comercial | `/comercial/solicitacoes-b2b` | ✅ KPIs, filtros (parceiro/cliente/status/período/tipo), navegação cruzada simulação↔pedido; drawer `comercial` |

### Status final
**✅ APTO** — validação prática concluída sem regressões. Nenhuma alteração de RLS, viewerScope ou fluxo aprovado foi necessária.
