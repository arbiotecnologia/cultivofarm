# Reformulação dos Portais B2B — Fase 2

Data: 02/07/2026
Status final: **✅ APTO**

## Decisão de produto

Parceiro B2B (gestor e técnico) **não terá acesso** a clientes/produtores neste momento.
Portal do Produtor **não exibe mais** pedidos/simulações B2B.
Estrutura de banco, RPCs e rotas preservadas para uso futuro.

---

## 1. Rotas removidas do menu do gestor B2B

- `/portal-parceiro/meus-produtores`
- `/portal-parceiro/meus-produtores/:clienteId`
- `/portal-parceiro/usuarios-clientes`
- `/portal-parceiro/tecnicos-produtores`
- `/portal-parceiro/solicitacoes`
- `/portal-parceiro/novo` (substituída por `/catalogo`)
- `/portal-parceiro/simulador` (mantido apenas para técnico)
- `/portal-parceiro/historico` (consolidado em Meu Histórico)

## 2. Rotas removidas do menu do técnico B2B

- `/portal-parceiro/meus-produtores` (bloqueada)
- Todas as rotas comerciais (pedidos, financeiro, catálogo, favoritos, meu-histórico, simulações-equipe, usuarios-clientes, tecnicos-produtores, solicitações)

## 3. Rotas redirecionadas

| Origem | Destino | Aplicado a |
|---|---|---|
| `/portal-parceiro/meus-produtores*` | `/portal-parceiro/dashboard` | parceiro_b2b, parceiro_b2b_tecnico |
| `/portal-parceiro/usuarios-clientes` | `/portal-parceiro/dashboard` | parceiro_b2b, parceiro_b2b_tecnico |
| `/portal-parceiro/tecnicos-produtores` | `/portal-parceiro/dashboard` | parceiro_b2b, parceiro_b2b_tecnico |
| `/portal-parceiro/novo` | `/portal-parceiro/catalogo` | parceiro_b2b, admin, gestor_comercial |
| `/portal-parceiro/novo` | `/portal-parceiro/simulador` | parceiro_b2b_tecnico |
| `/portal-parceiro/solicitacoes` | `/portal-parceiro/pedidos` | parceiro_b2b |
| `/portal/meus-pedidos` | `/portal` | cliente_produtor (rota agora inerte) |

Redirects implementados em `src/pages/portal-parceiro/PortalParceiroLayout.tsx` e `src/App.tsx`.

## 4. Rotas bloqueadas para parceiro_b2b_tecnico

- `/portal-parceiro/pedidos`
- `/portal-parceiro/solicitacoes`
- `/portal-parceiro/catalogo`
- `/portal-parceiro/novo`
- `/portal-parceiro/meus-produtores` (todas variantes)
- `/portal-parceiro/usuarios-clientes`
- `/portal-parceiro/tecnicos-produtores`
- `/portal-parceiro/favoritos`
- `/portal-parceiro/financeiro`
- `/portal-parceiro/historico`
- `/portal-parceiro/meu-historico`
- `/portal-parceiro/simulacoes-equipe`

Rotas **permitidas** ao técnico: `dashboard`, `simulador`, `simulacoes`, `fichas`.

## 5. Rotas bloqueadas para produtor (cliente_produtor)

- `/portal/meus-pedidos` — visualização B2B removida; rota redireciona para `/portal`.

Hooks `useProdutorPedidos` / `useProdutorSimulacoes` permanecem em `src/hooks/useProdutorSolicitacoes.ts` (sem consumidores no produtor) e RPCs `get_portal_cliente_b2b_*_secure` permanecem no banco para uso futuro.

## 6. Confirmações

- ✅ Produtor não vê mais pedidos/simulações B2B (rota redireciona; menu não expõe).
- ✅ Parceiro B2B (gestor e técnico) não acessa clientes/produtores (menu removido + redirect no layout + ACCESS_MAP restrito a admin/gestor_comercial).
- ✅ Tabelas, RPCs, RLS, migrations, dados históricos e financeiro preservados.

## 7. Menu final — Gestor B2B (`parceiro_b2b`)

1. Dashboard
2. Meus Pedidos
3. Simulações (rota `/simulacoes-equipe`)
4. Catálogo (rota `/catalogo`, reutiliza componente de NovoPedido)
5. Fichas Técnicas
6. Favoritos
7. Meu Histórico
8. Financeiro

## 8. Menu final — Técnico B2B (`parceiro_b2b_tecnico`)

1. Dashboard
2. Simulador
3. Minhas Simulações (rota `/simulacoes`)
4. Fichas Técnicas

## 9. Substituição /novo → /catalogo

- Rota `/portal-parceiro/catalogo` criada em `App.tsx` reutilizando `ParceiroNovoPedido`.
- Rota `/portal-parceiro/novo` mantida em `App.tsx` apenas para compat; redirect aplicado no layout.
- Técnico B2B não acessa `/catalogo` (redireciona ao dashboard).

## 10. Arquivos alterados

- `src/pages/portal-parceiro/PortalParceiroLayout.tsx` — menus e guards.
- `src/App.tsx` — rota `/catalogo`, redirect `/portal/meus-pedidos`, import removido.
- `src/lib/permissions.ts` — ACCESS_MAP ajustado.
- `src/pages/portal/PortalLayout.tsx` — item "Meus Pedidos" removido do menu.

## 11. Build

Sem erros de TypeScript. Rotas legadas mantidas para não quebrar links/histórico.

## Critério de APTO — atendido

- ✅ parceiro_b2b não visualiza clientes/produtores
- ✅ parceiro_b2b_tecnico não visualiza clientes/produtores
- ✅ produtor não visualiza pedidos/simulações B2B
- ✅ menu final do gestor B2B correto
- ✅ menu final do técnico B2B correto
- ✅ `/portal-parceiro/novo` redireciona para `/catalogo`
- ✅ build sem erro
