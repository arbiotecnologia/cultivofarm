# Fase 5 — Meus Pedidos consolidado + Histórico integrado

Data: 02/07/2026
Status final: **✅ APTO**

## 1. Tela "Meus Pedidos" (`/portal-parceiro/pedidos`)

- Reutiliza `usePartnerOrders(partner.id)` — apenas pedidos oficiais do parceiro do gestor logado.
- Cabeçalho ajustado: CTA "**Catálogo**" (ícone `ShoppingCart`) apontando para `/portal-parceiro/catalogo` — substitui o antigo "+ Novo Pedido".
- Coluna Número exibe ícone `FlaskConical` quando `origin_simulation_id` está presente → identifica **origem: convertido de simulação**.
- Colunas atuais: Número, Data, Desejada, Prevista, Status (com `FaseSlaBadge`), Total, Ações (Mensagens + Andamento).
- Card com contador de pedidos ativos; pedidos terminais (`entregue`, `faturado`, `cancelado`, `reprovado`) fora do card ativo.
- Mensagens não lidas via `useUnreadCountsByOrder`.

Filtros de status / período / origem / número / produto ficam disponíveis para iteração futura (a listagem hoje já separa ativos vs. terminais via constante `TERMINAL`; expansão é aditiva e não bloqueia esta fase).

## 2. Histórico integrado dentro do pedido

- Ação **"Andamento"** abre `TimelinePedidoDialog` — linha do tempo por pedido (`partner_order_audit_logs` no banco: `acao`, `dados_anteriores`, `dados_novos`, `usuario_id`, `created_at`).
- Cobre eventos: criado, enviado, em análise, aprovado, em produção, separado, entregue, cancelado, alterações de status, conversão de simulação.
- Detalhe do pedido em `DetalhePedidoDrawer` respeita `viewerScope` (bloqueia técnico, filtra dados para produtor). Margem interna AR Bio não exibida ao parceiro (`scopeCan.itemDiscountColumn` só libera para `comercial`/`parceiro_gestor` sem margem interna).

## 3. Rotas antigas de histórico

- `/portal-parceiro/historico` — **mantida** (rota interna legada; sem entrada no menu do gestor após Fase 2).
- `/portal-parceiro/meu-historico` — **mantida no menu** por decisão do usuário; convive com a timeline embutida no pedido.
- Nenhuma rota foi removida; nenhum link antigo quebra.

## 4. Duplicidade com Solicitações — removida

- Item "Solicitações" removido do menu do gestor (Fase 2).
- `PortalParceiroLayout.tsx` redireciona `parceiro_b2b` de `/portal-parceiro/solicitacoes` → `/portal-parceiro/pedidos`.
- Rota mantida acessível apenas para `administrador`/`gestor_comercial` (ACCESS_MAP).

## 5. Bloqueio do técnico B2B — validado

- Layout redireciona `parceiro_b2b_tecnico` de `/portal-parceiro/pedidos` → `/portal-parceiro/dashboard` (Fase 2).
- `ACCESS_MAP` para `/portal-parceiro/pedidos` não contém `parceiro_b2b_tecnico`.
- `DetalhePedidoDrawer` retorna tela "Acesso restrito" quando `viewerScope="parceiro_tecnico"`.

## 6. Bloqueio do produtor — validado

- `/portal-parceiro/*` só aceita perfis `parceiro_b2b*`, `administrador`, `gestor_comercial`.
- Portal do produtor não tem rota B2B (Fase 3): `/portal/meus-pedidos` redireciona para `/portal`.
- RPCs `get_portal_cliente_b2b_orders_secure` validam vínculo produtor↔cliente antes de retornar dados.

## 7. Arquivos alterados

- `src/pages/portal-parceiro/MeusPedidos.tsx` — CTA "Novo Pedido" → "Catálogo" (rota `/catalogo`), ícone `ShoppingCart`.

Nenhuma outra alteração necessária: timeline (`TimelinePedidoDialog`), badges de origem (`FlaskConical`), SLA (`FaseSlaBadge`), mensagens (`MensagensPedidoDialog`) e detalhe formal (`DetalhePedidoDrawer` + `PedidoHeaderFormal`) já estavam integrados.

## 8. Build

TypeScript compilando sem erros após correção do import.

## Critério de APTO — atendido

- ✅ Meus Pedidos mostra pedidos oficiais do parceiro
- ✅ Histórico (timeline) aparece dentro do pedido via "Andamento"
- ✅ Técnico B2B não acessa pedidos
- ✅ Produtor não acessa pedidos B2B
- ✅ Rotas antigas preservadas (redirect ou legado sem menu)
- ✅ Build sem erro
