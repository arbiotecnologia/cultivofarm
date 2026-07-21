# Fase 3.2 — Estabilização Final do Dashboard, Rotas Mobile e Navegação

Fase corretiva focada em resolver as 4 ressalvas remanescentes da Fase 3.1. Sem reorganizar grupos, sem alterar RLS/permissões de negócio, sem migrations, sem remover funcionalidades.

## Escopo verificado no código atual

- **`/app/*`**: já protegida por `AppPortalGuard` (RPC `has_technical_access`) + `TechnicalFeatureGuard` / `ProducerFeatureGuard`. A autorização real **não** depende do `ACCESS_MAP` — este está omisso para `/app*`, o que gera falso-negativo na busca da sidebar e nos testes de permissão que consultam `canAccess`.
- **Item pai "Dashboard"** (`src/config/navigation.ts`): tem `route: "/dashboard/geral"`, mas o componente `AppSidebar` marca `isActive` via `isNavItemActive(item, pathname)`, que testa também `matchRoutes`. Já contém `/dashboard/executivo` e `/dashboard/operacional` em `matchRoutes` — porém, quando um filho está ativo, o pai e o filho ficam ambos marcados como ativos simultaneamente com o mesmo estilo, e o filho **não** ganha destaque diferenciado. Falta também estado "parcialmente ativo" (aria) e não há `aria-expanded` no pai.
- **`VisaoGeral`**: consome exclusivamente `useExecutivoResumo`. Um `error` colapsa todos os cards em "Indisponível" sem ação de retry e sem separação visual entre blocos executivos (dependentes da RPC) e blocos operacionais (que poderiam ter fontes próprias). Os atalhos e navegação já são estáticos e não quebram.
- **Lint**: `package.json` **já tem** `"lint": "eslint ."` e existe `eslint.config.js` na raiz — cenário A. Basta executar e corrigir apenas o que estiver em arquivos das Fases 2/3/3.1/3.2.

## Parte 1 — Proteção explícita de `/app/*` no ACCESS_MAP

Adicionar entradas em `src/lib/permissions.ts` refletindo exatamente os perfis já autorizados por `AppPortalGuard` + guards de feature. **Nenhuma permissão nova é concedida**; a mudança apenas espelha o que já é enforced em runtime, permitindo que `canAccess()` (usado por sidebar/busca/testes) reconheça as rotas.

Regra alvo (idêntica à do runtime):

```
/app                    → administrador, cliente_produtor, consultor_tecnico, tecnico_agronomo, aplicador
/app/perfil             → mesmos + parceiro_b2b_tecnico se já tiver has_technical_access
/app/notificacoes       → mesmos de /app
/app/fazendas           → administrador, consultor_tecnico, tecnico_agronomo, aplicador  (Technical)
/app/registrar          → idem Technical
/app/registros          → idem Technical
/app/ordens             → idem Technical
/app/solicitacoes       → idem Technical
/app/checkin[/:id]      → idem Technical
/app/visita[/:id|/novo] → idem Technical
/app/talhao/:id         → idem Technical
/app/catalogo           → idem Technical
/app/recomendacoes      → administrador, cliente_produtor  (Producer)
/app/entregas           → idem Producer
/app/aplicacoes[/lista] → idem Producer
/app/solicitar          → idem Producer
```

Para evitar duplicação, criar duas constantes no topo de `permissions.ts`:

```ts
const APP_TECHNICAL_ROLES = ["administrador","consultor_tecnico","tecnico_agronomo","aplicador"] as const;
const APP_PRODUCER_ROLES  = ["administrador","cliente_produtor"] as const;
```

e usá-las para gerar as entradas do `ACCESS_MAP`. `isMobileProfile` permanece intocado (é usado só por `getHomeForRole` / labels). Os guards em runtime permanecem — o ACCESS_MAP é a segunda camada declarativa, não substituta.

Testes: adicionar cobertura em `src/test/multiportal.guards.test.tsx` (ou novo `src/test/permissions.mobile.test.ts`) para `canAccess(role, "/app/...")` de todos os 13 perfis.

## Parte 2 — Realce do item pai Dashboard

Alterar `src/components/AppSidebar.tsx` e (se necessário) `src/lib/navigation/matchActive.ts`:

1. Introduzir helper `isNavItemActiveSelf(item, pathname)` que ignora `matchRoutes` para saber se **o próprio route** do item bate exatamente. O item filho passa a receber `isActive` só quando `pathname` casa com seu `route`.
2. O item pai (`Dashboard`) continua usando `isNavItemActive` (que já cobre `matchRoutes` + `legacyRoutes`), mas ganha classe visual "parcialmente ativo" (fundo `sidebar-accent/60`, sem `text-sidebar-primary`) quando um filho está ativo e o pathname não é a rota do próprio pai.
3. Renderizar o pai como `<button>`/`NavLink` com `aria-expanded={hasChildren && !collapsed}` e `aria-controls` do bloco de filhos.
4. Manter clique do pai levando a `/dashboard/geral` (route atual já é essa) preservando query string e hash: usar `NavLink to={{ pathname: item.route, search: keepSearch ? search : "" }}` **apenas** se estivermos numa das legacyRoutes; caso contrário `to={item.route}`. Comportamento simples: sempre `to={item.route}` — a preservação de query/hash já é responsabilidade dos redirects `PreservedNavigate` das rotas `/executivo` e `/painel-operacional`.
5. Drawer mobile (`MobileLayout`): confirmar se renderiza itens com children; se não renderiza (só usa tabs), o realce mobile de "Dashboard" não se aplica (rota `/app` é outra árvore) — documentar isso.
6. Sidebar recolhida (`collapsed`): filhos ficam ocultos (comportamento atual). Garantir que o pai continua com estado ativo/parcial quando qualquer filho é a rota atual.

Testes: `src/test/sidebar.dashboard.active.test.tsx` cobrindo `pathname` = `/dashboard/geral`, `/dashboard/executivo`, `/dashboard/operacional`, `/executivo`, `/painel-operacional`, e `/clientes` (nenhum ativo).

## Parte 3 — Resiliência da Visão Geral

Editar `src/pages/dashboard/VisaoGeral.tsx` sem tocar `useExecutivoResumo`, sem alterar RLS/RPC. Objetivo: distinguir estados e localizar a falha.

1. **Classificação dos blocos** — separar visualmente (mesmo arquivo, seções):
   - **A. Bloco Executivo** (dependente de `rpc_executivo_resumo_geral`): "Saúde Operacional", "Clientes ativos", "Receita bruta", contadores agregados.
   - **B. Blocos Operacionais** (fontes próprias já presentes na página — OS/Lotes/Insumos/Entregas via queries diretas listadas na Fase 3): permanecem independentes; erro em A não afeta B.
   - **C. Atalhos/Navegação**: sempre visíveis (links para `/dashboard/executivo`, `/dashboard/operacional`, Cockpit).
2. **Estados do bloco A**:
   - `isLoading` → skeleton.
   - `data` presente → renderiza valores (inclusive `0` legítimo).
   - `error` → **um único card consolidado** substitui os cards executivos com mensagem: "Não foi possível carregar o resumo executivo neste momento. Os demais módulos continuam disponíveis." + botão `Tentar novamente` (chama `resumoQ.refetch()`).
   - Log técnico via `console.warn` (sem SQL/RLS/detalhes ao usuário).
3. **Retry**: usar apenas `refetch` manual do React Query já presente. Não configurar `retry` automático adicional (a lib já tem o padrão 3, mantido). Sem loops.
4. **Blocos operacionais (B)**: cada `useQuery` independente ganha seu próprio estado skeleton/erro/dados, sem cascatear. Já é o padrão do React Query — apenas explicitar `isError` por bloco.
5. **Nomenclaturas** da Fase 3.1 preservadas ("Clientes ativos", "Receita bruta", períodos "Últimos 30 dias" / "Agora" / "Hoje").
6. **Atalho Cockpit Laboratório** garantido no rodapé/topo do bloco C, sempre renderizado.

Testes: `src/test/dashboard.visao-geral.resiliencia.test.tsx` com mock de `useExecutivoResumo` cobrindo: sucesso com dados, sucesso com zeros, `error`, `isLoading`. Verificar que atalhos + Cockpit permanecem no DOM em todos os cenários.

## Parte 4 — Lint (cenário A confirmado)

`package.json` já contém `"lint": "eslint ."` e `eslint.config.js` existe.

1. Executar `bun run lint` no estado atual.
2. Corrigir **apenas** violações em arquivos das Fases 2/3/3.1/3.2:
   - `src/config/navigation.ts`
   - `src/lib/navigation/*`
   - `src/lib/permissions.ts`
   - `src/components/AppSidebar.tsx`
   - `src/hooks/useSidebarGroupState.ts`
   - `src/pages/dashboard/*`
   - `src/pages/Index.tsx`
   - `src/App.tsx` (só as linhas de rota de dashboard)
   - `src/components/PreservedNavigate.tsx`
3. Não atualizar versões, não refatorar fora do escopo, não silenciar regras globalmente. Warnings pré-existentes fora do escopo ficam registrados no relatório.

## Parte 5 — Bateria de testes

Rodar em ordem e reportar tudo:

```
bun run typecheck
bun run build
bunx vitest run
bun run lint
```

Novos testes automatizados:
- `src/test/permissions.mobile.test.ts` — 13 perfis × rotas mobile.
- `src/test/sidebar.dashboard.active.test.tsx` — pai/filho e pathnames legacy.
- `src/test/dashboard.visao-geral.resiliencia.test.tsx` — 4 estados da RPC + presença dos atalhos.

Cenários manuais (documentados no relatório, não bloqueantes):
- Login/redirect por perfil já validado nas Fases 3/3.1.
- Verificação visual do drawer mobile (sem realce de "Dashboard" pois `/app` é outra árvore).

## Arquivos a alterar

```
src/lib/permissions.ts                                    (Parte 1)
src/components/AppSidebar.tsx                             (Parte 2)
src/lib/navigation/matchActive.ts                         (Parte 2, se necessário helper novo)
src/pages/dashboard/VisaoGeral.tsx                        (Parte 3)
src/test/permissions.mobile.test.ts                       (novo)
src/test/sidebar.dashboard.active.test.tsx                (novo)
src/test/dashboard.visao-geral.resiliencia.test.tsx       (novo)
```

Nenhum arquivo removido. Nenhuma migration. Nenhuma alteração em Edge Functions, RLS, `is_executivo` ou permissões de RPC.

## Relatório final incluirá

A. Arquivos analisados · B. Arquivos alterados · C. Matriz `/app/*` → perfis · D. Perfis autorizados em `/app` · E. Perfis bloqueados em `/app` · F. Diff resumido do `ACCESS_MAP` · G. Lógica pai/filho ativo · H. Comportamento sidebar expandida/recolhida/mobile · I. Dependências da RPC executiva · J. Blocos preservados em falha · K. Retry manual via `refetch` · L. typecheck · M. build · N. lint (executado — resultado real) · O. Testes por perfil · P. Riscos residuais · Q. Recomendação sobre Fase 4.

Fase 4 permanece bloqueada até auditoria desta fase.
