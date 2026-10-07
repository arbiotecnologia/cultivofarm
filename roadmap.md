## Gestão de administradores provisionados — 2026-10-07

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
