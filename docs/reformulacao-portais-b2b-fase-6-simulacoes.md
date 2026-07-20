# Fase 6 — Reorganização de Simulações B2B por Perfil

## 1. Tela de Simulações do Gestor
- Rota: `/portal-parceiro/simulacoes-equipe` (`SimulacoesEquipe.tsx`).
- Menu do gestor exibe o label curto **"Simulações"** (`PortalParceiroLayout.tsx`, linha 31).
- Lista simulações criadas pelo gestor (via Catálogo) e pelos técnicos da equipe (via Simulador), com filtros por responsável, status, período, item e conversão. Ações: ver detalhe, converter em pedido, arquivar, duplicar e abrir pedido gerado.

## 2. Minhas Simulações do Técnico
- Rota: `/portal-parceiro/simulacoes` (`HistoricoSimulacoes.tsx`).
- Menu do técnico exibe **"Minhas Simulações"** (`PortalParceiroLayout.tsx`, linha 42).
- Filtro aplicado nesta fase: `sims = allSims.filter(s => s.created_by === user.id)` — o técnico só enxerga as próprias simulações do parceiro. Ações permitidas: visualizar, baixar PDF, excluir/arquivar rascunho.

## 3. Produtor não vê simulações B2B
- `ACCESS_MAP` em `src/lib/permissions.ts` mantém `cliente_produtor` fora de rotas B2B (herdado das Fases 2 e 3).
- `/portal/meus-pedidos` redireciona para `/portal` (Fase 2/3); nenhum hook `useProdutorSimulacoes` é consumido no portal do produtor.
- RLS de `partner_simulations`/`partner_simulation_items` continua restrita ao `partner_id` do usuário parceiro; produtores não têm `partner_users`.

## 4. Técnico não converte pedido
- `PortalParceiroLayout.tsx` bloqueia `parceiro_b2b_tecnico` das rotas `/pedidos`, `/catalogo` e `/novo`.
- Ação "Converter em pedido" existe apenas em `SimulacoesEquipe.tsx` (tela do gestor); a tela do técnico (`HistoricoSimulacoes.tsx`) não expõe conversão.

## 5. Gestor converte simulação
- Em `SimulacoesEquipe.tsx`, o gestor dispara a conversão que recalcula preço no backend, aplica condição comercial do parceiro, cria `partner_orders` + `partner_order_items`, atualiza status para `convertida_pedido` e grava `converted_order_id`.

## 6. Rotas usadas
- Gestor: `/portal-parceiro/simulacoes-equipe`
- Técnico: `/portal-parceiro/simulacoes`
- Catálogo (origem gestor): `/portal-parceiro/catalogo`
- Simulador (origem técnico): `/portal-parceiro/simulador`

## 7. Permissões aplicadas
- `parceiro_b2b` (gestor): simulações da equipe + conversão.
- `parceiro_b2b_tecnico`: apenas próprias simulações, sem conversão/pedidos/financeiro.
- `cliente_produtor`: sem acesso a simulações B2B.
- `administrador` / `gestor_comercial`: acesso consolidado via telas comerciais.

## 8. Resultado do build
- TypeScript sem erros. Alteração isolada em `HistoricoSimulacoes.tsx` (filtro por `created_by`).

## 9. Status
**APTO** — gestor vê simulações da equipe, técnico vê apenas as próprias, produtor não acessa simulações B2B, conversão em pedido restrita ao gestor e funcional, build sem erros.
