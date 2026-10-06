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
