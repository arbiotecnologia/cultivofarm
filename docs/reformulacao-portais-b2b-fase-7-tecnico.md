# Fase 7 — Simplificação do Portal Técnico B2B

## 1. Menu final do técnico (`PortalParceiroLayout.tsx`, `menuTecnico`)
1. Dashboard — `/portal-parceiro/dashboard`
2. Simulador — `/portal-parceiro/simulador`
3. Minhas Simulações — `/portal-parceiro/simulacoes`
4. Fichas Técnicas — `/portal-parceiro/fichas`

Total: **4 itens**, exatamente como especificado.

## 2. Rotas permitidas para `parceiro_b2b_tecnico`
- `/portal-parceiro/dashboard`
- `/portal-parceiro/simulador`
- `/portal-parceiro/simulacoes`
- `/portal-parceiro/fichas`

## 3. Rotas bloqueadas (redirecionam para `/portal-parceiro/dashboard`)
Implementadas em `PortalParceiroLayout.tsx`:

- `/portal-parceiro/pedidos` — bloco `isTecnico` (linhas 111-121)
- `/portal-parceiro/catalogo` — bloco dedicado (linhas 103-105)
- `/portal-parceiro/novo` — redireciona técnico para `/simulador` (linhas 106-109)
- `/portal-parceiro/solicitacoes` — bloco `isTecnico`
- `/portal-parceiro/meus-produtores` e `/meus-produtores/:clienteId` — bloco `isPartnerRole` (linhas 94-100)
- `/portal-parceiro/usuarios-clientes` — bloco `isPartnerRole`
- `/portal-parceiro/favoritos` — bloco `isTecnico`
- `/portal-parceiro/financeiro` — bloco `isTecnico`
- `/portal-parceiro/historico` — bloco `isTecnico`
- `/portal-parceiro/meu-historico` — bloco `isTecnico`
- `/portal-parceiro/simulacoes-equipe` — bloco `isTecnico`

## 4. Técnico não acessa Catálogo
Confirmado — `isTecnico && startsWith("/portal-parceiro/catalogo")` → `Navigate` para `/dashboard`. Item "Catálogo" não existe em `menuTecnico`.

## 5. Técnico não acessa Pedidos
Confirmado — `/pedidos` no bloco `isTecnico`. Item "Meus Pedidos" ausente do `menuTecnico`. `DetalhePedidoDrawer` respeita `viewerScope` e bloqueia técnico.

## 6. Técnico não acessa Financeiro
Confirmado — `/financeiro` bloqueado; item ausente do menu.

## 7. Técnico não acessa Clientes/Produtores
Confirmado — `/meus-produtores`, `/usuarios-clientes`, `/tecnicos-produtores` bloqueados via `isPartnerRole` (Fase 2). Nenhum item de clientes/produtores no `menuTecnico`.

Bônus:
- Simulador (Fase 4/6): usa valor de tabela cheio, sem desconto/margem/condição comercial.
- Minhas Simulações (Fase 6): filtro `created_by === user.id`, sem conversão em pedido, sem financeiro.

## 8. Resultado do build
TypeScript sem erros. Nenhuma alteração de código nesta fase — configuração já atendida pelas Fases 2, 4 e 6.

## 9. Status
**APTO** — técnico tem exatamente 4 itens no menu, todas as rotas indevidas redirecionam para o dashboard, simulador e minhas simulações operacionais, build sem erros.
