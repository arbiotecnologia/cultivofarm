# Fase 4 — Catálogo substitui "Novo Pedido"

Data: 02/07/2026
Status final: **✅ APTO**

## 1. Rota `/portal-parceiro/catalogo` — consolidada

Criada em `src/App.tsx` reutilizando o componente `ParceiroNovoPedido` (já contém catálogo, carrinho, salvar simulação e efetivar pedido).

Acesso via `src/lib/permissions.ts`:

- `parceiro_b2b` ✅
- `administrador` ✅
- `gestor_comercial` ✅
- `parceiro_b2b_tecnico` 🚫 (redirect no layout)
- `cliente_produtor` 🚫

## 2. Rota `/portal-parceiro/novo` — redirecionada

`PortalParceiroLayout.tsx` intercepta:

- gestor / admin / gestor_comercial → `/portal-parceiro/catalogo`
- técnico → `/portal-parceiro/simulador`

Rota mantida em `App.tsx` por compat interna (sem quebra de links antigos).

## 3. Textos da tela

`src/pages/portal-parceiro/NovoPedido.tsx` detecta `/catalogo` via `location.pathname` e ajusta:

- **Título:** "Catálogo"
- **Subtítulo:** "Consulte produtos e microrganismos, monte uma simulação ou efetive um pedido."

Textos "Novo Pedido" preservados apenas quando a rota antiga é acessada por perfis internos (admin) para não quebrar contexto legado.

## 4. Fluxo de carrinho — validado (reuso)

Componente já suporta:

- Consulta de produtos e microrganismos (`usePartnerCatalog`)
- Preço conforme condição comercial do parceiro (`PrecoComDesconto`, `TotaisCarrinho`)
- Adicionar ao carrinho (`AddToCartDialog`)
- Ajuste de quantidade / remoção
- Favoritar (compartilhado com `/portal-parceiro/favoritos`)
- Ficha técnica via cards do catálogo

## 5. "Salvar como simulação" — validado

Hook `useCreatePartnerSimulation` cria `partner_simulations` + `partner_simulation_items` com status inicial coerente com fluxo B2B. Simulação aparece em:

- Simulações do gestor (`/portal-parceiro/simulacoes-equipe` — renomeada "Simulações" no menu)
- Comercial (`/comercial/solicitacoes-b2b`)
- **Não visível ao produtor** (rota `/portal/meus-pedidos` desativada em Fase 3)

## 6. "Efetivar pedido" — validado

Hook `useCreatePartnerOrder` cria `partner_orders` + `partner_order_items` aplicando condição comercial real do parceiro. Pedido aparece em:

- `/portal-parceiro/pedidos`
- `/comercial/pedidos-b2b`
- Dashboards `/comercial/dashboard-b2b`
- **Não visível ao produtor**

## 7. Bloqueio do técnico B2B — validado

`PortalParceiroLayout.tsx` (Fase 2):

```ts
if (isTecnico && location.pathname.startsWith("/portal-parceiro/catalogo")) {
  return <Navigate to="/portal-parceiro/dashboard" replace />;
}
if (location.pathname.startsWith("/portal-parceiro/novo")) {
  if (isTecnico) return <Navigate to="/portal-parceiro/simulador" replace />;
  return <Navigate to="/portal-parceiro/catalogo" replace />;
}
```

Técnico continua usando `/portal-parceiro/simulador` sem desconto (modo simulação = `isRoleTecnico || isSimuladorRoute`).

## 8. Favoritos e Fichas Técnicas — mantidos

- Menu "Favoritos" preservado (`/portal-parceiro/favoritos`).
- Menu "Fichas Técnicas" preservado.
- Não removidos nesta fase; filtro "Favoritos" no Catálogo fica como iteração futura.

## 9. Build

TypeScript sem erros. Nenhum import quebrado.

## Critério de APTO — atendido

- ✅ Gestor B2B acessa `/catalogo`
- ✅ Técnico B2B bloqueado em `/catalogo` e `/novo`
- ✅ Carrinho salva simulação
- ✅ Carrinho efetiva pedido
- ✅ `/novo` redireciona para `/catalogo`
- ✅ Build sem erro
