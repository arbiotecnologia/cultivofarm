## Problema

No Portal Parceiro B2B (`src/pages/portal-parceiro/PortalParceiroLayout.tsx`) a barra lateral mostra apenas o bloco "Parceiro → razão social". Não há em nenhum ponto do layout o nome do usuário logado, seu e-mail ou o papel (Gestor/Técnico). O dashboard (`DashboardPremium.tsx`) ainda saúda com a razão social do parceiro ("Olá, {partner.razao_social}"), reforçando a ambiguidade sobre quem está usando a conta.

## Ajuste proposto (somente frontend/apresentação)

### 1. Bloco de identidade do usuário na sidebar
No `PortalParceiroLayout.tsx`, acima do bloco "Parceiro", incluir um cartão de identidade com:
- Avatar circular com iniciais do nome (fallback: inicial do e-mail).
- Nome do usuário (`profile.nome`, fallback `profile.email`), truncado.
- E-mail em texto secundário menor.
- Badge do papel: "Gestor B2B" ou "Técnico B2B" (derivado de `usePartnerPapel()` / `role`), e "Visão interna" quando `isStaff` (admin/gestor_comercial simulando um parceiro).

O bloco "Parceiro" atual permanece logo abaixo, deixando clara a separação entre **quem sou** e **qual empresa estou representando**.

### 2. Cabeçalho mobile
O header mobile hoje só mostra "Portal Parceiro". Adicionar, à direita do título, o nome curto do usuário (primeiro nome) e o badge de papel em formato compacto, antes do botão de menu — mantendo o toque do menu com área mínima de 44px.

### 3. Saudação do dashboard
Em `DashboardPremium.tsx` e `DashboardTecnico.tsx`, trocar "Olá, {razão social}" por:
- Título: "Olá, {primeiro nome do usuário}"
- Subtítulo: "{razão social do parceiro} · {papel}"

### 4. Aviso de modo simulação (staff)
Quando `isStaff` estiver visualizando como parceiro, exibir uma faixa discreta no topo do conteúdo: "Você está visualizando como {razão social} (visão interna)". Isso evita que um admin confunda a sessão com a de um parceiro real.

## Detalhes técnicos

- Fonte dos dados: `useAuth()` já expõe `profile.nome`, `profile.email`, `role` e `roles`; `usePartnerPapel()` (em `src/hooks/useMyPartner.ts`) já devolve `papel: "gestor" | "tecnico"`. Nenhuma nova consulta ao banco é necessária.
- Rótulos de papel reutilizam `ROLE_LABELS` / `getPortalDisplayLabel` (`src/lib/portalDisplayLabel.ts`) para manter coerência com os demais portais; se necessário, acrescentar apenas o mapeamento visual "Gestor B2B"/"Técnico B2B" na camada de apresentação.
- Novo componente pequeno `src/components/portal-parceiro/UsuarioIdentidade.tsx` com as variantes `sidebar` e `compact` (mobile), evitando duplicação de markup.
- Uso exclusivo de tokens semânticos do design system (`text-muted-foreground`, `bg-primary/10`, `text-primary`), sem cores hardcoded.
- Sem alterações em rotas, guards, RLS, RPCs ou permissões — apenas apresentação.

## Validação
- `typecheck`, `build` e `vitest` (suite completa) após a alteração.
- Verificação visual via Playwright do layout em 1280px e em viewport mobile.
