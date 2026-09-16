# Auditoria de perfis, portais e segurança de backend — 16/09/2026

Escopo: 13 perfis ativos, 4 portais (interno `/`, técnico/mobile `/app`, produtor `/portal`,
parceiro B2B `/portal-parceiro`) e a camada de autorização do banco/Edge Functions.

Método efetivamente executado nesta rodada:

- Leitura completa do roteamento (`src/App.tsx`), guardas (`src/components/guards/*`,
  `PortalGuard`, `RoleGuard`), mapa de permissões (`src/lib/permissions.ts`),
  resolução de home/contexto (`portalContext.ts`, `safeHome.ts`, `portalRoleContext.ts`)
  e menus (`src/config/navigation.ts`, `src/config/portalMenus.ts`, layouts dos portais).
- Auditoria estática de 722 migrations e 38 Edge Functions.
- Testes automatizados de permissão/contexto: 145 aprovados (17 arquivos).

**Não executado (bloqueado):** criação de usuários de teste, navegação autenticada na
prévia e consultas ao catálogo real (`pg_policies`, grants, `routine_privileges`).
Motivo no fim do documento. Portanto **esta auditoria não está concluída**: os achados de
backend são estáticos e precisam de confirmação contra o banco real.

---

## 1. Matriz de destino por perfil

| Perfil | Home declarada (`getHomeForRole`) | Destino real após login (`AuthRoute`) | Portais alcançáveis |
| --- | --- | --- | --- |
| administrador | `/dashboard/geral` | `/dashboard/geral` | todos (bypass legado) |
| gestor | `/dashboard/geral` | `/dashboard/geral` | interno |
| gestor_comercial | `/comercial/dashboard-consolidado` | idem | interno + B2B (bypass) |
| financeiro | `/financeiro` | idem | interno |
| administrativo | `/solicitacoes` | idem | interno |
| producao | `/operacao/dashboard-producao` | idem | interno |
| operador_onfarm | `/cockpit-laboratorio` | idem | interno |
| consultor_tecnico | `/app` | `/selecionar-portal` se multipapel | técnico |
| tecnico_agronomo | `/app` | idem | técnico |
| aplicador | `/app` | idem | técnico |
| cliente_produtor | `/portal` | **`/app`** (divergente) | produtor + `/app` |
| parceiro_b2b | `/portal-parceiro/pedidos` | seletor de portal se multipapel | B2B |
| parceiro_b2b_tecnico | `/portal-parceiro/dashboard` | idem | B2B |

## 2. Divergências de interface e autorização (frontend)

| # | Achado | Local | Risco | Situação |
| --- | --- | --- | --- | --- |
| F1 | Menu interno era filtrado pelo papel primário, enquanto a rota é autorizada pela lista completa de papéis: usuário multipapel não via itens que podia abrir | `AppSidebar.tsx` | Usabilidade | **Corrigido** nesta rodada (mesma fonte do `RoleGuard`) |
| F2 | `/notificacoes` sem nenhuma guarda de papel — qualquer autenticado abre | `App.tsx:604` | Médio | Pendente de decisão de produto |
| F3 | `/comunicacao` fora do mapa de permissões; autorizado só pela guarda própria | `App.tsx:601`, `RouteGuard.tsx` | Baixo | Pendente |
| F4 | Rotas sem entrada no mapa caem na permissão de `/`: `/parceiros/:id`, `/etiquetas/:id/imprimir`, `/comercial/auditoria-motor-b2b` — esta última libera financeiro/administrativo e bloqueia gestor comercial | `permissions.ts` (ausência), `App.tsx:499,518,576` | Médio | Pendente |
| F5 | `/portal` declara apenas produtor, mas a guarda também admite administrador; `PortalLayout` ainda cita `gestor`, que nunca chega ali | `permissions.ts:199`, `App.tsx:300`, `PortalLayout.tsx:89` | Baixo | Pendente |
| F6 | `/portal-parceiro/*` tem guarda grossa (acesso B2B) + regras finas escritas à mão no layout, que contradizem o mapa (ex.: técnico com permissão declarada em "meus produtores" mas redirecionado) | `B2BRouteGuard`, `PortalParceiroLayout.tsx:77-117` | Médio | Pendente de decisão de produto |
| F7 | Quatro resolvedores de home diferentes, com ordens de prioridade duplicadas e divergentes | `permissions.ts`, `portalContext.ts`, `safeHome.ts`, `portalRoleContext.ts` | Médio | Pendente |
| F8 | Produtor tem home declarada `/portal` mas é enviado para `/app` no login | `App.tsx:347` | Baixo | Pendente (parece intencional, não documentado) |

## 3. Segurança do backend (análise estática — requer confirmação no banco real)

| # | Achado | Evidência | Gravidade |
| --- | --- | --- | --- |
| B1 | `accounts_payable` com política `FOR ALL TO authenticated USING (true)`, sem `WITH CHECK`: qualquer autenticado leria/gravaria contas a pagar. Nenhuma remoção posterior encontrada | `20260812135640_...sql:56-57` | **Crítica** |
| B2 | Cinco tabelas criadas com permissão para autenticados e **sem RLS nem políticas**: `cliente_campos_extras`, `esteira_producao_v2`, `produto_anexos`, `evidencias`, `portal_notifications` | lote `20260812134xxx`/`135012` | **Crítica** |
| B3 | Duas views e RPCs de rastreio concedidas a `anon` (`vw_esteira_laboratorio`, `vw_fluxo_visita_tecnica`) | migrations correlatas | Alta (confirmar se é intencional para rastreio público) |
| B4 | ~30 funções `SECURITY DEFINER` sem `SET search_path` fixo, concentradas no lote de restauração de 12/08 | vários | Alta |
| B5 | `has_role` provavelmente sem `REVOKE` de `PUBLIC`: permitiria enumerar papéis de terceiros (não escala privilégio) | `20260812134101_...sql:15-28` | Média |
| B6 | `sync-clima` usa chave de serviço e aceita qualquer `fazenda_id` sem checar vínculo do usuário | `supabase/functions/sync-clima/index.ts` | Alta |
| B7 | Trigger de novo usuário atribui papel `administrativo` por padrão a todo cadastro | `handle_new_user` | Alta se o cadastro público estiver aberto |
| B8 | Harnesses de homologação publicados (`*-runtime-harness`) protegidos só por segredo interno | `supabase/functions/*harness*` | Média |
| B9 | Ciclos repetidos de criação/remoção de políticas em `clientes` (6+) — risco de regressão silenciosa | histórico de migrations | Média |

**Pontos positivos confirmados:** `user_roles` e `partner_users` só aceitam escrita via
funções com verificação de papel (`has_role` de administrador/gestor comercial);
`get_my_available_portal_contexts` e `set_my_context_preference` têm `search_path` fixo,
usam o usuário da sessão e revogam execução de `anon`/`PUBLIC`; nenhuma rota de
auto-escalonamento de papel foi encontrada.

## 4. Correções aplicadas nesta rodada

- `src/components/AppSidebar.tsx`: visibilidade do menu passa a usar o papel efetivo por
  contexto ativo (mesma fonte do `RoleGuard`), corrigindo itens ocultos para usuários
  multipapel; `allowedRoles` passa a considerar todos os papéis do usuário.

Nada de banco, migration, Edge Function, publicação ou GitHub foi alterado.

## 5. Bloqueio e pendências

**Bloqueio:** neste ambiente só existem credenciais dos projetos proibidos
(`yzszlzjpovmcteuxjznj`, `ikaauvsflpmamgxmkhoq`). Não há chave de serviço nem DSN do
CultivoFarm autorizado (`swzpzcwiasxmjutrmvkm`), então não foi possível criar os usuários
de teste, entrar nos portais nem consultar políticas reais. Também foi removido novamente
um arquivo de configuração apontando para banco não autorizado.

Para concluir são necessários, no ambiente autorizado: senha de usuários de teste (ou
permissão para criá-los) e acesso somente-leitura ao banco para conferir políticas,
permissões e funções.

Pendências abertas: B1–B9 (correção de banco, fora do escopo autorizado), F2–F8 (decisões
de produto), navegação real por perfil e relatório de estado do catálogo.

## Navegação real com conta administradora (16/09/2026)

Login efetuado na prévia com a conta administradora informada pelo proprietário
(credenciais não registradas aqui). Destino após o login: `/dashboard/geral`.

| Rota | Resultado |
| --- | --- |
| /dashboard/geral, /configuracoes, /auditoria, /financeiro | abrem normalmente |
| /portal | abre o Portal do Produtor (bypass de admin confirmado) |
| /portal-parceiro | redireciona para /portal-parceiro/dashboard, abre |
| /app | abre o app de campo (papel exibido: Consultor Técnico) |
| /comunicacao | redireciona para /dashboard/geral (módulo desativado por flag) |
| /notificacoes | **falhava** com "Erro de Renderização" (realtime) — corrigido |

Correção aplicada: `src/hooks/useNotificacoesUnificadas.ts` criava canais de tempo
real com nome fixo; ao remontar, o canal já inscrito recebia novos callbacks e o
Supabase lançava erro, derrubando a página. Agora cada montagem usa um canal
próprio. Reteste na prévia: a tela abre e reabre sem erro.

Pendências observadas na navegação:
- Cabeçalho ainda exibe "AR Bio / On-Farm Manager" (nome vem da configuração do
  sistema no banco; ajuste depende de autorização de escrita).
- Demais achados de backend deste documento permanecem em aberto.
