# Auditoria de fechamento — Módulos, páginas e dashboard

Objetivo: executar uma varredura **somente-leitura** cobrindo tudo que foi alterado nas fases recentes (dashboard unificado, reorganização da navegação, dissolução do "Controle Financeiro", remoção das badges "Técnico") e certificar que não há pendências, órfãos ou regressões.

## Escopo da auditoria

### 1. Validação técnica base
- `bun run typecheck`
- `bun run build`
- `bun run test` (esperado: 349/349)

### 2. Consistência de navegação (`src/config/navigation.ts`)
- Cada item aponta para uma rota **existente** em `src/App.tsx` ou possui `legacyRoutes` bem definidas.
- Nenhum ID duplicado; ícones importados sem sobras.
- Grupos vazios ou colapsados sem filhos remanescentes.
- Badges "Técnico" ausentes em Lotes, Controle de Qualidade e Envase (confirmar também em variações mobile e busca).

### 3. Rotas e redirects (`src/App.tsx`)
- `/financeiro/auditoria` → `/auditoria?tab=financeiro`
- `/financeiro/configuracoes` → `/configuracoes?tab=financeiro`
- `/executivo` e `/painel-operacional` → `/dashboard/executivo` / `/dashboard/operacional`
- `/portal-executivo` → destino canônico registrado (Fase 7.2)
- Nenhuma rota funcional apontando para páginas removidas.

### 4. Permissões (`src/lib/permissions.ts`)
- `ACCESS_MAP` sem entradas para rotas dissolvidas.
- `getHomeForRole` coerente para todos os perfis (administrador, gestor, financeiro, agrônomo, aplicador, laboratorista, consultor_tecnico, parceiro_b2b, cliente_produtor, etc.).

### 5. Dashboard unificado (`/dashboard/*`)
- `DashboardUnificado.tsx` cobre `geral | executivo | operacional`, com lazy loading e estado ativo correto no sidebar.
- Perfis não executivos não caem em `/dashboard/geral` (Regra da Fase 3.1).
- Retry/resiliência em `VisaoGeral.tsx` presente.

### 6. Auditorias e Configurações unificadas
- `Auditoria.tsx` expõe aba `financeiro` apenas para `administrador | gestor | financeiro`.
- `Configuracoes.tsx` aceita `?tab=financeiro` e renderiza `ConfiguracoesFinanceiras`.
- Deep links de fora do sistema funcionam (parâmetro `tab` respeitado).

### 7. Multiportal e portais dedicados
- `PortalLayout` (produtor) intacto; `getHomeForRole` redireciona corretamente perfis alheios.
- `/selecionar-portal`, `MobilePerfil`, rótulos por contexto (`portalDisplayLabel`) sem regressão.

### 8. Busca da sidebar (`src/lib/navigation/search.ts`)
- Termos-chave testados: "auditoria financeira", "configurações financeiras", "configurações gerais", "BI agronômico", "alertas comerciais", "alertas gerais", "visão executiva", "portal executivo", "lotes", "envase", "controle de qualidade".
- Nenhum resultado apontando para IDs removidos.

### 9. Testes de regressão específicos
- `navigation.controle-financeiro.test.ts`
- `navigation.fase4/6/6-1/7-2.test.ts`
- `integration/financeiro.routes.test.tsx`
- `sidebar.dashboard.active.test.tsx`
- `multiportal.*` e `mobilePerfil.hardening.test.tsx`

### 10. Verificações runtime (Playwright headless em `localhost:8080`)
- Login como admin (`admin@arbio.com` / `Bio#2026`) e navegação por:
  - `/dashboard/geral` → `/dashboard/executivo` → `/dashboard/operacional`
  - `/auditoria` (todas as abas visíveis) e `/auditoria?tab=financeiro`
  - `/configuracoes` e `/configuracoes?tab=financeiro`
  - `/financeiro/auditoria` (deve redirecionar) e `/financeiro/configuracoes` (deve redirecionar)
  - Um item de cada grupo do sidebar reorganizado (Comercial, Campo, Produção, Financeiro, Financeiro B2B, Inteligência e Controle, Administração)
- Coleta de erros de console e requests com status ≥ 400.

## Detalhamento técnico

- Nenhuma alteração de código, migration ou dependência. Somente leitura + execução de validações e Playwright.
- Todos os achados são reportados em uma tabela final classificando cada verificação como **OK**, **ATENÇÃO** (recomendação, sem bloqueio) ou **PENDENTE** (regressão real que exige ação).
- Se algo estiver **PENDENTE**, listo o arquivo/linha e a correção mínima sugerida — mas não aplico sem sua autorização.

## Entrega

Relatório final consolidado com:
1. Resultado das validações técnicas.
2. Matriz por módulo (Dashboard, Comercial, Campo, Produção, Financeiro, Financeiro B2B, Inteligência, Auditorias, Configurações, Portais).
3. Lista de pendências (se houver) e propostas de correção.
4. Classificação global: **APTO**, **APTO COM RESSALVAS** ou **NÃO APTO**.
