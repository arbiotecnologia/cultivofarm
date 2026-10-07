## Sincronização local A03/A05 — 2026-10-07 22:33 UTC (estado atual)

- [x] Baseline local confirmado: `903fb41e321d12cebea991864a6c3ecb09864015`. Sem subagentes, escrita remota, execução SQL, fixtures, Auth, migration aplicada, publicação/deploy ou outro módulo.
- [x] Registrar evidência independente Codex: canônico `swzpzcwiasxmjutrmvkm`, ledger `20261007222943`, A05 PASS focal SQL/RLS; A03 contenção ACL PASS, sem afirmar exploração A03. Fixtures transacionais integralmente revertidas.
- [x] Guardar SQL exato já aplicado em `restoration/audit-a03-a05/20261007222943_audit_a03_a05_tenant_containment.sql` e reprodução não executada em `scripts/rbac-audit/a05-transactional-proof.sql`.
- [ ] Sincronizar arquivo em `supabase/migrations/20261007222943_audit_a03_a05_tenant_containment.sql`: BLOCKED pela regra do ambiente que reserva essa pasta à ferramenta de migration; ferramenta não acionada para não reaplicar. Cópia exata preservada em restoration para importação local pelo executor.
- [x] Ajustes locais mínimos: catch unknown em useAuth e normalização Windows em sourceFiles; sem mudar guards/rotas/permissões ou dependências.
- [ ] Verificações próprias e fechamento documental em andamento; resultados Windows e advisors atribuídos ao Codex, não novos resultados deste executor.
- [ ] Browser real por perfil/plano e cobertura completa RPC/Edge/Storage UNVERIFIED; NO-GO integral. Codex controla Chrome do proprietário: domínio oficial /auth com login solicitado; iframe Administrador/Indisponível não comprova identidade server-side.
- [ ] Rollback só com substituto testado: não reconceder RPC nem remover isolamento automaticamente; manter fail-closed e preferir forward-fix. Clientes atuais/partner sem organização não recebem vínculo por inferência. D52 preservado.

## Fixtures autorizadas telas/perfis/planos/empresas — 2026-10-07 21:44 UTC (histórico)

- [x] Registrar autorização expressa e reservar run_id AUDIT-RBAC-20261007-20261007T214515Z; manifesto sanitizado criado antes de qualquer escrita remota.
- [x] Comprovar destino production swzpzcwiasxmjutrmvkm; capturar counts/hashes de organizações/perfis/papéis/assinaturas/histórico.
- [ ] Preflight BLOCKED: flags remotas OFF não verificadas; triggers no-delete/append-only e FKs RESTRICT impedem limpeza física de assinaturas persistentes. Não alterar D52; exige caminho homologado de limpeza ou decisão de retenção.
- [x] Inventariar fluxos canônicos organização/assinatura/admin/Auth/portais; tentativa oficial auth-session --self falhou por backend externo, sem secure handoff/editor_url disponível.
- [ ] Criar quatro tenants/assinaturas/admins/segundo usuário, dez internos e três externos Completo — BLOCKED antes da primeira escrita: sessão Superadmin/Auth Admin segura ausente + gates OFF/cleanup.
- [ ] Priorizar provas A03/A05 com Auth real e alvos descartáveis; interromper ao primeiro P0/P1 confirmado e corrigir com regressão antes de continuar.
- [ ] Executar matriz browser/RLS/RPC/Edge/Storage/cache desktop-mobile por perfil/plano; marcar BLOCKED onde faltar evidência real.
- [x] Manifesto vazio e baseline inicial relido idêntico; zero fixtures/TEMPORARY_AUDIT restantes, cleanup no-op. Documentadas decisões BLOCKED por perfil/plano; preservados D51.6/D52.
- [x] Pertinente 829/829; focal 43/43 (5 novos do manifesto), lint focal/scanners PASS. Typecheck manual NOT RUN; advisors pós-DDL N/A, nenhum DDL. Sem código funcional/publicação/migration/Edge.
- [x] Matriz complementar de 179 rotas gerada com limites estruturais explícitos; diff-check PASS e build automático OK 21:51:19 UTC.

## Auditoria atual telas/perfis/planos/empresas — 2026-10-07 21:41 UTC

- [x] Baseline vivo read-only canônico: Base ACTIVE 3, Essencial TRIAL 8, Gestão TRIAL 10, Completo ACTIVE/TRIAL 17; zero overrides e zero TRIAL expirado. Sem reabrir D52 ou alterar dados.
- [x] Inventário revalidado: 179 declarações/178 paths/190 Route, 106 menus, 191 pages; 14 papéis (5 tipos presentes), 38 prefixos/17 features. Matriz integral no relatório auditoria-telas-perfis-planos-empresas-2026-10-07.md.
- [x] Auditados guards/interseção, aliases, cache/identidade e amostra RLS/Storage/ACL/corpos remotos; 10 buckets privados + logos público. Provas históricas separadas das leituras atuais.
- [x] Testes 904/904 e config/handler 245/245 (sobreposição, não total único); lint inventário PASS; lint fontes FAIL baseline useAuth (1 erro/3 warnings); scanners PASS. Typecheck isolado NOT RUN por restrição do ambiente; último build automático pré-documentação OK 21:35:25Z.
- [x] Smoke público no domínio oficial: plataforma/financeiro/B2B → auth e visita/novo → app/login; Entrar visível/zero pageerror, sem login ou mutação. Lacuna latente PortalGuard sem feature /portal não classificada como bypass atual.
- [ ] Prioridade segurança A03: comprovar/fechar escopo server-side de set_partner_user_papel (authenticated EXECUTE, DEFINER sem tenant do alvo no corpo); falta prova autenticada/alvo seguro para correção. Nenhuma RPC mutável executada.
- [ ] Prioridade isolamento A05: registros_consultor sem policy RESTRICTIVE tenant; branches admin/gestor por papel confirmadas remotamente. Falta prova autenticada e investigação focal segura para correção; não extrapolar PASS das demais tabelas.
- [ ] NO-GO browser: sessão real do administrador AR BIOTECNOLOGIA Gestão v1/TRIAL/10 primeiro; depois oito identidades existentes nos quatro planos, Completo TRIAL, Superadmin/non-superadmin. External_unmanaged impede sessão injetada; sem credenciais em texto, mocks ou PASS inventado.
- [ ] Forja/isolamento RLS/Storage e mutações sensíveis integrais: BLOCKED sem sessões reais e alvo de prova segura; advisors atuais NOT RUN, sem reutilizar números históricos como novos. Nenhum módulo seguinte iniciado.
- [x] Somente relatório/roadmap alterados; sem código funcional, migration, deploy/publicação, fixtures ou alteração de Auth/SMTP/planos/comercial/fiscal/pagamentos.
- [x] Build automático pós-documentação OK 21:41:28Z/21:41:45Z; diff-check PASS antes da consolidação final, sem build/typecheck manual.

## Pós-deploy planos/admin/usuários — 2026-10-07, solicitação 19:57 UTC

- [x] Deploy efetivo confirmado pelo executor independente: commit `2a23d2f952321f1ad962a60be736c31b04fc0d45`, frontend `https://cultivofarm.lovable.app`, deployment_id `4e27d947-1501-4feb-9a3a-3045dc71d404`; HEAD local igual antes da documentação.
- [x] Edge canônica `swzpzcwiasxmjutrmvkm`: create-user ACTIVE v62, verify_jwt=true, hash remoto `93fee9bafa07af0970336b13393fd03ea53e4521490ba1dc7ee0ba9e57742fac`; leitura independente confirmou eventos/códigos sanitizados e ausência de retorno JSON createError.message. Não invocada/reimplantada por este agente.
- [x] Smoke público no site publicado: `/`, `/configuracoes` e `/plataforma` → `/auth` desktop 1280×1800, HTTP inicial 200; `/configuracoes` → `/auth` mobile 390×844. Login visível, zero pageerror, sem overflow horizontal; capturas inspecionadas. Sem login/dados/código funcional/publicação.
- [ ] NO-GO integral somente prova browser autenticada das oito identidades (admin + usuário existente por Base/Essencial/Gestão/Completo), incluindo verificações remotas autenticadas do roteiro; gate humano: execução com sessões reais e evidências sanitizadas, sem compartilhar credenciais.
- [ ] Melhoria futura opcional: contrato/chave server-side para retry convergente; lock UI e unicidade e-mail/Auth não são idempotência distribuída.
- [x] Pendência de deploy frontend/Edge encerrada. Registros abaixo são históricos; menções a Edge não implantada não representam o estado pós-deploy. Relatório atualizado, sem alteração de dados ou código funcional.
- [x] Validação documental: git diff --check PASS; build automático OK 19:59:31Z. Testes/lint/scanners não repetidos nesta rodada sem alteração funcional.

## Correção focal Auth/reentrada — 2026-10-07 19:45 UTC

- [x] Erro Auth bruto removido; códigos públicos/logs fixos, e-mail duplicado preservado por código estruturado. Lock ref síncrono no mesmo formulário com mutateAsync/finally, isPending/disabled preservados.
- [x] Focais 51/51; pertinente 778/778; Deno check, lint dos testes, scanners PASS; build automático OK 19:46:44 UTC. Lint Configuracoes: 18 erros/2 avisos idênticos ao baseline, nenhum novo; typecheck frontend separado não executado.
- [x] Relatório e regra de arquitetura atualizados: PASS focal local, não idempotência distribuída; unicidade e-mail/Auth não substitui contrato de retry server-side convergente.
- [x] Gate histórico atualizado pelo pós-deploy 19:57: Edge remota implantada independentemente; browser autenticado e melhoria futura de retry listados exclusivamente na seção atual acima. Esta rodada local de 19:45 não executou deploy, publicação, migration ou dados.

## Continuação planos/admin/usuários — 2026-10-07 19:34 UTC

- [x] Confirmada integridade de create-user/testes desde a276523; 17/17 primeiro, pertinente 770/770, completa 5.821 PASS/4 skipped; Deno check, lint focal, scanners e diff-check PASS. Sem deploy ou operação remota.
- [x] Preparado roteiro read-only quatro planos × admin e usuário existente, desktop/mobile, navegação/URL/guards/interseção, forja e isolamento; prova independente banco/RLS preservada.
- [ ] BLOCKED: oito sessões browser externas não disponíveis; executar roteiro no navegador do proprietário com identidades existentes e evidência sanitizada. Login público desktop/mobile não certifica plano.
- [x] Lacunas locais desta rodada corrigidas na seção 19:45: erro Auth bruto e reentrada síncrona. Edge remota/concorrência distribuída não certificadas; proteção de UI não é idempotência. Nenhuma correção comercial/banco ou criação de fixture.
- [x] Build automático OK 19:42:10 UTC. Typecheck frontend separado não executado; não inferir PASS, sem execução manual pelo ambiente.

## Fechamento corretivo planos/admin/usuários — 2026-10-07 19:23 UTC

- [x] Diff aprovado aplicado localmente em create-user: autorização com bearer do ator, authorizationError negado, compensação no catch e erro/log genéricos; sem deploy ou operação remota.
- [x] Provas independentes do executor Supabase do proprietário reconhecidas como PASS banco/RLS nesta auditoria: 40/40 rollback, counts/hashes reais, isolamento/admins e fixture restaurada sem resíduos. PASS estrutural frontend preservado.
- [x] Edge mockada 17/17; focais 69/69; suíte pertinente 770/770; Deno check, lint focal, scanners e diff-check PASS. Typecheck frontend separado não executado; build automático OK 19:26:35 UTC.
- [x] Revalidação 19:30 UTC: fechamento existente preservado, 770/770 reexecutados; Deno check, lint focal, scanners e diff-check PASS. Build automático OK 19:32:00 UTC; sem build/typecheck frontend manual. Sem operação remota.
- [x] Gate histórico consolidado no pós-deploy 19:57: implantação Edge concluída pelo executor independente; browser E2E permanece na seção atual. Sem migration/publicação/dados reais nesta rodada de 19:23.

## Auditoria planos/admin/usuários — 2026-10-07 19:05 UTC

- [x] Entrega encerrada às 19:22 UTC a pedido do proprietário, sem reiniciar testes ou ampliar escopo. Revisão observada no fechamento: `980b09d676b8c2002c68f9fbd6fb1fb2ea8b1031`; preservados código, testes e diff candidato. Sem novas correções runtime, migration, deploy ou escrita em dados reais.
- [x] Mapeados criação/listagem/edição/login, dez papéis, guardas e caches; snapshots publicados 3/8/10/17 confirmados read-only. Provas banco/RLS executadas independentemente nesta auditoria pelo executor Supabase do proprietário, separadas da execução local deste agente.
- [x] Matriz estrutural 4×10 usa inventário canônico; 44 testes novos PASS. Diagnósticos no_context/blocked_status/trial_expired preservados na UI. Diff create-user aprovado e aplicado localmente no fechamento corretivo, sem implantar.
- [x] SaaS/usuários/config/RBAC 753/753; suíte completa 5.804 PASS/4 skipped; lint/scanners/diff-check PASS; build automático OK 19:17:02 UTC. Typecheck separado não executado. Scanner Supabase 10 INFO; advisor 461 históricos. Relatório auditoria-planos-admin-usuarios-2026-10-07.md consolidado; SHA observado 550a151775010339bfa4a75107fe85d7bf486226.
- [x] Gate histórico consolidado no pós-deploy 19:57: browser autenticado externo ausente, pendência mantida na seção atual com cache/JWT antigo; implantação remota concluída independentemente. Navegador público não comprova menu/dados autenticados; compensação continua best-effort. Sem migration/deploy/alteração de dados reais nesta rodada de 19:05.

## Gestão de assinatura: plano não reativa — 2026-10-07

- [x] Resumo plano/versão/situação, matriz UX por status, bloqueio da mesma versão, aviso/toast de suspensão e releitura focal limitada a 8s; RPC/timeout/idempotência preservados. Nenhum dado real/publicação.
- [x] 13 testes novos; suíte SaaS 458/458 PASS (45 arquivos), lint/scanners/diff-check PASS; typecheck/build automáticos OK 18:31:03 UTC. Relatório assinatura-aplicando-timeout-2026-10-07.md atualizado. GO focal.
- [ ] NO-GO homologação autenticada: sessão externa real indisponível; conferir resumo/ações sem envio em sessão autorizada. Não repetir ações nem reativar Refil automaticamente.

## Correção urgente do botão de assinatura — 2026-10-07

- [x] Auditado hook/RPC e corrigida espera sem deadline/invalidation global aguardada: 15 s + reconciliação read-only limitada, correlação estável por conteúdo/remount, duplo clique, sem retry automático, finally e quatro caches exatos. Nenhuma operação em dados reais.
- [x] 11 testes novos e suíte SaaS 445/445 PASS; lint focal/scanners PASS; typecheck/build automáticos OK 18:04:53 UTC. Relatório assinaturas: docs/auditorias/assinatura-aplicando-timeout-2026-10-07.md. GO focal frontend.
- [ ] BLOCKED/NO-GO funcional produção: sessão real e cenário de teste autorizado para observar UI/RPC/histórico. Conferir correlação anterior antes de tentativa manual; sem repetição automática, sem alteração de assinatura real/publicação.

## Auditoria de rotas, módulos e entitlements — 2026-10-07

- [x] Primeira entrega estática encerrada a pedido do proprietário às 17:49 UTC: causa comprovada de assinaturas legadas sem snapshot/zero entitlements; matriz com perfis candidatos explicitamente separados dos guards efetivos. Sem novas correções runtime nesta consolidação, sem alteração de assinaturas ou publicação.
- [x] Validação do fechamento: SaaS + redirects 435/435 PASS (43 arquivos); lint focal, scanners e diff-check PASS; build automático OK 17:50:31 UTC. Matriz Markdown inclui perfis candidatos para as 179 declarações. Typecheck separado indisponível; suíte completa anterior não reexecutada nesta consolidação.
- [ ] Etapa operacional separada, fora desta entrega: proprietário aprovar versão publicada vigente por empresa e regularização pelo fluxo oficial, preservando contrato/preço/prazo/histórico; Refil SUSPENDED exige decisão explícita de status. Nunca vincular ou reativar automaticamente. Após autorização/regularização, certificar menus/URLs/dados com sessões reais.
- [x] Inventário estrutural anterior às correções (176 declarações), final AST/JSON de 179 declarações/106 itens/191 arquivos de páginas; catálogo vivo 7 módulos/17 features; 5/5 assinaturas sem plan_version_id. Relatório auditoria-rotas-modulos-entitlements-2026-10-07.md; não regularizar comercialmente por inferência.
- [x] Correções focais: aliases fiscais já documentados, merge query/hash, 403 explícito, ACCESS_MAP espelhando portal/Comunicação existentes, filtros de plano mobile/parceiro, fallbacks/404 distintos; sem banco/migration/Edge/publicação.
- [x] Verificações: 449 focais, 115 contratos finais, suíte 5.730 PASS/4 skipped; lint focal/scanners/build automático PASS. Advisor segurança 461 baseline; scanner Supabase 10 INFO; lint global 3.467 erros/127 avisos. Typecheck separado e advisor performance não executados. NO-GO funcional estrito.
- [ ] BLOCKED: executar A/B/C SQL com rollback seguro e sessões Auth reais para UI/URL/dados/RLS/forja tenant/parceiro; executor transacional e sessões externas indisponíveis. Nenhuma fixture criada; A/B/C unitário não substitui Auth/RLS. Regularização real de AR Bio/Refil exige versão/contrato escolhido pelo proprietário via fluxo oficial, não bypass.

## Gestão de administradores provisionados — 2026-10-07

- [x] Requisito 17:10 UTC — Motivo opcional em Dados: null/vazio/espaços PASS, 1 caractere após trim negado, 2+ PASS; ausência auditada como string vazia, sem padrão fictício. Migration canônica `20261007171308_b0bcbd71-d200-4b53-97ff-223ba7905160` mínima: validação core privado + constraint limitada a admin_profile_updated; ACLs/OCC/escopo preservados. Prova SQL por subtransação rollback PASS (auditoria, replay/conflito, OCC, negativa wrapper/core, hash integral restaurado), zero resíduos convites/auditoria. 38/38 focais, suíte 846/846, lint/scanners PASS, build automático OK 17:14:02Z; advisor 461 históricos/zero novos. Typecheck separado não executado; Auth/RLS/UI autenticadas BLOCKED, NO-GO funcional geral preservado. Sem Edge/config/publicação ou mudança comercial/B2B/fiscal.
- [x] Ajuste UX aprovado 17:04 UTC, motivado pelas capturas reais relatadas pelo proprietário — Responsabilidade removida do diálogo; identificação read-only na tabela preservada; somente Dados/E-mail/Acesso em três colunas com toque mínimo 44px; hook/prop/cálculos/formulário exclusivos removidos. 26/26 focais, suíte pertinente 834/834, lint/scanners focais PASS, build automático OK 17:05:57Z. RPC/histórico preservados; sem mudanças remotas/publicação. Capturas originais não anexadas nesta rodada; NO-GO autenticado permanece.
- [x] Tentativa de homologação read-only 16:47 UTC sobre `4da7545c8e19307ff230e1258d6ee9f053bbf340`: sessão indisponível (`external_unmanaged`, variáveis de sessão ausentes); navegador real em `/auth`, sem sessão canônica no armazenamento nem cookies. Sem bypass, simulação ou operação mutável; somente relatório/roadmap alterados.
- [ ] Gate desta rodada — BLOCKED/NO-GO: obter evidências em navegador autenticado real de Platform Superadmin e identidade de teste existente não Superadmin; validar diálogo desktop/mobile, estado/cooldown/pendência read-only e negativas de autorização. Sessão externa não é injetável neste executor; titular deve executar verificações no próprio navegador e fornecer evidências sanitizadas, sem credenciais/tokens. Sem envio de links ou geração de senha.
- [x] Unificação aprovada 16:27 UTC — um único “Gerenciar administrador” por linha e diálogo com Dados, Responsabilidade, E-mail e Acesso; reenvio real em Acesso, menu/botão/AlertDialog externos removidos; confirmação de e-mail centralizada sem chamada duplicada, lock compartilhado e provisória apagada ao sair. 29/29 focais, suíte pertinente 837/837, lint/scanners focais PASS; typecheck/build automáticos OK 16:34:37 UTC. Inspeção visual isolada desktop/mobile PASS (não autenticada); sem alterações remotas/publicação. NO-GO funcional Auth preservado.
- [x] Revisão independente 16:20 UTC — recovery rotulado “Enviar link para definir/redefinir senha”, convite da tabela preservado; cancelamento indisponível informativo com espera/expiração/reconciliação; SDK 2.110.8 preservado e CORS canônico no finalizador. Deno check PASS, 18/18 Deno (6 CORS), suíte pertinente 833/833, lint/scanners focais/build automático PASS. Advisor: 461 históricos, mesma distribuição anterior; sem migration ou alteração de SMTP/Auth/comercial/B2B/fiscal, sem publicação frontend. NO-GO funcional preservado por ausência de Auth real.
- [x] Implementação autorizada 16:05 UTC: alvo provisionado/tenant/role, finalizador Auth/iat, finalize sem profiles.updated_at, cooldown e reenvio ambíguo auditado; forward-fixes `20261007160947`/`20261007161139` aplicados no canônico. Deno 17/17, check três Edges, UI 12/12, suíte 5.597 PASS/4 skipped, lint/scanners focais/build automático PASS. Advisor: 461 históricos, zero novos. Sem publicação frontend/B2B ou fixtures.
- [ ] Homologação NO-GO: faltam Auth/sessões reais, SMTP, concorrência e UI autenticada; revogação de refresh sessions após confirmação de e-mail não demonstrada nem implementada por alternativa segura. Sem SQL nas tabelas Auth. Typecheck frontend separado bloqueado pelo ambiente; lint global preexistente 3.468 erros/127 avisos.
- [x] Correção estrutural 15:30–16:02 UTC — confirmação do titular, gestão de acesso e prazo provisório; forward-fix `20261007155703`, guard privado e wrappers INVOKER restritos; sem publicação frontend e sem avançar B2B. Não equivale à homologação Auth.
- [x] Verificações pós-fix — 42 focais, 17 Deno, Deno check das três Edges, suíte 5.595 PASS/4 skipped, lint focal/scanners e build automático PASS; advisor 461 findings preexistentes, nenhum novo. Lint global FAIL (3.468 erros/127 avisos), não tratado fora do escopo.
- [ ] Gate funcional NO-GO — Auth Admin local ausente e browser `external_unmanaged`; confirmação real, revogação, senha provisória expirada, RLS e UI autenticada não provados. Typecheck frontend explícito não executado: ambiente proíbe execução manual; Deno check não substitui essa evidência.
- [x] Auditoria focal — troca atual contorna confirmação (`email_confirm: true`); barreira provisória existente somente na tela; SMTP configurado em modo teste não comprova entrega.
- [x] Auditar provisionamento, guards de perfil/organização e semântica Admin Auth
- [x] Responsável principal, edição básica e troca de e-mail (servidor + UI), com auditoria imutável
- [x] Provas SQL com rollback, testes UI/Deno, typecheck, lint e scanner
- [ ] Homologar login com novo e-mail e recusa do antigo usando conta fictícia (sem service_role/sessão real no harness)

# D51.5 — Remediação horizontal multi-tenant

## Auditoria multipla­no e multiempresa — 2026-10-06

- [x] Inventariar contrato canônico, consumidores, grants/RLS, papéis, rotas e estado vivo antes da prova
- [x] Criar matriz A/B/C/D exclusivamente transacional, com snapshot/hash e rollback integral
- [x] Provar ciclo de entitlement, overrides, estados fail-closed, isolamento, RBAC e histórico
- [x] Validar estruturalmente sidebar, URL direta e estados seguros; UI autenticada real permanece bloqueada pelo provedor externo
- [x] Corrigir divergências comprovadas: resolvedor único, idempotência de overrides e privilégios anônimos residuais
- [x] Executar testes focados, typecheck, lint focado, scanner, build e confirmar restauração do estado vivo

## Pós-D52 — Prova comercial positiva e fundação de pagamentos

- [x] Fase 1 — auditar estado vivo comercial, segurança e publicação; registrar diagnóstico sanitizado
- [x] Gate A — BLOCKED/NO-GO: zero versões e ausência de dados comerciais reais; publicação do app não é publicação comercial
- [x] Fase 2 — fluxo DRAFT/validação/publicação seguro implementado, sem inventar dados comerciais
- [ ] Fase 3 — homologar ACTIVE/TRIAL versionado com sessão real e isolamento A/B
- [x] Fase 4 — fundação provider-agnostic preparada e testada; cobrança real OFF/NO-GO
- [x] Fase 5 — evidências técnicas fechadas; próxima fase não iniciada e PASS comercial ainda bloqueado
- [x] Editor estruturado — arquitetura, compatibilidade do catálogo anterior e validação server-side implantadas; catálogo de limites permanece vazio até definições reais aprovadas
- [x] Editor estruturado — salvamento DRAFT, idempotência, autorização e validação server-side corrigidos e comprovados com rollback integral
- [ ] Editor estruturado — homologar criação/publicação com dados comerciais reais aprovados, sem fixtures
- [ ] Editor estruturado — validar manualmente no preview autenticado o ciclo pós-save corrigido; implementação, testes e estado vivo read-only concluídos sem publicar (sessão externa indisponível ao harness)
- [x] Editor estruturado — motivo mínimo unificado em 2 caracteres e catálogo global ativo disponibilizado a todos os planos, sem alterar entitlements
- [ ] Editor estruturado — homologar manualmente a publicação real; nesta correção a prova permanece restrita a rollback integral

## D52 — Assinatura, trial, pagamento e ciclo de vida SaaS

- [x] Fase 0 — auditar estado vivo de planos, assinaturas, cobrança, interfaces e jobs
- [x] Núcleo A+B+C — versões imutáveis, estados, trial, mutações específicas, locks e histórico
- [x] Fase 3 — registrar pagamento externo BLOCKED/NO-GO, sem fluxo paralelo
- [x] Trial — backfill determinístico do fim quando `started_at` é inequívoco; legado segue sem versão comercial
- [x] Entitlements e UI — B1+B2+B3 autenticados PASS; prova comercial positiva segue BLOCKED sem versão real
- [x] Fase 8 — matriz negativa validada; prova positiva BLOCKED sem contrato real, sem criar fixtures comerciais falsas
- [x] Fase 9 — validar índices, estado vivo, linter, scanner, testes, typecheck e build
- [x] Fase 10 — consolidar relatório, rollback/forward-fix e decisão GO/NO-GO

## D51.6 — Fechamento funcional multi-tenant

- [x] Gate 1 — classificar `consultor-arquivos` como mídia técnica sensível e recriar o bucket privado
- [x] Gate 1 — aplicar paths por organização, policies Storage e validar acesso cruzado
- [x] Gate 2 — executar matriz A/B com duas sessões Auth reais e cleanup integral
- [x] Gate 3 — validar estado vivo, testes, linter/scanner, smoke A/B e consolidar evidências
- [x] Decisão final — homologação de segurança PASS e homologação funcional PASS

- [x] Fase 1 — Financeiro e Storage: tenant explícito; relatórios inseguros bloqueados
- [x] Fase 2 — Catálogo destrutivo: somente Superadmin e sem fallback no navegador
- [x] Fase 3 — Portal: cliente validado no tenant antes da leitura privilegiada
- [x] Fase 4 — Produção e inserts: tenant explícito com guarda server-side
- [x] Fase 5 — Fiscal: tenant explícito; legado sem vínculo bloqueado
- [x] Fase 6 — Policies/RPCs baseadas só em papel: RLS restritiva transversal
- [x] Fase 7 — Configuração global legada: mantida global sem dados tenant
- [x] Validações, deploy, smoke passivo e relatório final
- [x] Fechamento P0/P1 vivo — recibos/Storage, catálogo, Portal, produção e Fiscal contidos
- [x] Edges financeiras/fiscal/auditoria implantadas; 66 testes focados, build, scanner e linter validados
- [x] Catálogo e configuração global — mutações de produtos, microrganismos, visual e financeiro restritas a Platform Superadmin
- [x] Produção/Parceiros — OnFarm, contas de parceiros e planejamento protegidos por cadeia determinística até a organização; legado ambíguo bloqueado
- [x] Matriz A/B transacional canônica — dois administradores de organizações distintas, claims locais e `SET LOCAL ROLE authenticated`; zero mutação persistida
- [x] Homologação horizontal de segurança — PASS com Financeiro/Storage e legado sem ownership mantidos FAIL-CLOSED
- [x] Gate P0-A Financeiro/Storage — recibo e cliente validados no tenant; vínculos financeiros protegidos por trigger; `clientes-docs` corrigido para `org/clientes/cliente`; RPCs analíticas inseguras mantidas FAIL-CLOSED
- [x] Gate P0-B Catálogo — catálogo confirmado global; auditoria e wipe somente Platform Superadmin; wipe transacional, idempotente, auditado e limitado às tabelas globais, sem fallback no navegador
- [x] Gate P0-C Portal — cliente validado por tenant antes do service role; perfis e papéis filtrados pela organização; cache local limpo entre identidades; Edge implantada e smoke 401
- [x] Gate P0-D Produção/RBAC vivo — isolamento estrutural PASS; RPCs da esteira sem tenant explícito bloqueadas; A/B autenticado sem fixtures NOT RUN; homologação funcional NO-GO
- [x] Gate P1 Fiscal — RLS alinhada ao ACCESS_MAP; Edges e Storage validam ator/recurso antes do service role; emissão produtiva bloqueada; A/B funcional NOT RUN
- [x] Gate P1 Sistêmico — role-only removido das superfícies alcançáveis; configuração e catálogo globais restritos a Platform Superadmin; legado sem ownership FAIL-CLOSED
- [x] Relatório final D52 separado em Segurança, Ciclo interno SaaS e Pagamento externo.

## Fechamento pendências multiplano (2026-10-06)
- [x] Gate canônico de plano em portais técnico mobile (visita/checkin) e parceiro (pedidos, catálogo, simulações, fichas), aninhado aos guards de vínculo — 399 testes, typecheck e lint OK.
- [ ] Homologação UI autenticada com fixtures persistentes — BLOCKED: assinaturas/histórico/versões publicadas têm triggers no-delete/imutáveis; limpeza não garantida, fixtures não criadas.
- [ ] Concorrência multi-conexão de publicação/override — BLOCKED pelo mesmo motivo (estruturalmente: FOR UPDATE + índices únicos de idempotência).
- [ ] Proteção de senha vazada — BLOCKED: requer confirmação do plano Supabase (Pro+) e ação do proprietário no painel Auth.
- [ ] Retomada isolada (13:11 UTC) — BLOCKED na Fase 0: nenhum ambiente Supabase isolado acessível; refs alternativos no repositório são destinos proibidos; sem token de gestão para listar branches/ler config Auth. Aguarda o proprietário habilitar branch/projeto de homologação.

## Consolidação catálogo global / B2B (2026-10-06 19:07 UTC)
- [x] Migration `20261006190720_e2db3d80-7c5c-4117-9ff4-e632456202ca` aplicada em swzpzcwiasxmjutrmvkm: resolvedores de preço B2B só service_role; mutação de produtos/microrganismos só Platform Superadmin; leitura interna do catálogo técnico exige papel + org ativa + `catalogo_precos` (bypass superadmin). Prova: anon/authenticated sem EXECUTE nos resolvedores; 0 policies de mutação não-superadmin; superadmin vê, 4 admins legados não veem, uid nulo/desconhecido negado.
- [ ] Prova positiva de tenant com `catalogo_precos` em versão PUBLISHED — pendente (nenhuma versão real publicada).

## Correção pós-revisão do catálogo B2B (2026-10-06)
- [x] Migration `20261006191816_1f5205f4-9482-4fed-ba16-a5f7baaf0cb5.sql` aplicada em swzpzcwiasxmjutrmvkm. CORRIGE o PASS anterior da `20261006190720`, que era parcial (partner_id arbitrário, `_uid` forjável, preço-base executável por authenticated).
- [x] Provas SQL com rollback: admin de outra empresa, parceiro incoerente, parceiro excluído/inativo, anon, inativo e `_uid` forjado negados; Superadmin permitido; catálogo técnico só com fichas aprovadas e sem preço fora de contexto de parceiro coerente.
- [x] Editor: confirmação PUBLICAR ignora espaços acidentais, erro visível com código de correlação; payloads de salvar/publicar testados.
- [ ] Equipe interna pode simular preço para qualquer parceiro (`rpc_resolve_commercial_prices`, `rpc_cc_simulate_price`) — aguarda decisão do proprietário sobre o escopo do back-office.
- [ ] Preço positivo para parceiro coerente: não há parceiro coerente em produção (0 empresas vinculadas a parceiro).
- Fechamento (19:36 UTC): suíte completa 5.531 PASS / 1 FAIL (`commercial-money-editor.test.tsx`, passou 9/9 isolado — instabilidade sob carga NÃO VERIFICADA); focados 1.059/1.059, typecheck, lint focado, build e scanner PASS. Técnico com vínculo coerente e preço positivo de parceiro: NÃO VERIFICADOS em execução real.

## Limites estruturados e isolamento do back-office (2026-10-06)
- [x] Migration `20261006203913_86ba5af8-2a95-44e2-9e0b-8b1c8558183c.sql` aplicada: 6 definições de limite sem valores (required=false) e gate central de parceiro nas simulações/pedidos.
- [x] Provas com rollback: Superadmin OK; admin com parceiro forjado/sem parceiro, parceiro incoerente, inativo, técnico, parceiro excluído e anon negados.
- [x] Editor agrupa limites por módulo/funcionalidade, sem JSON. Suíte 5.535 PASS, typecheck, lint, build, scanner PASS.
- [ ] Aplicação dos limites em runtime — não implementada.
- [ ] Prova comercial positiva — bloqueada: nenhuma empresa vinculada a parceiro.
- Relatório: `docs/auditorias/limites-e-isolamento-backoffice-2026-10-06.md`.

- [x] Fechamento controlado limites/isolamento (sem nova migração). NÃO VERIFICADO: reexecução pós-travamento, prova comercial positiva, enforcement runtime, UI autenticada.

- [ ] Prova comercial positiva A/B/C — PARCIAL (2026-10-07): executada com rollback e 0 resíduos; GO para isolamento, entitlements em trial, imutabilidade e pagamentos 0/0/0. NO-GO para fechamento: assinatura ACTIVE não provada (sem fluxo oficial trial→active). A confirmar: simulação do próprio parceiro permitida a admin/financeiro/gestor_comercial e negada ao técnico. Evidências: `docs/auditorias/pos-d52-prova-comercial-fase1-2026-10-06.md` §18.
- [ ] Advisors Supabase preexistentes (2026-10-07) — dívida/risco de produção, não tratados: segurança 17 INFO / 2+445 WARN DEFINER / senhas vazadas OFF; performance 166 FK sem índice, 36 initplan, 1 sem PK, 371 índices não usados, 127 políticas múltiplas.
- [x] Sucessão de versão publicada (v1 → v2 em rascunho, encerramento controlado da vigência) — migrations `20261006225758_e18b38b3…` e `20261006230004_972d3b64…`; relatório `docs/auditorias/sucessao-versao-comercial-2026-10-06.md`. NÃO VERIFICADO: tela com login real e concorrência real.
- [x] Gestão da plataforma: aba "Empresa" com lista, Nova Empresa, detalhe e edição cadastral segura — relatório `docs/auditorias/plataforma-aba-empresa-2026-10-07.md`. Pendente: paginação server-side (>150 empresas) e verificação visual com login real.
- [x] Hardening JWT em platform-org-admin-email-change (getUser service_role, pin supabase-js)
- [x] Motivo opcional na troca de e-mail de administrador (UI, Edge, RPC; demais ações inalteradas)
- [x] Motivo opcional em Definir responsável principal (UI + RPC; edição segue obrigatória)
- [x] Revalidação consolidada motivo opcional (e-mail + responsável principal)

- [x] Cadastro empresarial completo na ficha da empresa (contatos, endereço, IE, resumo fiscal somente leitura) — 2026-10-07
- [ ] Validação visual autenticada da ficha da empresa (desktop/mobile)
- [ ] Busca de empresas por cidade/UF (fase futura)
- [x] Correção: troca de plano em assinatura legada (plan_version_id NULL) — migration `20261007035510` aplicada em produção; só `change_plan` para versão PUBLISHED vigente; provas com rollback PASS. Pendente: regularizar a AR BIOTECNOLOGIA pela tela (ação humana) e teste visual autenticado. Evidências: `docs/auditorias/pos-d52-prova-comercial-fase1-2026-10-06.md` §19.
- [x] Revalidação autenticada 2026-10-07 13:00 UTC — corrigidos bloqueios de privilégio/ticket com wrapper INVOKER + core privado e preservação do trial no trigger; migrations `20261007125842` (permissão temporária, revogada pela seguinte) e `20261007125937` aplicadas somente na produção; rollback PASS e hash integral da assinatura real preservado. Mensagem atual do servidor traduzida; ver §20.

## Certificação ponta a ponta Parceiro B2B — 2026-10-07
- [ ] Rodada autenticada 14:59 UTC — NO-GO: Auth Admin privado e sessões reais indisponíveis; run `20261007T150258Z`, manifesto vazio, sem fixtures. Quatro probes públicos negativos PASS; 15 identidades BLOCKED. Sem prova RLS/Storage/concorrência/UI autenticada. Preservados 59,90 BRL e bloqueios fiscais/cobrança, sem deploy.
- [x] Forward-fix 15:01 — migration `20261007150152` confirmada no histórico/policies: SELECT auth.uid nas quatro policies técnicas; 18 focais PASS, suíte 5.595 PASS/4 skipped, lint focal/scanners/build automático OK. Performance Advisor PASS focal: revisão independente via Supabase MCP no canônico `swzpzcwiasxmjutrmvkm`, informada às 15:11 UTC, confirmou 36 achados globais `auth_rls_initplan` e ZERO findings para `b2b_technical_no_raw_prices`/`b2b_technical_financial_write_guard` em `partner_simulations`/`partner_simulation_items` após a migration; quatro avisos focais removidos. Typecheck manual proibido; lint global 3.468 erros/127 avisos. Zero prefixo E2E em 256 tabelas public/Auth/Storage; sequence 1026 sem reset. NO-GO geral preservado: Auth/sessões reais e provas RLS/Storage/concorrência/UI autenticadas ausentes.
- [x] Forward-fix 13:58 — migration `20261007135856` aplicada: escopo canônico técnico, guard financeiro/estados e initplans focais; cabeçalho/itens price-free, 16 testes focais e lint PASS. Evidência estrutural/unitária, não certificação funcional.
- [ ] Revalidar fluxo, matriz técnica/A-B, snapshots e título/parcelas — BLOCKED: sem executor transacional autenticado e sessões Auth UI/concorrência. 0 resíduos por prefixo em 26 classes, mas inventário histórico completo de IDs/hash de perfis ainda ausente. NO-GO, sem Fase 2. Relatório atualizado; suíte 5.593 PASS/4 skipped, scanners e build automático OK; advisor focal performance PASS por revisão independente pós-migration `20261007150152`; typecheck isolado sem evidência.
- Correção de contexto: fixtures mutáveis com limpeza e correções mínimas estavam expressamente autorizadas. Não houve falta de autorização por esse motivo; preservar as seis migrations 13:38–13:49 com forward-fix. Avanço de sequence é aceito e não constitui bloqueio da prova.
- [ ] Fase 1 — auditar estado vivo e implementar roteiro A/B/C transacional canônico, isolamento, preços, idempotência, crédito, fluxo e resíduos; fiscal externo sempre desligado.
- Retomada autorizada às 13:34 UTC: fechar catálogo/preço/hash, simulação/conversão, pedido/replay, forja tenant/parceiro, aprovação/produção, título elegível sem retry/outbox, RLS/Storage/perfis e concorrência segura; fixtures removidas por IDs/prefixo. Avanços de sequence são efeitos técnicos auditáveis, sem restauração em produção. UI depende de sessão disponível; repetir verificações e advisors focais, sem limpeza global ou Fase 2.
- Fase 1 autorizada expressamente às 13:13 UTC: executar correções mínimas comprovadas e migrations indispensáveis somente no canônico, rollback integral, relatório PASS/FAIL/BLOCKED e commit quando disponível; não publicar/deploy nem iniciar Fase 2 enquanto o gate não estiver integralmente satisfeito.
- Correção focal de crédito aplicada no canônico: `20261007131828_9007da9a-6dad-4793-a0b3-b02e73c03d15.sql`; prova prévia confirmou acesso cruzado. Roteiro A/B/C de crédito criado; certificação completa permanece pendente, sem avançar à Fase 2.
- [x] Crédito focal: 11 provas RPC PASS e 4 provas de leitura/escrita direta PASS com rollback; segunda brecha contida por `20261007132558_fcace95c-5756-4110-9cb7-be2fbb192efd.sql`; 0 resíduos nas quatro classes consultadas. Relatório `docs/auditorias/certificacao-b2b-fase1-2026-10-07.md`.
- [ ] Gate Fase 1 NO-GO até evidências individuais: preço/hash/idempotência/pedido/aprovação/produção/financeiro/Storage/concorrência e UI autenticada; avanço de sequence autorizado, sem restauração. Typecheck isolado sem evidência; lint/advisors globais preexistentes não são FAIL isoladamente.
- [ ] Fase 2 — confiabilidade financeira: retry/outbox, reconciliação, alerta e exatamente um título por pedido elegível.
- [ ] Fase 3 — rascunho NF-e idempotente vinculado ao fluxo canônico e gate seguro de expedição, sem emissão real.
- [ ] Fase 4 — documentação de transporte, CT-e recebido e decisão MDF-e fail-closed; emissão própria CT-e desligada.
- [ ] Fechamento — matriz RLS/Storage/RPC, provas A/B/C, desktop/mobile, testes, verificações automáticas, scanner/advisors e relatório GO/NO-GO; decisões contábeis não inferidas.
