# Revisão final do cabeçalho dos portais

Objetivo: corrigir o erro de build restante e eliminar as redundâncias que sobraram após a padronização, mantendo a identidade concentrada no `PortalIdentityHeader`.

## 1. Correção do erro de build (bloqueante)

`src/pages/app/MobileLayout.tsx` passa `role` (tipado como `string | null`) para `getPortalDisplayLabel`, que exige `AppRole | null`.

Correção: consumir `primaryRole` do `useAuth` (já tipado como `AppRole | null`) em vez de `role`, e remover `role` da desestruturação.

## 2. Redundâncias remanescentes a eliminar

- **Portal Parceiro (mobile)**: o cabeçalho superior repete a marca "Portal Parceiro" enquanto a sidebar aberta mostra a mesma marca. Manter a marca apenas no topo em mobile e apenas na sidebar em desktop (comportamento já parcialmente aplicado — validar e ajustar classes).
- **Portal Parceiro (compact)**: a linha compacta mostra nome + papel + nome do parceiro; o nome do parceiro já aparece no bloco de contexto quando a sidebar está aberta. Em mobile, manter parceiro apenas na linha compacta; em desktop, apenas no bloco de contexto.
- **Portal do Produtor**: o nome do cliente aparece no seletor/rótulo de contexto e nada mais deve repeti-lo; a linha compacta fica restrita a nome + papel.
- **Layout interno e app mobile**: garantir que o papel apareça uma única vez (sem badge extra no header nem duplicação na sidebar).

## 3. Validação

- Typecheck e build limpos.
- Suíte Vitest completa.
- Conferência visual em desktop e mobile das quatro superfícies (parceiro, produtor, interno, app), checando truncamento de nomes longos e legibilidade do papel.

## Detalhes técnicos

Arquivos afetados: `src/pages/app/MobileLayout.tsx`, `src/pages/portal-parceiro/PortalParceiroLayout.tsx`, `src/pages/portal/PortalLayout.tsx`, `src/components/AppLayout.tsx` e, se necessário, ajustes de apresentação em `src/components/portal/PortalIdentityHeader.tsx`.

Escopo estritamente de apresentação: sem alteração de rotas, guards, permissões, RPCs ou banco.
