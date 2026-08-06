# Refinamento visual do cabeçalho do painel administrador

## Objetivo

Melhorar a visualização do cabeçalho administrativo (`AppLayout`) sem descaracterizar a identidade AR Bio. Foco em: eliminar truncamento de nome/papel, unificar os dois sinos de notificação em uma central única e adicionar um menu de usuário moderno.

## Estado atual

- Header de `src/components/AppLayout.tsx` com `h-16`.
- Lado esquerdo: `SidebarTrigger` + logo mobile "AR Bio / On-Farm".
- Lado direito: `PortalIdentityHeader variant="compact"` (avatar + nome + papel truncado), `AlertasNotificationBell` (sino 1), `NotificacoesPopover` (sino 2), botão de logout.
- Paleta do projeto: primário verde bio (`160 84% 22%`), sidebar azul-escuro (`215 25% 12%`), fonte Inter, tema claro como padrão.

## Direção de design

Manter a identidade existente (verde bio + azulado escuro, Inter, tema claro). Refinar para um header mais moderno com:
- Hierarquia mais limpa entre identidade, notificações e ações.
- Uso de tokens semânticos (`bg-card`, `border-border`, `text-muted-foreground`, `primary`) — sem cores hardcoded.
- Bordas sutis, sombras leves e foco visível consistente.
- Altura mantida em ~`h-16` (densidade "Equilibrado").

## O que será feito

### 1. Novo componente `CentralNotificacoesHeader`

Criar `src/components/notificacoes/CentralNotificacoesHeader.tsx`.

- Substitui os dois sinos atuais (`AlertasNotificationBell` + `NotificacoesPopover`) por um único sino.
- Popover com duas abas/seções:
  - "Alertas": prioriza alertas críticos (mesmo conteúdo de `AlertasMiniList` com resumo de críticos/não lidos).
  - "Notificações": lista de notificações do sistema (`useNotificacoesUnificadas`).
- Badge única: mostra o total mais relevante (críticos > não lidos de alertas > não lidos de notificações). Usa `destructive` apenas quando houver críticos.
- Mantém link para a central completa e para `/alertas-operacionais`.

### 2. Novo componente `UserMenu`

Criar `src/components/UserMenu.tsx`.

- Avatar com iniciais (reutilizar lógica de `PortalIdentityHeader`) + dropdown.
- No desktop, exibir brevemente nome + papel ao lado do avatar (sem truncamento excessivo; usa `max-w-[200px]` ou `max-w-[260px]` em telas maiores).
- No mobile, header mostra apenas avatar; nome/papel/email aparecem dentro do dropdown.
- Itens do dropdown:
  - Cabeçalho fixo: nome completo, e-mail e papel (badge sutil).
  - Separador.
  - Link "Perfil" (se houver rota; senão, desabilitado ou oculto).
  - Link "Configurações" (se houver rota; senão, desabilitado ou oculto).
  - Separador.
  - Botão "Sair" com ícone `LogOut`.

### 3. Ajuste em `AppLayout.tsx`

- Substituir o grupo atual à direita por:
  - `CentralNotificacoesHeader`
  - `UserMenu`
- Remover o `PortalIdentityHeader` compacto da direita e o botão de logout isolado.
- Manter `SidebarTrigger` e logo mobile no lado esquerdo.
- Ajustar espaçamento (`gap-2 sm:gap-4`) para evitar quebra em telas pequenas.
- Garantir que a área de ações da direita não cause scroll horizontal.

### 4. Melhorias no truncamento

- `UserMenu` desktop: tooltip no nome quando truncado; usar `truncate` com `title`.
- Dropdown: mostra nome completo em múltiplas linhas, sem truncamento.
- `CentralNotificacoesHeader`: abas com contadores (ex.: "Alertas (3)") para reduzir dependência de badges.

### 5. Acessibilidade e responsividade

- Todos os botões de ícone com `aria-label` descritivo.
- Dropdown fechável por `Esc` e navegável por teclado (shadcn DropdownMenu).
- Foco visível com `ring-sidebar-ring` / `ring-ring`.
- Testar em desktop (1280px+) e mobile (375px).

## Arquivos afetados

- `src/components/AppLayout.tsx`
- `src/components/UserMenu.tsx` (novo)
- `src/components/notificacoes/CentralNotificacoesHeader.tsx` (novo)
- `src/components/notificacoes/NotificacoesPopover.tsx` (referência / possível reutilização parcial)
- `src/components/alertas/AlertasNotificationBell.tsx` (referência / possível reutilização parcial)
- `src/components/portal/PortalIdentityHeader.tsx` (referência para lógica de avatar/iniciais)

## Escopo explícito

- Somente apresentação no header administrativo (`AppLayout`).
- Não alterar rotas, guards, permissões, RLS, banco ou Edge Functions.
- Não modificar os portais de produtor, parceiro ou campo — a não ser que o componente compartilhado `PortalIdentityHeader` precise de ajuste mínimo de prop (sem quebrar consumidores existentes).
- Não alterar o head metadata (`index.html`) nem título/descrição do site.

## Validação

- `bunx tsgo` (typecheck) limpo.
- `bunx vitest run` sem regressões.
- `bun run build` com sucesso.
- Screenshot via Playwright do header em `/dashboard/geral` em desktop e mobile para confirmar: nome/papel legíveis, dropdown funcional, central de notificações única renderizada.
