# Padronizar o cabeçalho em todos os portais

Hoje só o painel do administrador tem o cabeçalho novo (avatar com menu do usuário + central de notificações unificada). Os demais portais usam variações antigas:

- **Portal do Produtor** (`/portal`): marca + seletor de cliente + bloco de identidade estático + botão "Sair" solto.
- **Portal Parceiro B2B** (`/portal-parceiro`): cabeçalho só no mobile, identidade dentro da sidebar, "Sair"/"Trocar de portal" no rodapé da sidebar.
- **App mobile** (`/app`): faixa de identidade sem menu, sem logout e sem notificações.

O objetivo é uma barra superior única, com a mesma altura, hierarquia e comportamento, adaptada ao contexto de cada portal.

## O que será feito

1. **Barra superior compartilhada** — um componente único de cabeçalho com três zonas fixas:
   - Esquerda: gatilho de menu (sidebar/hambúrguer) + marca do portal ("AR Bio On-Farm", "Portal do Produtor", "Portal Parceiro B2B", "AR Bio Campo").
   - Centro/direita: slot de contexto (seletor de cliente no Produtor, parceiro/simulação no Parceiro) com truncamento e tooltip.
   - Direita: sino de notificações (quando o perfil tiver acesso) + menu do usuário.
   Mesma altura (h-14/h-16 responsivo), mesmo fundo `bg-card` com blur, mesmo `sticky top-0`.

2. **Menu do usuário reaproveitado em todos os portais** — o `UserMenu` do admin passa a ser usado no Produtor, Parceiro e App mobile, substituindo os botões "Sair" isolados. Ele ganha props opcionais para:
   - ocultar "Configurações" quando o perfil não tem acesso à rota;
   - exibir "Trocar de portal" quando o usuário tem mais de um contexto (hoje só existe no Parceiro).
   Nenhuma permissão nova é concedida: os itens só aparecem se as regras atuais já permitirem.

3. **Notificações consistentes** — o sino unificado (abas Alertas/Notificações) passa a aparecer nos portais cujo perfil já tem direito aos dados. Onde o perfil não pode ver alertas, o sino simplesmente não é renderizado (sem chamadas extras ao backend).

4. **Ajuste de cada layout** — `AppLayout`, `PortalLayout`, `PortalParceiroLayout` e `MobileLayout` passam a montar a nova barra em vez do cabeçalho próprio. Menu lateral, rotas, guards e conteúdo das páginas ficam inalterados; no Parceiro a identidade sai da sidebar e vai para a barra, e o rodapé da sidebar perde os botões duplicados.

5. **Validação** — typecheck, build e Vitest completos, mais verificação visual com Playwright (desktop e mobile) nos quatro portais, usando as contas de teste já existentes.

## Detalhes técnicos

- Novo `src/components/portal/PortalTopBar.tsx` (apresentação pura, sem lógica de dados) com props: `brandTitle`, `brandIcon`, `leadingSlot`, `contextSlot`, `showNotifications`, `userMenuProps`.
- `PortalIdentityHeader` continua existindo para usos internos (sidebar do Parceiro), mas deixa de ser o bloco de identidade do topo.
- `UserMenu` recebe `settingsTo?: string | null` e `onSwitchPortal?: () => void`; a visibilidade de "Configurações" é decidida por `canAccess(role, "/configuracoes")`.
- Sem alterações em `src/config/navigation.ts`, `permissions.ts`, rotas, RLS, migrations ou Edge Functions.

## Fora de escopo

- Nenhuma mudança de banco, produção ou publicação.
- Nenhuma alteração nos itens de menu, permissões ou fluxos de negócio.
