# Auditoria de planos, administradores e usuários — 2026-10-07

## Decisão e limites

**PASS banco/RLS independente; PASS estrutural frontend e Edge local; deploy efetivo confirmado independentemente; PASS smoke público pós-deploy. NO-GO integral restrito à prova browser autenticada das oito identidades.** A pendência de implantação remota está encerrada conforme evidência independente do executor registrada abaixo; não equivale a prova autenticada da Edge. Idempotência distribuída permanece melhoria futura, não implementada nem certificada. Os registros históricos de “sem deploy” descrevem suas respectivas rodadas e são superados, quanto ao estado atual de implantação, pelo registro pós-deploy. Nesta rodada não houve login, mutação de banco, fixture, migration, implantação Edge ou publicação frontend por este agente. Produção canônica: `swzpzcwiasxmjutrmvkm`. Preços, versões, assinaturas, cobrança, SMTP/Auth, fiscal e dados reais preservados.

SHA observado após alterações de código/testes: `550a151775010339bfa4a75107fe85d7bf486226`. É a revisão observada antes desta consolidação documental, não um commit final criado manualmente.

### Fechamento anterior — 19:22 UTC (superado pela autorização de 19:23)

Entrega encerrada sem reiniciar ou ampliar a auditoria. Revisão observada no início do fechamento: `980b09d676b8c2002c68f9fbd6fb1fb2ea8b1031`, com árvore limpa. A suíte já terminou: 5.804 PASS e 4 skipped; não havia teste em andamento a concluir. `git diff --check` passou. O log automático de build não estava disponível neste novo contexto; mantém-se a evidência anterior registrada, sem alegar novo build. Typecheck separado continua não executado. Nenhuma correção adicional de código foi aplicada; o candidato Edge permanece somente diff para revisão. Alterados neste fechamento apenas este relatório e roadmap. **PASS estrutural focal / NO-GO funcional** preservados; gates autenticados e teste do diff dependem de execução autorizada externa, não ficam implicitamente em andamento.

## Baseline: proveniência separada

## Registro pós-deploy — 2026-10-07, solicitação 19:57 UTC

### Implantação efetiva: evidência independente do executor

- Commit publicado: `2a23d2f952321f1ad962a60be736c31b04fc0d45`; `git rev-parse HEAD` local confirmou a mesma revisão antes das alterações documentais, com árvore limpa.
- Frontend enviado a `https://cultivofarm.lovable.app`; deployment_id `4e27d947-1501-4feb-9a3a-3045dc71d404`.
- Supabase canônico `swzpzcwiasxmjutrmvkm`: `create-user` ACTIVE, versão 62, `verify_jwt=true`, hash remoto `93fee9bafa07af0970336b13393fd03ea53e4521490ba1dc7ee0ba9e57742fac`.
- Leitura remota independente confirmou `create_user_auth_failed` e `user_creation_failed`, sem retorno JSON de `createError.message`. Este agente não repetiu a leitura Supabase nem invocou a Edge; a proveniência é a execução independente confirmada pelo proprietário, não o smoke público.

### Smoke público executado por este agente

Chromium novo, sem cookies/sessão, sem preenchimento ou envio de login; navegação exclusivamente ao frontend publicado.

| Verificação | Resultado observado | Limite |
|---|---|---|
| `/`, desktop 1280×1800 | PASS: HTTP inicial 200, destino `/auth`, botão Entrar visível | não prova identidade, plano ou build ID remoto |
| `/configuracoes`, desktop 1280×1800 | PASS: HTTP inicial 200, destino `/auth` | guard de visitante, não autorização autenticada |
| `/plataforma`, desktop 1280×1800 | PASS: HTTP inicial 200, destino `/auth` | não prova Platform Superadmin |
| `/configuracoes`, mobile 390×844 | PASS: destino `/auth`, formulário visível, sem overflow horizontal | somente login público |
| Erros JavaScript não tratados | PASS: zero eventos `pageerror` nas navegações | não certifica console/rede inteira nem áreas autenticadas |
| Oito identidades dos quatro planos | BLOCKED / NO-GO integral | nenhuma autenticação realizada; segue roteiro abaixo |

Capturas desktop e mobile inspecionadas em `/tmp/browser/postdeploy-1957/desktop-plataforma.png` e `mobile-configuracoes.png`; script e demais capturas no mesmo diretório temporário. Login renderizado nas capturas, com área superior sem marca visível, observação pública já registrada anteriormente; nenhuma correção funcional ou atribuição causal nesta rodada. Nenhuma informação privada apareceu no smoke.

**Pendências atuais desta auditoria:** somente (1) prova browser autenticada de administrador e usuário existente por plano — Refil Base 3, Homologação Essencial 8, AR Bio Gestão 10, CultivoFarm ou FSF Completo 17 — incluindo contratos remotos autenticados aplicáveis do roteiro; (2) eventual contrato/chave server-side para idempotência distribuída futura. Implantação frontend/Edge não é mais pendência. Unicidade e-mail/Auth e lock local não são idempotência distribuída; compensação best-effort permanece limite conhecido, não certificação transacional.

Alterados nesta rodada somente este relatório e `roadmap.md`; nenhuma alteração funcional, dado, Edge, migration ou nova publicação. Testes/lint/scanners não repetidos porque o escopo é documental e smoke público; resultados locais anteriores permanecem históricos, sem alegação de nova execução. `git diff --check`: PASS após a atualização documental. Build automático observado: `build OK` em 2026-10-07T19:59:31Z; nenhum build manual e nenhuma nova publicação executados.

### Baseline histórico

O proprietário forneceu os seguintes resultados vivos: Refil Base v1 ACTIVE; Homologação Essencial v1 TRIAL ativo; AR Bio Gestão v1 TRIAL ativo; CultivoFarm Completo v1 ACTIVE e FSF Completo v1 TRIAL ativo. O executor Supabase do proprietário executou independentemente nesta auditoria a matriz transacional pg_temp 4 planos × 10 papéis (40 cenários), com rollback confirmado: contagens 3/8/10/17, contextos active/trial_active e zero falhas de hash. Zero leaks por organization_id em profiles, organizations, subscriptions, clientes, lotes e ordens_servico; admin próprio vê exatamente 1 assinatura e não-admin vê 0 diretamente. Administradores reais AR, CultivoFarm, FSF e Homologação passaram com claims sub/role/iat: entitlements 10/17/17/8, tenant_admin_list_users somente na organização própria e foreign 0. Fixture Auth inativa foi restaurada a organization_id null, ativo false e papel aplicador, sem resíduos. **PASS banco/RLS: execução independente nesta auditoria, não mera informação de baseline; não equivale a browser autenticado E2E. Este agente não reexecutou essas provas.**

Consulta MCP somente leitura confirmou os conjuntos das versões publicadas v1 e as contagens abaixo; também retornou Base v2 com o mesmo conjunto. Não houve troca de versão nem inferência de assinatura a partir disso. As ligações correntes empresa/assinatura foram adotadas do baseline do proprietário, não recertificadas por nova mutação.

| Snapshot v1 | Recursos | Hash real do snapshot na prova independente |
|---|---:|---|
| Base | 3 | `be7745ca62c49f5bee533a7d10b65a69` |
| Essencial | 8 | `490b1aafda4ce2c79d531b6b15d090e7` |
| Gestão | 10 | `c6cca8f509d68f0f60b1c728ebf27033` |
| Completo | 17 | `c5f2f7b80892ab1620043fd0c8be4bc9` |

Hashes corrigidos conforme a prova independente do executor Supabase do proprietário; não confundir com os hashes de conjunto da consulta MCP anterior. Zero falhas de igualdade na prova independente.

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

### 2. Autorização create-user sem contexto JWT do ator — corrigido localmente, sem deploy

Antes da correção, a Edge chamava `has_role` com cliente service-role, apesar de já possuir um cliente com o bearer validado. A definição canônica do guard privado depende do contexto do ator e do fencing de credencial/iat; conferir papel pelo cliente elevado não prova esse contexto. O diff aprovado foi aplicado: consulta pelo anonClient com bearer do ator, negando também authorizationError. Testes isolados confirmam false/erro/fencing mockado negados antes de createUser. **Exploit e rejeição real de JWT antigo não foram executados.**

### 3. Exceção inesperada após criação Auth — corrigido localmente, sem deploy

Já existe compensação explícita para erro de profile/roles. O catch global anterior não a executava se uma exceção ocorresse após Auth. Agora registra compensador, libera após conclusão de profile + roles (ou compensação bem-sucedida), tenta compensação no catch e retorna user_creation_failed genérico. Logs de falha usam somente evento fixo, sem código/mensagem potencialmente sensível. Exclusão compensatória continua best-effort: falha de rede na exclusão ainda pode deixar órfão; não há garantia distribuída transacional certificada.

Arquivo entregue: `docs/auditorias/create-user-revisao-local-2026-10-07.diff`. A fonte Edge foi alterada localmente conforme autorização de 19:23 UTC, sem chamada de deploy. Deno check PASS e testes isolados do handler PASS; nenhuma certificação remota/Auth da Edge alterada é alegada. SDK não fixado e CORS genérico preexistentes foram observados; não alterados por inferência nesta rodada.

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
| Snapshots publicados MCP read-only | PASS | conjuntos e contagens; execução distinta das provas independentes banco/RLS |
| Banco/RLS 40/40 e administradores | PASS execução independente nesta auditoria pelo executor Supabase do proprietário | pg_temp/rollback, claims reais de administradores; não browser E2E |
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
| Edge local compensação/fencing | PASS 17/17 mocks do handler + Deno check | sem rede; fencing mockado, não Auth real da Edge remota |
| Edge remota após correção | BLOCKED / NO-GO | sem deploy autorizado |

Capturas públicas após aguardar carregamento confirmaram login; primeira captura precoce estava em branco, portanto não foi usada como PASS. Logo não carregou nas capturas do login: observado, sem prova de regressão causada pelas alterações focais; não corrigido fora de escopo. Responsividade das áreas autenticadas não foi certificada.

## Arquivos, rollback e pendências

Alterados nesta auditoria: `src/lib/saas/featureRouteMap.ts`, `src/hooks/useEntitlements.ts`, `src/components/guards/ForaDoPlano.tsx`, `src/test/saas/useEntitlements.test.tsx`.

Criados: `src/test/saas/plan-admin-user-matrix.test.tsx`, diff candidato create-user e este relatório. `roadmap.md` consolidado. Nenhuma migration/Edge remota; não houve novos resíduos porque nenhuma fixture ou escrita remota foi criada nesta rodada. Zero-resíduo/restauração são provas executadas pelo executor independente nesta auditoria; este agente não fez nova varredura integral.

Rollback local: reverter os hunks locais da Edge/diagnóstico e testes desta auditoria se necessário; nenhuma restauração de banco necessária. Inventário canônico e correções anteriores de assinatura permanecem intactos.

Gate humano mínimo: evidência sanitizada em navegador real do proprietário com administrador e usuários de teste já existentes, nos quatro planos; verificar menu/URL/dados, bloqueios por perfil/plano, logout/login, atualização entre abas e JWT antigo. Não compartilhar tokens/senhas. Testes isolados da Edge concluídos; implantação e certificação remota dependem de autorização posterior. **PASS banco/RLS e PASS estrutural frontend; NO-GO apenas browser autenticado E2E e Edge remota**, sem alegação de 100%.
## Fechamento corretivo — 19:23 UTC

Aplicado diff aprovado em `supabase/functions/create-user/index.ts` e adicionado `src/test/security/create-user-edge-handler.test.ts`: 17 cenários executam o handler real transpilado com SDK/Deno mockados, sem rede. Cobrem admin, JWT inválido/antigo mockado, erro/false has_role, tenant forjado, papéis reservados/desconhecidos, vínculos fail-closed, compensação profile/roles/exceção, sucesso e falha do compensador com resposta/log sanitizados. Deno check PASS; testes focais Edge/matriz/tenant 69/69; suíte pertinente 770/770 em 69 arquivos; ESLint focal, scanners segredos/fiscal e diff-check PASS. Suíte completa anterior 5.804 PASS/4 skipped preservada, não reexecutada. Typecheck frontend separado não executado (validação automática); nenhum build manual. Compensação continua best-effort em falha de rede/interrupção do processo. Nenhuma migration, escrita remota, publicação ou deploy manual. O diff arquivado continua como evidência da revisão aprovada, com sanitização adicional do log na fonte local.

Build automático verificado: OK às 19:26:35 UTC. Deno check fornece validação de tipos da Edge; typecheck frontend separado não foi executado.

## Revalidação solicitada — 19:30 UTC

O fechamento já estava aplicado na revisão `a27652387ae58531b0a9488ee0cf5980190da445`; não foi reaplicado nem duplicado. Reexecução local: 69 arquivos / 770 testes PASS (inclui Edge 17, matriz 44 e tenant 8), Deno check PASS, ESLint focal PASS, scanners segredos/integração fiscal PASS e diff-check PASS. O teste de JWT antigo usa resposta mockada de has_role, não certifica fencing remoto. Log do compensador permanece deliberadamente sanitizado (evento fixo, sem error.code), como documentado no fechamento anterior.

Nesta revalidação, o log automático inicialmente estava ausente; depois confirmou build OK às 19:32:00 UTC. Typecheck frontend separado e build manual não executados: validação do frontend é gerenciada automaticamente pelo ambiente. Nenhuma alteração adicional na Edge/testes, nenhuma operação Supabase, migration, publicação ou deploy. PASS banco/RLS independente e PASS estrutural preservados; NO-GO restrito ao browser autenticado E2E e à Edge remota até deploy autorizado. Compensação Auth permanece best-effort em indisponibilidade/interrupção.

## Continuação autenticada solicitada — 19:34 UTC

Comparação com `a27652387ae58531b0a9488ee0cf5980190da445`: fonte `create-user/index.ts` e seus testes permanecem idênticos. Primeiro teste executado: 17/17 PASS. Nenhuma publicação Edge ou frontend, migration, criação de usuário, alteração de sessão, assinatura, feature ou dado real nesta rodada. Alterados somente este relatório e `roadmap.md`.

### Execução disponível e limites

| Verificação | Resultado desta rodada | Evidência / limite |
|---|---|---|
| Correção local bearer/has_role/authorizationError/compensador | PASS | diff com commit-base vazio; 17 testes do handler |
| Admin com sessão atual / iat antigo / tenant forjado / papéis proibidos | PASS isolado | SDK/Deno mockados; iat antigo é resposta false do guard mockado, não fence remoto |
| Falha profile/roles/exceção; sucesso sem compensação; compensador falho | PASS isolado | testes existentes; não removeu usuário real |
| Matriz plano × perfil e testes pertinentes | PASS 770/770, 69 arquivos | matriz 44, Edge 17, tenant 8 incluídos |
| Suíte completa | PASS 5.821; 4 skipped | 399 arquivos PASS / 1 skipped; 19:35:34 UTC, duração 230,65s |
| Deno check / ESLint focal / scanners existentes / diff-check | PASS | sem rede de dados, sem deploy; Deno valida tipos da Edge |
| Typecheck frontend separado | NÃO EXECUTADO | ambiente gerencia validações automáticas; não inferir PASS a partir do build |
| Build automático novo | PASS | log build OK 19:42:10 UTC; nenhum build manual |
| Banco/RLS dos quatro planos | PASS independente preservado | provas anteriores do executor Supabase do proprietário, não reexecutadas nesta rodada |
| Browser autenticado, quatro empresas × duas identidades | BLOCKED | `external_unmanaged`; nenhum cookie/sessão injetado, armazenamento canônico ausente |
| Duplicidade de criação sob concorrência | BLOCKED | UI tem isPending + botão disabled; isso não prova exclusão simultânea nem idempotência da Edge |
| Nenhum erro revela dado sensível na resposta Edge | FAIL estrutural do contrato universal | `create-user/index.ts:167` ainda retorna createError.message bruto; sanitização da UI não protege quem lê a resposta HTTP |

Browser real sem Auth: `/configuracoes` redirecionou a `/auth` no desktop 1280×1800 e mobile 390×844; capturas inspecionadas em `/tmp/browser/plans-1934/desktop.png` e `mobile.png`, somente login. O caminho exploratório `/plataforma/gestao` retornou 404 (`platform.png`); não é evidência de regressão nem de guard autenticado, pois o registro observado é `/plataforma`. Nenhuma captura de login é tratada como prova dos planos. Logo aparece vazio, observação pública preexistente sem atribuição causal.

### Roteiro autenticado preparado — somente leitura

Pré-condições: proprietário/executor externo usa sessões reais existentes no canônico `swzpzcwiasxmjutrmvkm`; um administrador e pelo menos um usuário já criado por esse administrador por empresa, com vínculo de criação comprovado por auditoria existente. Não criar novos usuários nem mudar senha/acesso para obter a prova nesta rodada. Se não existir identidade ou evidência de vínculo, marcar BLOCKED. Não enviar credenciais/tokens ao chat; este executor não consegue injetar sessões de Supabase externo.

| Cenário | Entitlements esperados | Admin | Usuário do admin |
|---|---:|---|---|
| Refil Informática — Base v1 | 3 | BLOCKED browser | BLOCKED browser |
| Homologação CultivoFarm — Essencial v1 | 8 | BLOCKED browser | BLOCKED browser |
| AR Biotecnologia — Gestão v1 | 10 | BLOCKED browser | BLOCKED browser |
| CultivoFarm ou FSF Agroservice — Completo v1 | 17 | BLOCKED browser | BLOCKED browser |

Para cada uma das oito identidades, em desktop e mobile:

1. Confirmar perfil, organização, status active/trial_active e versão via respostas read-only do cliente canônico; comparar feature keys e hashes à matriz deste relatório. Registrar somente identificação mascarada, papel, contagens, códigos e horário.
2. Usar inventário canônico de rotas para selecionar casos: feature e papel permitidos; feature ausente; feature presente mas papel proibido; rota interna; alias; rota inexistente. Confrontar sidebar, atalhos e busca com URL direta. Esperado: acesso = plano ∩ perfil/vínculo, nunca união.
3. Confirmar `useEntitlements`, loading/erro e `ForaDoPlano` sem vazamento/liberação transitória; guard de papel prevalece quando não autorizado. Recarregar e repetir após logout/login, verificando cache segregado por identidade/empresa.
4. Inspecionar botões/ações internas sem executar gravação, emissão, convite, recovery ou criação. Botão oculto não prova autorização backend; operações mutáveis ficam BLOCKED sem ambiente/fixtures autorizados.
5. Usando apenas leituras e sessão própria, aplicar filtros de IDs de outra empresa às consultas canônicas de usuários, assinaturas, clientes, lotes, ordens, financeiro e fiscal. Esperado: vazio/negação, nunca dado estrangeiro. Campos/rotas/features ou perfil falsificados no estado local não podem ampliar acesso; não persistir falsificações nem enviar mutações. `partner_id` e `organization_id` forjados no create-user permanecem provas isoladas até autorização de execução remota.
6. Registrar por caso: identidade mascarada, plano/papel, rota/feature, esperado/observado, status HTTP, contagem estrangeira, captura sem PII e resultado PASS/FAIL/BLOCKED. Não armazenar cabeçalhos bearer/cookies/corpos financeiros/fiscais.

### Riscos e decisão

PASS banco/RLS independente e PASS estrutural da matriz permanecem válidos no escopo comprovado. **NO-GO integral**: faltam oito provas browser autenticadas e Edge remota; há também resposta Auth bruta comprovada e ausência de prova de não duplicidade concorrente. A proteção `isPending` em `Configuracoes.tsx:281,782` é apenas evidência de implementação, não prova funcional de clique duplo. Compensação não é idempotência nem transação distribuída. Sem editar código por inferência nem ampliar escopo; riscos registrados para correção focal autorizada. Gate humano mínimo: execução read-only com as oito identidades existentes no navegador do proprietário e evidências sanitizadas; deploy/testes remotos só após autorização separada. Nenhum GO 100% alegado.

## Correção focal local autorizada — 19:45 UTC

Esta seção substitui os dois bloqueios locais da rodada anterior, sem reclassificar as provas remotas históricas.

- `supabase/functions/create-user/index.ts`: remove retorno de `createError.message`; erro Auth desconhecido retorna somente `{error:"user_creation_failed"}` (HTTP 400). Códigos estruturados `email_exists` e `user_already_exists` são normalizados ao código público `email_exists`, já aceito pelo mapeamento da UI. Nenhuma inferência por texto do provedor. Logs contêm exclusivamente eventos fixos `create_user_auth_failed` / `create_user_email_exists`, sem mensagem, código desconhecido, e-mail, token ou detalhes Auth.
- `src/pages/Configuracoes.tsx`: mesmo handler/mutation existentes; ref exclusivo por formulário adquirido sincronamente antes de qualquer await/render, mantido durante `mutateAsync` e liberado em `finally`, inclusive erro/validação inválida. `isPending` e botão disabled preservados; `onSuccess/onError` continuam responsáveis por caches/formulário/mensagens. Nenhum retry automático.
- `src/test/security/create-user-edge-handler.test.ts`: 20 testes, incluindo erro sensível no código/mensagem/details e logs, e duas formas de e-mail duplicado.
- Novo `src/test/config/criacaoUsuarioReentrada.test.ts`: 5 testes executam o handler real extraído via AST com mutation mockada. Dois envios síncronos e evento adicional enquanto pendente, com `isPending` ainda false, invocam no máximo uma mutation; sucesso e falha liberam o lock para próxima tentativa; validação inválida e isPending cobertos. Não é montagem do browser autenticado nem teste distribuído.
- `AGENTS.md`: regra focal de arquitetura registrada; relatório/roadmap atualizados. Sem migrations, dados, chamadas Supabase, publicação ou deploy manual; autorização/tenant/fencing/compensação não alterados.

| Verificação desta correção | Resultado real |
|---|---|
| Focais Edge + reentrada + validação | PASS 51/51, 3 arquivos, 19:46:52 UTC |
| Suíte pertinente SaaS/tenant/config/RBAC | PASS 778/778, 70 arquivos, 19:47:25 UTC |
| Deno check create-user | PASS |
| ESLint dos testes focais | PASS |
| ESLint Configuracoes completo | FAIL baseline: 18 erros/2 avisos, iguais à revisão `cc72eae7`; 16 no-explicit-any, 1 prefer-const, 1 no-empty, 2 exhaustive-deps. Nenhum finding novo; não suprimidos nem corrigidos fora de escopo |
| Scanners segredos e integração fiscal | PASS |
| Build automático após código | PASS, log 19:46:44 UTC |
| Suíte completa | Não repetida nesta rodada focal; anterior 5.821 PASS/4 skipped preservada |
| Typecheck frontend separado | Não executado; Deno check não substitui frontend e build não implica PASS de typecheck |
| Browser autenticado / Edge remota | BLOCKED, sem sessão e sem deploy autorizado |

**Decisão revisada:** PASS focal local para sanitização Auth e exclusão de reentrada no mesmo formulário; PASS banco/RLS independente e estrutural preservados. **NO-GO integral** permanece para browser autenticado dos quatro planos e Edge remota. A unicidade de e-mail no Auth impede duplicidade persistente da mesma identidade, mas não foi reprovada com concorrência real nesta rodada. O lock da UI não abrange outra aba, outro dispositivo, remount ou retry após ambiguidade e **não é idempotência distribuída**. Retry totalmente convergente exigiria contrato/chave server-side e pode ficar como melhoria futura. Compensação continua best-effort; nenhum GO 100% ou prova Auth real alegado. Logs de comandos desta rodada em `/tmp/create-user-1945-*`; diff-check final registrado no fechamento.
