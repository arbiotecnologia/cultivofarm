# Fase 3 — Remoção de Pedidos/Simulações B2B do Portal do Produtor

Data: 02/07/2026
Status final: **✅ APTO**

## 1. Natureza da rota `/portal/meus-pedidos`

**Exclusiva B2B.** A auditoria confirmou que `src/pages/portal/PortalMeusPedidos.tsx` consumia apenas:

- `useProdutorPedidos` → RPC `get_portal_cliente_b2b_orders_secure` (partner_orders)
- `useProdutorSimulacoes` → RPC `get_portal_cliente_b2b_simulations_secure` (partner_simulations)
- `DetalhePedidoDrawer` / `DetalheSimulacaoDrawer` com `viewerScope="produtor"`

Não havia dados operacionais não-B2B nessa rota (OS, produção, entregas, aplicações já possuem rotas próprias `/portal/ordens-servico`, `/portal/producao`, `/portal/entregas`, `/portal/aplicacoes`).

## 2. O que foi removido

- Item **"Meus Pedidos"** do menu do produtor (`src/pages/portal/PortalLayout.tsx`).
- Rota `/portal/meus-pedidos` agora **redireciona para `/portal`** (`src/App.tsx`).
- Import de `PortalMeusPedidos` removido de `src/App.tsx`.
- Chamadas frontend às RPCs `get_portal_cliente_b2b_orders_secure` e `get_portal_cliente_b2b_simulations_secure` **não são mais executadas** para o produtor (nenhuma rota do produtor consome os hooks).

## 3. O que foi mantido

- Componente `PortalMeusPedidos.tsx` no repositório (não rotado) — reservado para uso interno futuro.
- Hooks `useProdutorPedidos` / `useProdutorSimulacoes` em `src/hooks/useProdutorSolicitacoes.ts` — sem consumidores no fluxo do produtor.
- Hooks `useComercialSimulacoesAll` e `usePartnerSimulationsWithClient` no mesmo arquivo — usados em `/comercial/*` e no portal do parceiro, **preservados**.
- RPCs no banco (todas preservadas):
  - `get_portal_cliente_b2b_orders_secure`
  - `get_portal_cliente_b2b_simulations_secure`
  - `get_portal_cliente_b2b_order_detail_secure`
  - `get_portal_cliente_b2b_simulation_detail_secure`

## 4. Hooks alterados

Nenhum. Os hooks continuam existindo e funcionais; apenas ficaram sem consumidor no portal do produtor.

## 5. RPCs B2B removidas do frontend do produtor

- `get_portal_cliente_b2b_orders_secure` — sem chamada no fluxo do produtor.
- `get_portal_cliente_b2b_simulations_secure` — sem chamada no fluxo do produtor.
- `get_portal_cliente_b2b_order_detail_secure` — invocada apenas via `DetalhePedidoDrawer`, que só é montado pelas telas do parceiro/comercial após Fase 2.
- `get_portal_cliente_b2b_simulation_detail_secure` — idem.

## 6. Confirmação: RPCs não foram dropadas do banco

Nenhuma migration de DROP foi executada. As quatro RPCs `get_portal_cliente_b2b_*_secure` permanecem em `pg_proc` com sua RLS interna (`_portal_cliente_user_has_link`).

## 7. Confirmação: produtor não vê B2B

- Menu do produtor sem entrada B2B.
- Rota `/portal/meus-pedidos` intercepta com `<Navigate to="/portal" replace />` antes de qualquer render.
- Nenhum outro componente sob `/portal/*` importa `useProdutorPedidos` / `useProdutorSimulacoes` / `DetalhePedidoDrawer` / `DetalheSimulacaoDrawer` (verificado por `rg`).
- Produtor não visualiza: pedidos B2B, simulações B2B, status/detalhes/valores B2B, parceiro responsável, badge de conversão, origem B2B.

## 8. Rotas do produtor preservadas

Todas mantidas inalteradas:

- `/portal` (Dashboard)
- `/portal/financeiro`
- `/portal/fazendas` (+ `/:id`)
- `/portal/agenda`
- `/portal/registros` (+ `/:id`)
- `/portal/recomendacoes`
- `/portal/ordens-servico`
- `/portal/producao`
- `/portal/entregas`
- `/portal/aplicacoes`
- `/portal/solicitar`
- `/portal/perfil`

## 9. Permissões (`src/lib/permissions.ts`)

`/portal` continua exclusivo do `cliente_produtor` (rw). Não há entrada B2B liberada para `cliente_produtor` no `ACCESS_MAP`.

## 10. Build

TypeScript sem erros. Nenhum import quebrado; rota redirect não depende de componente.

## Critério de APTO — atendido

- ✅ Produtor não visualiza pedidos B2B
- ✅ Produtor não visualiza simulações B2B
- ✅ Portal do produtor continua funcional
- ✅ Demais rotas preservadas
- ✅ Build sem erro
- ✅ RPCs e tabelas B2B preservadas no banco
