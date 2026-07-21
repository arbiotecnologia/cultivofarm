
# Unificação do subgrupo "Controle Financeiro"

Objetivo: eliminar o subgrupo **Controle Financeiro** do menu Financeiro. **Auditoria Financeira** passa a viver dentro de **Inteligência e Controle → Auditorias**, e **Configurações Financeiras** dentro de **Administração → Configurações**. Rotas antigas continuam funcionando via redirecionamento para não quebrar links.

## Estado atual (verificado)

- `src/config/navigation.ts` linhas 146–147: itens `fin-auditoria` e `fin-config` com `subSection: "Controle Financeiro"`.
- `src/App.tsx` linhas 505–506: rotas `/financeiro/auditoria` e `/financeiro/configuracoes` (RoleGuard).
- `src/pages/Auditoria.tsx`: tabs `sync | senhas | clientes | visitas | agenda` sincronizadas com `?tab=`.
- `src/pages/Configuracoes.tsx`: tabs `perfil | usuarios | ...` sincronizadas com `?tab=`.
- `src/lib/permissions.ts` linhas 175–176: ACL das duas rotas atuais (administrador/gestor/financeiro).
- `src/test/integration/financeiro.routes.test.tsx` linhas 23 e 34: exige `/financeiro/auditoria` + página `AuditoriaFinanceira` em App.tsx.

## Escopo funcional

### 1. Auditorias (`/auditoria`)
- Adicionar nova aba **Financeiro** ao final da lista `TABS` em `src/pages/Auditoria.tsx`, renderizando o componente atual `AuditoriaFinanceira` como sub-tela.
- Sub-abas internas atuais (Eventos / Inconsistências) permanecem intactas dentro do componente.

### 2. Configurações (`/configuracoes`)
- Adicionar nova aba **Financeiro** ao `Tabs` de `src/pages/Configuracoes.tsx`, renderizando `ConfiguracoesFinanceiras`.
- Visível apenas para papéis com acesso financeiro (administrador, gestor, financeiro).

### 3. Rotas antigas
Manter em `src/App.tsx`, substituindo o `element` por `PreservedNavigate` (padrão já usado no projeto):
- `/financeiro/auditoria` → `/auditoria?tab=financeiro`
- `/financeiro/configuracoes` → `/configuracoes?tab=financeiro`

Registrar ambas em `legacyRoutes` dos novos itens no navigation.

### 4. Menu (`src/config/navigation.ts`)
- Remover os itens `fin-auditoria` e `fin-config` do grupo Financeiro (linhas 146–147).
- Enriquecer `searchKeywords` do item `auditorias` com "auditoria financeira", "trilha financeira", "logs financeiros" e do item `configuracoes` com "configurações financeiras", "parâmetros financeiros", para preservar a descoberta via busca.
- Isso elimina o subgrupo "Controle Financeiro" (sem itens restantes).

### 5. Permissões (`src/lib/permissions.ts`)
- Remover as entradas específicas de `/financeiro/auditoria` e `/financeiro/configuracoes` do `ACCESS_MAP` (as rotas viram redirects; o acesso passa a ser regido por `/auditoria` e `/configuracoes` já existentes, ambos abertos a administrador/gestor).
- Adicionar guard visual dentro das novas abas para ocultar a aba **Financeiro** quando o papel não for administrador/gestor/financeiro.

### 6. Testes
- Atualizar `src/test/integration/financeiro.routes.test.tsx`: remover `/financeiro/auditoria` da lista `REQUIRED_ROUTES` e `AuditoriaFinanceira` de `REQUIRED_PAGES`; adicionar asserção de que `/financeiro/auditoria` redireciona para `/auditoria?tab=financeiro`.
- Novo teste curto em `src/test/navigation.controle-financeiro.test.ts` garantindo:
  - Nenhum item com `subSection === "Controle Financeiro"`.
  - Busca por "auditoria financeira" retorna o item `auditorias`.
  - Busca por "configurações financeiras" retorna o item `configuracoes`.

## Validação
- `bun run typecheck`
- `bun run build`
- `bun run test`

## Fora de escopo
- Nenhuma mudança em schema, RPCs ou lógica de negócio das telas movidas.
- Layouts internos de `AuditoriaFinanceira` e `ConfiguracoesFinanceiras` permanecem idênticos.
