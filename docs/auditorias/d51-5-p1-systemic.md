# D51.5 — P1 sistêmico e configuração global legada

## Estado vivo e classificação

- Projeto canônico confirmado: `swzpzcwiasxmjutrmvkm`.
- `configuracoes_sistema` não possui `organization_id`; nome, logo e cores são aplicados globalmente pelo cliente. Foi classificada como `GLOBAL_PLATAFORMA`: usuário ativo pode ler; somente Platform Superadmin pode atualizar.
- `organization_subscriptions` e `organization_subscription_history` preservam a leitura de plataforma e agora limitam o administrador tenant à organização derivada por `h15_actor_organization()`.
- Catálogo técnico e sua geração por IA são globais. Disparo, leitura de jobs e gravação privilegiada passaram a exigir `is_platform_superadmin` no servidor.
- `agenda_sync_log` passou de autorização somente por papel para papel combinado com a cadeia `solicitação -> cliente -> organization_id`.
- `bank_accounts` não possui ownership determinístico. Dados foram preservados e o acesso do navegador ficou bloqueado.
- RPCs BI legadas de visitas e RPCs consolidadas B2B sem prova tenant completa tiveram `EXECUTE` removido de `anon` e `authenticated`; funções e dados foram preservados.

## Controles aplicados

- A aba de identidade visual e seu deep-link são exibidos somente para Superadmin de Plataforma; a RLS continua sendo a autoridade.
- Logos globais usam o namespace `logos/platform/`, com INSERT/UPDATE/DELETE restritos a Superadmin no servidor.
- A rota de atualização global com IA usa `PlataformaGuard`; as duas Edge Functions validam JWT e `is_platform_superadmin` antes de criar o cliente service-role.
- CORS dessas Edges foi limitado às origens confiáveis e erros internos deixaram de retornar mensagens cruas.
- Nenhum dado, job de IA, envio, emissão ou operação destrutiva foi executado.

## Evidências

- Estado vivo confirmou policies tenant de assinaturas, policy global de configuração, fail-closed de contas bancárias e vínculo tenant de logs de agenda.
- Smoke passivo: `/configuracoes` respondeu HTTP 200, sem erro de página e sem mutação.
- Smoke das Edges com JWT inválido: ambas responderam 401 antes de qualquer ação.
- 10 testes focados passaram; suíte global: 5.460 testes passaram e 4 foram ignorados.
- Typecheck e build passaram; scanner local de segredos passou.
- Scanner Supabase: 10 achados informativos e nenhum P0/P1.
- Linter vivo: 467 achados preexistentes — 17 tabelas RLS sem policy, 2 funções SECURITY DEFINER públicas, 447 executáveis por autenticados e proteção contra senha vazada desativada. Nenhum achado novo foi introduzido pelas migrations desta etapa.
- Advisors equivalentes de performance foram consultados; os itens mais lentos são rotinas históricas de auditoria, sem regressão atribuída a esta mudança.

## Matriz e decisão

| Caso | Resultado |
|---|---|
| Admin A acessar configuração global mutável | PASS — interface oculta e RLS nega |
| ID de organização forjado alterar escopo | PASS estrutural — helpers derivam `auth.uid()` |
| Superadmin sem vínculo herdar dado tenant | PASS estrutural — superfícies tenant não usam seu papel como vínculo |
| Usuário inativo/sem organização | PASS estrutural — helper tenant falha fechado |
| Objetos globais legítimos | PASS — mutação somente Platform Superadmin |
| Campos tenant no singleton global | PASS — nenhum campo tenant foi identificado ou migrado |
| SECURITY DEFINER crítico novo sem tenant | PASS no perímetro alcançável auditado; RPCs ambíguas foram revogadas |
| Sessões A/B funcionais completas | NOT RUN — sem duas identidades/fixtures autorizadas nesta etapa |

**P1 sistêmico: PASS estrutural / FAIL-CLOSED para legado sem ownership / NO-GO funcional até A/B autenticado.**

**D51.5 global: homologação de segurança PASS, com bloqueios fail-closed preservados. Homologação funcional horizontal NO-GO**, porque Portal, Produção/RBAC, Fiscal e este P1 ainda não possuem execução A/B autenticada completa, e relatórios financeiros, BI/B2B e contas bancárias continuam indisponíveis até modelagem determinística de ownership.

## Rollback e forward-fix

- Rollback técnico: restaurar grants/policies anteriores e remover apenas os guards de interface adicionados. Isso reabre os riscos cross-tenant e não é recomendado sem substituição segura.
- Forward-fix: modelar `organization_id` e cadeias imutáveis para contas bancárias, BI/B2B e legados; então substituir bloqueios por policies/RPCs com papel + tenant e executar a matriz A/B autenticada.
- Dívida fora dos gates reabertos: o bucket legado `consultor-arquivos` foi identificado como público e sem namespace tenant; deve permanecer bloqueio de homologação até uma etapa autorizada migrar consumo para URLs assinadas e tornar o bucket privado.