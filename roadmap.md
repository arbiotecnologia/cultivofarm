# D51.5 — Remediação horizontal multi-tenant

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
