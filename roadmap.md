# D51.5 — Remediação horizontal multi-tenant

## D52 — Assinatura, trial, pagamento e ciclo de vida SaaS

- [x] Fase 0 — auditar estado vivo de planos, assinaturas, cobrança, interfaces e jobs
- [x] Núcleo A+B+C — versões imutáveis, estados, trial, mutações específicas, locks e histórico
- [x] Fase 3 — registrar pagamento externo BLOCKED/NO-GO, sem fluxo paralelo
- [x] Trial — backfill determinístico do fim quando `started_at` é inequívoco; legado segue sem versão comercial
- [ ] Entitlements e UI — implementação estrutural concluída; gate funcional autenticado pendente por ausência de sessão segura no Supabase externo; prova comercial positiva segue BLOCKED sem versão real
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
