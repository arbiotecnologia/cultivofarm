# Auditoria de planos, administradores e usuários — 2026-10-07

## Decisão e limites

**NO-GO funcional; PASS estrutural focal.** Não houve sessão Auth real nesta rodada (`external_unmanaged`, sessão não disponibilizada). Nenhuma mutação de banco, fixture, migration, implantação Edge ou publicação frontend foi executada. Produção canônica: `swzpzcwiasxmjutrmvkm`, confirmada na configuração local. Preços, versões, assinaturas, cobrança, SMTP/Auth, fiscal e dados reais preservados.

SHA observado após alterações de código/testes: `550a151775010339bfa4a75107fe85d7bf486226`. É a revisão observada antes desta consolidação documental, não um commit final criado manualmente.

### Fechamento solicitado — 19:22 UTC

Entrega encerrada sem reiniciar ou ampliar a auditoria. Revisão observada no início do fechamento: `980b09d676b8c2002c68f9fbd6fb1fb2ea8b1031`, com árvore limpa. A suíte já terminou: 5.804 PASS e 4 skipped; não havia teste em andamento a concluir. `git diff --check` passou. O log automático de build não estava disponível neste novo contexto; mantém-se a evidência anterior registrada, sem alegar novo build. Typecheck separado continua não executado. Nenhuma correção adicional de código foi aplicada; o candidato Edge permanece somente diff para revisão. Alterados neste fechamento apenas este relatório e roadmap. **PASS estrutural focal / NO-GO funcional** preservados; gates autenticados e teste do diff dependem de execução autorizada externa, não ficam implicitamente em andamento.

## Baseline: proveniência separada

O proprietário forneceu os seguintes resultados vivos: Refil Base v1 ACTIVE; Homologação Essencial v1 TRIAL ativo; AR Bio Gestão v1 TRIAL ativo; CultivoFarm Completo v1 ACTIVE e FSF Completo v1 TRIAL ativo. Informou matriz PostgreSQL 40/40 com rollback, hashes de snapshots, isolamento de seis classes de dados, quatro administradores e fixture Base/admin revertida sem resíduos. **Essas provas não foram reexecutadas nesta rodada e não equivalem a browser autenticado.**

Consulta MCP somente leitura confirmou os conjuntos das versões publicadas v1 e as contagens abaixo; também retornou Base v2 com o mesmo conjunto. Não houve troca de versão nem inferência de assinatura a partir disso. As ligações correntes empresa/assinatura foram adotadas do baseline do proprietário, não recertificadas por nova mutação.

| Snapshot v1 | Recursos | Hash MD5 do conjunto consultado |
|---|---:|---|
| Base | 3 | `ad8d1acfb6f6da833511093dbf95f989` |
| Essencial | 8 | `d1b1772f9c43ceec9230fc42bec6b3dc` |
| Gestão | 10 | `658255a26901c9a5db91c151198f6039` |
| Completo | 17 | `bffbd1d6a69ceddda3f7d34c4a6a5022` |

O hash acima identifica o conjunto consultado; não representa comprovação nova de igualdade de cada assinatura ao snapshot.

### As 17 feature keys reais

| Feature | Base | Essencial | Gestão | Completo |
|---|---|---|---|---|
| fichas_tecnicas | sim | sim | sim | sim |
| recomendacoes_alertas | sim | sim | sim | sim |
| visitas_tecnicas | sim | sim | sim | sim |
| contas_pagar | não | sim | sim | sim |
| contas_receber | não | sim | sim | sim |
| fluxo_caixa | não | sim | sim | sim |
| paineis_executivos | não | sim | sim | sim |
| relatorios_operacionais | não | sim | sim | sim |
| envios_automaticos | não | não | sim | sim |
| emissao_nfe_nfse | não | não | sim | sim |
| catalogo_precos | não | não | não | sim |
| pedidos_b2b | não | não | não | sim |
| simulacoes | não | não | não | sim |
| envase | não | não | não | sim |
| estoque_embalagens | não | não | não | sim |
| lotes_qualidade | não | não | não | sim |
| ordens_producao | não | não | não | sim |

## Fluxo completo e autoridade

1. `Configuracoes.tsx`: listagem paginada por `tenant_admin_list_users`; cache inclui organização e identidade. Edição e status usam RPCs tenant, não escrita direta em profiles.
2. `create-user`: valida bearer via Auth, exige administrador e perfil ativo com organização. `organization_id` do payload não participa da derivação; organização vem do perfil do ator.
3. Auth Admin cria o usuário; provisionamento associa `profiles.organization_id` e insere papéis em `user_roles`. Papéis não são armazenados como autorização em metadados ou profiles.
4. UI e Edge coincidem em dez papéis: administrador, gestor, consultor_tecnico, aplicador, operador_onfarm, tecnico_agronomo, producao, administrativo, financeiro e gestor_comercial. `superadmin` e papéis fora da allowlist são negados. Produtor/parceiros não são oferecidos nesta UI: pertencem aos fluxos vinculados separados; esta Edge falha fechado com `tenant_link_scope_unavailable`.
5. Login carrega identidade/perfil/papéis. `get_my_entitlement_context` resolve estado server-side; somente active/trial_active carregam `get_my_entitlements`. O plano não bloqueia a criação de um papel legítimo nem aumenta seu RBAC.
6. `RoleGuard` verifica perfil antes do gate de plano. Sidebar usa `resolveEffectiveRouteRole`, feature flag, `isPathEntitled` e allowedRoles. Mobile usa o gate do plano; portais têm seus próprios vínculos/guards. Menu não autoriza leitura de dados: RPC/RLS permanecem soberanos.

As definições remotas consultadas de listagem, edição e status usam organização derivada do ator e bloqueio de superadmin. Isso é evidência de definição/ACL, não execução com sessão real nesta rodada.

## Defeitos e correções focais

### 1. Diagnósticos de assinatura agrupados — corrigido localmente

Causa: `useEntitlements` colapsava no_context em no_subscription e blocked_status/trial_expired em blocked. Agora preserva os valores distintos e `ForaDoPlano` apresenta diagnóstico específico, sem liberar qualquer recurso. Loading, erro, ausência de contexto/assinatura, legado, bloqueio e trial expirado continuam fail-closed.

### 2. Autorização create-user sem contexto JWT do ator — diff de revisão, não aplicado

A Edge chama `has_role` com cliente service-role, apesar de já possuir um cliente com o bearer validado. A definição canônica do guard privado depende do contexto do ator e do fencing de credencial/iat; conferir papel pelo cliente elevado não prova esse contexto. A revisão candidata troca a consulta pelo cliente do ator e nega também erro da RPC. **Exploit e rejeição real de JWT antigo não foram executados.**

### 3. Exceção inesperada após criação Auth — diff de revisão, não aplicado

Já existe compensação explícita para erro de profile/roles. O catch global não a executa se uma exceção ocorrer após Auth. O diff candidato registra compensador, limpa após sucesso e tenta compensação no catch, retornando mensagem genérica. Exclusão compensatória continua best-effort: falha de rede na exclusão ainda pode deixar órfão; não há garantia distribuída transacional certificada.

Arquivo entregue: `docs/auditorias/create-user-revisao-local-2026-10-07.diff`. A fonte Edge permanece intacta para impedir implantação automática não autorizada. O diff **não foi executado nem certificado em Deno/Auth**, exige revisão e teste isolado antes de aplicação. SDK não fixado e CORS genérico preexistentes foram observados; não alterados por inferência nesta rodada.

## Matriz automatizada 4 × 10

| Papel | Base | Essencial | Gestão | Completo |
|---|---|---|---|---|
| administrador | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| gestor | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| consultor_tecnico | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| aplicador | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| operador_onfarm | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| tecnico_agronomo | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| producao | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| administrativo | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| financeiro | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |
| gestor_comercial | PASS estrutural | PASS estrutural | PASS estrutural | PASS estrutural |

O teste usa o inventário canônico `auditoria-rotas-inventario-2026-10-07.json`, sem segundo registro runtime. Cruza rotas com feature, ACCESS_MAP/effective role, mapa de plano, flags/allowedRoles e menus existentes. Verifica a precedência SemPermissao antes de ForaDoPlano. Não monta 40 sessões reais nem prova carregamento de dados por esses papéis. Contratos textuais verificam uso dos gates em desktop/mobile/URL e chaves/invalidação de usuários; não equivalem a interação autenticada.

### Cache e credenciais

- Alteração de assinatura invalida os quatro caches focais: subscriptions, history, entitlements e entitlement-context. Correção anterior de timeout/reconciliação/idempotência preservada.
- Criação/edição/status invalidam admin-users; query é segregada por organização e identidade.
- Logout explícito e troca de identidade limpam cache; eventos de papel recarregam contexto/perfil.
- Entitlements têm staleTime de cinco minutos; mudanças feitas fora desta sessão não têm comprovação de atualização imediata em todas as abas.
- JWT com iat anterior a alteração de credencial: guard server-side inspecionado; bloqueio real na Edge atual/candidata e comportamento browser permanecem BLOCKED.

## Evidências e validação

| Verificação | Resultado | Limite |
|---|---|---|
| Snapshots publicados MCP read-only | PASS | conjuntos e contagens; não reexecuta provas fornecidas |
| Banco/RLS 40/40 e administradores | PASS informado pelo proprietário | não reexecutado; sem JWT simulado nesta rodada |
| Matriz/testes novos | PASS 44/44 | estrutural e renderização isolada de mensagens |
| SaaS/usuários/config/RBAC/contexto | PASS 753/753, 68 arquivos | mocks/contratos, não Auth real |
| Suíte completa | PASS 5.804; 4 skipped, 398 arquivos PASS/1 skipped | execução 19:11–19:16 UTC |
| ESLint focal | PASS | arquivos frontend/testes alterados |
| Scanners segredos/integração fiscal | PASS | scanners existentes; não provam todas as ameaças |
| Build automático | PASS 19:17:02 UTC | build manual não executado; typecheck separado não executado |
| Scanner Supabase | 10 INFO | baseline, sem correção global de RLS/Auth |
| Advisor segurança | 461 achados históricos | 17 RLS sem policy, 2 DEFINER anon, 441 DEFINER authenticated, 1 proteção de senha; não certifica ausência de risco |
| Browser público | PASS redirecionamento /configuracoes → /auth | sem sessão; desktop 1280×1800 e mobile 390×844, sem overflow no login |
| Browser autenticado/menu/dados/RLS/JWT antigo | BLOCKED | external_unmanaged, sessão ausente |
| Diff Edge compensação/fencing executado | BLOCKED | revisão não aplicada nem implantada |

Capturas públicas após aguardar carregamento confirmaram login; primeira captura precoce estava em branco, portanto não foi usada como PASS. Logo não carregou nas capturas do login: observado, sem prova de regressão causada pelas alterações focais; não corrigido fora de escopo. Responsividade das áreas autenticadas não foi certificada.

## Arquivos, rollback e pendências

Alterados nesta auditoria: `src/lib/saas/featureRouteMap.ts`, `src/hooks/useEntitlements.ts`, `src/components/guards/ForaDoPlano.tsx`, `src/test/saas/useEntitlements.test.tsx`.

Criados: `src/test/saas/plan-admin-user-matrix.test.tsx`, diff candidato create-user e este relatório. `roadmap.md` consolidado. Nenhuma migration/Edge remota; não houve novos resíduos porque nenhuma fixture ou escrita remota foi criada nesta rodada. O zero-resíduo do baseline é evidência fornecida pelo proprietário, não nova varredura integral.

Rollback local: reverter somente os hunks de diagnóstico e testes desta auditoria, remover diff candidato se rejeitado; nenhuma restauração de banco necessária. Inventário canônico e correções anteriores de assinatura permanecem intactos.

Gate humano mínimo: evidência sanitizada em navegador real do proprietário com administrador e usuários de teste já existentes, nos quatro planos; verificar menu/URL/dados, bloqueios por perfil/plano, logout/login, atualização entre abas e JWT antigo. Não compartilhar tokens/senhas. Revisar e testar o diff Edge em executor isolado antes de qualquer implantação autorizada. Até esses gates, **NO-GO funcional**, sem alegação de 100%.