# H7n — Auditoria e implementação P0/P1 — staging ikaauvsflpmamgxmkhoq

Estado (2026-09-04 13:58 UTC): **P0/P1 APLICADAS NO STAGING E VERSIONADAS NO REPOSITÓRIO.**
Produção `navfzbwgwzruipouyfnk`: não consultada, não migrada, não publicada, não alterada.
Binding local restaurado do baseline c75bb87f (o `.env`/`types.ts` gerados pela plataforma sofrem drift recorrente para
`yzszlzjpovmcteuxjznj`; todo comando de banco passa por `guard-staging.sh` + `staging-psql.sh`, que recusam qualquer ref
diferente do staging autorizado).

## 0. Resumo executivo

| Item | Antes (04/09 manhã) | Depois (04/09 13:58 UTC) | Evidência |
| --- | --- | --- | --- |
| Views `security_definer_view` (ERROR) | 5 | **0** — 5/5 `security_invoker=true` | splinter oficial + `h7n-postcheck.sh` |
| Funções de trigger SECURITY DEFINER com EXECUTE para authenticated/anon | 27 (4 também anon) | **0** | `h7n-postcheck.sh`, harness por perfil |
| RPCs sensíveis sem autorização | 13 | **13 com guard** (11 plpgsql `RAISE 42501`; 2 `LANGUAGE sql` com filtro fail-closed) | harness por perfil 136/136 PASS |
| Helpers internos com EXECUTE para authenticated | 42 | **0** | `h7n-postcheck.sh` |
| `function_search_path_mutable` | 4 | **0** | splinter oficial |
| SECURITY DEFINER executáveis por authenticated | 466 | **397** (dívida técnica inventariada) | splinter oficial |
| SECURITY DEFINER executáveis por anon | 6 | **2** (QR/token, por design) | splinter oficial |
| Advisor (segurança) | 5 ERROR / 479 WARN / 7 INFO | **0 ERROR / 402 WARN / 7 INFO** (401 via SQL + 1 `auth_leaked_password_protection`, verificada só pela API) | `h7n-inventario/advisor_splinter_after.txt` |

## 1. Migrations forward (versionadas com os NÚMEROS EXATOS já aplicados; NÃO reaplicar)

| Versão | Arquivo | MD5 (repo == `schema_migrations.statements`) | Conteúdo |
| --- | --- | --- | --- |
| 20260904130615 | `supabase/migrations/20260904130615_h7n_p0_security_invoker.sql` | `6e2cf6faebe65ec025b050eea109ae0c` | schema `private` (não exposto pela API) + 4 wrappers SECURITY DEFINER com predicado idêntico; 5 views `security_invoker=true`; grants authenticated/service_role, sem anon |
| 20260904130758 | `supabase/migrations/20260904130758_h7n_p1_trigger_execute.sql` | `d90aa6fc93a32fe37f155f15e358e0fe` | `REVOKE EXECUTE ... FROM public, anon, authenticated` nas 27 funções de trigger |
| 20260904130941 | `supabase/migrations/20260904130941_h7n_p1_rpc_guards.sql` | `11f71e300ce4b0b8a9f4ced07e513656` | guards de papel nas 13 RPCs (has_role/get_user_partner_id; `pg_trigger_depth()>0` liberado em `generate_b2b_receivable_secure`) |
| 20260904131239 | `supabase/migrations/20260904131239_h7n_p1_internal_helpers.sql` | `1be95ea173b743d6c1cbe8db0b61fed1` | `REVOKE EXECUTE` em 42 helpers internos (uso exclusivamente interno comprovado no inventário) |
| 20260904131341 | `supabase/migrations/20260904131341_h7n_p2_search_path.sql` | `9e9768c45d14b98e7247638e592f16a2` | `SET search_path = pg_catalog` em 4 funções IMMUTABLE |

Extração: `array_to_string(statements, E'\n')` de `supabase_migrations.schema_migrations`; comparação byte a byte (MD5) automatizada em `h7n-postcheck.sh` (5/5 PASS).

## 2. Rollbacks (fora de `supabase/migrations`; NÃO executados em definitivo)

Diretório `restoration/homologacao-h7/h7n-rollbacks/`, um por migração, cada um com transação explícita e verificação final:

| Rollback | Restaura |
| --- | --- |
| `20260904130615_h7n_p0_security_invoker_rollback.sql` | definições originais das 5 views (`h7n-inventario/viewdefs.sql`), `security_invoker=false`, ACLs originais (postgres/authenticated/service_role), DROP das 4 funções e do schema `private` (condicional: só se vazio) |
| `20260904130758_h7n_p1_trigger_execute_rollback.sql` | EXECUTE para authenticated nas 27 triggers; anon nas 4 que tinham (`fn_b2b_guard_credit_approval_fields`, `fn_b2b_guard_order_items_immutable`, `trg_catalogo_volumes_sync_mestre`, `trg_mestre_guard_preco_canonico`) |
| `20260904130941_h7n_p1_rpc_guards_rollback.sql` | corpos anteriores das 13 RPCs sem guard (reconstruídos do SQL aplicado; `rpc_b2b_aging`/`rpc_b2b_partner_profitability` desembrulhadas do subselect `h7n_guarded`; conferidos com `20260617022407_*.sql` e `20260520201607_*.sql`) + grants anteriores |
| `20260904131239_h7n_p1_internal_helpers_rollback.sql` | EXECUTE para authenticated nos 42 helpers (nenhum tinha anon) |
| `20260904131341_h7n_p2_search_path_rollback.sql` | `RESET search_path` nas 4 funções |

**Ensaio rollback→reapply** (`rehearse-rollback-reapply.sh`, 13:41:51–13:42:21 UTC, uma transação, terminada em `ROLLBACK`):
rollbacks 5→1, checks pré-H7N 7/7 PASS (0 views invoker, schema `private` ausente, 27 triggers e 42 helpers expostos, 0 guards, 0 search_path),
forwards 1→5, checks pós-H7N 7/7 PASS, e **fingerprint de catálogo idêntico antes/depois** (`138b4b37108333b7be000562b90e84a2`
sobre ACL+config+md5(prosrc) de todas as funções `public`/`private` e reloptions+ACL+viewdef de todas as views `public`). Nada persistido.

## 3. Validações no staging (sem mutação)

- `h7n-postcheck.sh` — **PASS**: ledger 5/5 == repo; views 5/5; wrappers 4/4; triggers expostas 0; helpers expostos 0; guards 13/13; search_path 4/4;
  allowlist sem drift (504 funções `public` executáveis por anon/authenticated: 397 DEFINER + 107 INVOKER); DEFINER+anon = 2; trigger DEFINER na allowlist = 0;
  fiscal `HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY`; `fiscal_invoices|fiscal_events|fiscal_sefaz_transmissions = 0|0|1`.
- `h7n-harness-perfis.sql` — **136/136 PASS** (transação descartada). Um usuário real por papel (administrador, administrativo, aplicador, cliente_produtor,
  consultor_tecnico, financeiro, gestor, gestor_comercial, parceiro_b2b, producao) + anon:
  - 5 views legíveis por todos os papéis autenticados, com filtragem pelo chamador (ex.: cliente_produtor vê 12/25 microrganismos, 0 linhas nas views de esteira/visita; administrador 25, 2, 5, 2);
  - `mv_esteira_laboratorio`/`mv_fluxo_visita_tecnica` diretas: 42501 para todos (sem bypass do predicado);
  - helpers `fn_cq_ultimo_resultado` e `_portal_cliente_user_has_link`: 42501 para todos; função de trigger direta: 42501;
  - `rpc_b2b_aging_detalhado()`/`rpc_b2b_capacity_kpis()`: sucesso só para os papéis do guard, 42501 para os demais e para anon;
  - `rpc_b2b_aging()` (LANGUAGE sql): 0 linhas para não autorizados (fail-closed por filtro — ver risco R1);
  - anon: views 42501; `rpc_validar_rastreio_produto(uuid aleatório)` executa e não retorna dado (público por design).
- Splinter oficial (`splinter.sql` do repositório supabase/splinter, sha256 `d8d558baad3e0383…`) executado em transação descartada:
  0 ERROR; WARN segurança: 397 authenticated_security_definer + 2 anon_security_definer + 2 extension_in_public (`btree_gist`, `pg_net`) = 401 (+1 `auth_leaked_password_protection` fora do SQL = 402);
  INFO 7 `rls_enabled_no_policy`. Também apareceu 1 WARN `public_bucket_allows_listing` (bucket `logos`, público por design; lint recente, não constava na baseline) e lints de performance (fora do escopo).

## 4. Validações do repositório

| Comando | Resultado |
| --- | --- |
| `bunx tsgo --noEmit` | PASS |
| `bunx vite build` | PASS (4588 módulos, ~2 min) |
| `bunx vitest run` (completo) | 3.304 PASS / 14 FAIL / 4 skip — os 14 FAIL eram exclusivamente de drift de binding (`.env`/`types.ts` regenerados pela plataforma para `yzszlzjpovmcteuxjznj` durante a execução); após restaurar o baseline, os 5 arquivos afetados foram reexecutados: **74/74 PASS** → total efetivo **3.318 PASS / 0 FAIL / 4 skip** |
| `scripts/fiscal-secrets-scan.sh` | PASS — nenhum valor secreto |
| Correspondência migrations ↔ ledger | 5/5 MD5 idênticos (`h7n-postcheck.sh`) |

## 5. Riscos e pendências

- **R1 (P3, consistência)** — `rpc_b2b_aging` e `rpc_b2b_partner_profitability` são `LANGUAGE sql`; o guard aplicado é um filtro (`h7n_guarded`): não autorizado recebe conjunto vazio em vez de 42501. Fail-closed quanto a dados, mas a UI mostra "sem dados" e não "sem permissão". Alinhar para plpgsql/`RAISE` em migração futura (não alterar as versões H7N já aplicadas).
- **R2 (P1 residual, promoção)** — 397 SECURITY DEFINER ainda executáveis por authenticated: 348 com indício textual de guarda + helpers/guards já triados; revisão individual pendente (allowlist versionada em `h7n-inventario/rpc_allowlist.tsv` + postcheck falha em drift).
- **R3 (P2)** — `rpc_validar_comprovante_entrega` sem rate-limit em banco (rastreio tem 60/h). Exigiria tabela nova → fora deste escopo.
- **R4 (P2)** — 2 `extension_in_public` (`btree_gist`, `pg_net`) e `auth_leaked_password_protection` desabilitada (configuração do Auth, decisão de política).
- **R5 (P3)** — 7 `rls_enabled_no_policy`: `_f42_harness_fixtures`, `_fiscal_staging_marker`, `commercial_payment_plans`, `communication_provider_settings`, `communication_provider_settings_rate_limit`, `comunicacao_inapp_dispatch`, `fiscal_certificate_material` (fail-closed por design; confirmar uso).
- **R6 (P3)** — 61 funções SECURITY INVOKER (cálculos/normalizadores + 53 trigger functions invoker) com EXECUTE padrão para anon por default privileges; sem elevação de privilégio, chamada direta de trigger é impedida (0A000). Higiene futura.
- **R7 (ledger/ordem)** — `20260903182144_h7l_security_advisor_hardening` está no ledger do staging sem arquivo correspondente em `supabase/migrations/` (fora das 5 versões deste escopo; não criado nem inventado aqui). O ledger do staging termina em `20260904131341`, enquanto o repositório tem versões posteriores por nome (ex.: `20260908…`, `20260909…`) que recriam views de catálogo sem `WITH (security_invoker)`: em reconstrução de banco vazio por ordem de arquivo, `h7n-postcheck.sh` deve ser executado ao final (falha se as views voltarem ao modo definidor).
- **R8 (plataforma)** — drift recorrente de `.env`/`types.ts` para o backend Lovable Cloud; sempre restaurar do baseline `c75bb87f` antes de qualquer gate (o `check-frontend-binding.sh` aborta em drift).

## 6. Auditoria original (04/09/2026, somente leitura — preservada)

### P0 — 5 views `security_definer_view`
Todas: owner=postgres, security_invoker=false, SELECT para authenticated, sem SELECT para anon.
- `vw_os_integridade_esteira`: SEM predicado de chamador; lê ~15 tabelas RLS. Consumidores: `_src_vw_esteira_laboratorio` -> `mv_esteira_laboratorio`
  (refresh por funções SECURITY DEFINER/pg_cron como postgres, que tem BYPASSRLS) e `rpc_validar_integridade_esteira` (2 overloads). Nenhum consumo direto no frontend.
  Estratégia: `ALTER VIEW ... SET (security_invoker=true)` puro — RLS das tabelas passa a valer para o chamador. Efeito colateral documentável:
  papéis sem SELECT em partner_accounts/partner_orders (gestor, producao) veem partner_nome NULL ao ler a view crua (cockpit usa a MV, inalterada).
- `vw_esteira_laboratorio` (lê `mv_esteira_laboratorio`) e `vw_fluxo_visita_tecnica` (lê `mv_fluxo_visita_tecnica`): predicado por papel/cliente já embutido.
  MVs não têm RLS nem grants para authenticated/anon. security_invoker direto quebraria a aplicação; conceder SELECT nas MVs exporia a MV via PostgREST (bypass do predicado) — REJEITADO.
  Estratégia equivalente e segura: função SECURITY DEFINER em schema NÃO exposto pela API (`private`), owner postgres, `search_path=public`, EXECUTE apenas
  para authenticated/service_role, com o MESMO predicado; a view passa a `security_invoker=true` selecionando dessa função. Nomes/colunas/contratos preservados.
- `vw_catalogo_ficha_produtos` / `vw_catalogo_ficha_microrganismos`: security_invoker puro MUDARIA a semântica (cliente_produtor não tem policy em produtos;
  para B2B, perfis técnicos não aprovados ficariam invisíveis e o `NOT EXISTS` passaria a mostrar itens pendentes). Mesma estratégia da função `private` com predicado idêntico.
Rollback: restaurar definições originais (salvas em `h7n-inventario/viewdefs.sql`) + `security_invoker=false` + DROP das funções `private`.

### P1 — inventário (catálogo do staging, 04/09/2026)
- 466 funções SECURITY DEFINER executáveis por authenticated (bate com o Advisor); 27 são funções de trigger, TODAS efetivamente usadas por triggers
  (lista em `h7n-inventario/fn_inventory.tsv`, coluna is_trigger_fn). EXECUTE só é checado no CREATE TRIGGER, não no disparo -> revogar de PUBLIC/anon/authenticated é seguro.
  4 delas também têm EXECUTE para anon: fn_b2b_guard_credit_approval_fields, fn_b2b_guard_order_items_immutable, trg_catalogo_volumes_sync_mestre, trg_mestre_guard_preco_canonico.
- 6 funções anon: as 4 triggers acima + `rpc_validar_comprovante_entrega(uuid)` e `rpc_validar_rastreio_produto(uuid)` — públicas por design (QR/validação),
  token uuid imprevisível, retorno mínimo, flags de habilitação/expiração; rastreio tem rate-limit 60/h por etiqueta; comprovante NÃO tem rate-limit em banco (P2, exigiria tabela nova).
- 81 funções não-trigger sem indício textual de guarda (heurística própria; o relatório anterior contou 83). Classificação em `h7n-inventario/noguard_usage.tsv` e `other_refs.tsv`:
  - MANTER (usadas em RLS/policies de storage/views/callers SECURITY INVOKER): has_role, get_cliente_id_for_user, get_cliente_ids_for_user, is_executivo,
    is_active_visit_participant, fn_onfarm_scope_lote, fn_regulatory_storage_can_read/write/delete, fn_catalogo_preco_canonico, fn_fiscal_company_crt, fn_microorganism_regulatory_facts.
  - REVOGAR (uso exclusivamente interno por funções SECURITY DEFINER, sem uso direto/cron/policy comprovado): _avancar_os_status, _entrega_seed_checklist, _notify_role,
    _portal_cliente_user_has_link, _validate_planning_integrity, can_checkout_technical_visit, fn_catalogo_litro_canonico, fn_catalogo_sync_mestre_preco,
    fn_conformidade_perfil_vigente, fn_cultura_em_uso, fn_entrega_cobertura_v1, fn_estoque_ctx_force, fn_fiscal_assert_debtor_recipient, fn_fiscal_emitter_pendencies,
    fn_fiscal_emitter_pendencies_row, fn_fiscal_invoice_eligibility, fn_fiscal_partner_fiscal_customer, fn_fiscal_recipient_pendencies_row, fn_fiscal_resolve_operation,
    fn_fiscal_resolve_tax_rule, fn_fiscal_scenario_coverage, fn_upsert_alerta_operacional, gerar_codigo_lote, gerar_codigo_visita, get_visit_organization_id,
    is_visit_responsible, lote_volume_envasado, partner_order_has_production, partner_order_sla_status, proximo_codigo, recalc_partner_order_production,
    refresh_partner_engagement, rpc_recalcular_separacao_entrega, rls_auto_enable (event trigger) e órfãs: auto_reject_partner_orders_no_items, fn_avancar_etapa_esteira,
    fn_cq_ultimo_resultado, fn_fiscal_emitter_status, fn_os_assert_staging_exato, fn_run_financial_inconsistency_check, get_partner_papel, rpc_b2b_check_governance_block.
    (Aplicado: 42 assinaturas — `fn_fiscal_invoice_eligibility(text,uuid,uuid)` já era interna; só a sobrecarga de 2 argumentos foi alterada.)
  - GUARDA NECESSÁRIA (RPC chamada pelo frontend, SECURITY DEFINER, sem autorização — exposição cross-tenant/econômica a qualquer authenticated, inclusive parceiro/produtor):
    rpc_b2b_aging, rpc_b2b_aging_detalhado, rpc_b2b_carteira_kpis, rpc_b2b_executive_alerts, rpc_b2b_executive_dashboard, rpc_b2b_governance_kpis,
    rpc_b2b_partner_profitability, rpc_b2b_revenue_forecast (papéis por src/lib/permissions.ts: administrador, gestor, financeiro, gestor_comercial, administrativo);
    rpc_b2b_capacity_kpis (administrador, gestor, producao, gestor_comercial); fn_mark_financial_overdue (administrador, gestor, financeiro);
    generate_b2b_receivable_secure (administrador, gestor, financeiro; liberar quando pg_trigger_depth()>0 para tg_auto_b2b_receivable);
    rpc_message_set_status e rpc_partner_message_counters (administrador/gestor_comercial OU pedido do próprio parceiro via get_user_partner_id()).
    rpc_b2b_aging e rpc_b2b_partner_profitability são LANGUAGE sql -> a versão aplicada manteve `LANGUAGE sql` com filtro `h7n_guarded` (ver R1).
  - P2 documentar: rpc_validar_integridade_esteira(text,uuid) (retorno booleano por uuid), check_*_dependencies (apenas contagens).
- Allowlist explícita de RPCs: gerada em `h7n-inventario/rpc_allowlist.tsv` (504 funções) com postcheck que falha em drift (`h7n-postcheck.sh`; `H7N_ALLOWLIST_UPDATE=1` regrava, revisar no diff).

## 7. Artefatos desta rodada

- `supabase/migrations/20260904130615_h7n_p0_security_invoker.sql`, `…130758_h7n_p1_trigger_execute.sql`, `…130941_h7n_p1_rpc_guards.sql`, `…131239_h7n_p1_internal_helpers.sql`, `…131341_h7n_p2_search_path.sql`
- `restoration/homologacao-h7/h7n-rollbacks/*.sql` (5) + `rehearse-rollback-reapply.sh`
- `restoration/homologacao-h7/h7n-postcheck.sh`, `restoration/homologacao-h7/h7n-harness-perfis.sql`
- `restoration/homologacao-h7/h7n-inventario/rpc_allowlist.tsv`, `restoration/homologacao-h7/h7n-inventario/advisor_splinter_after.txt`
- `docs/auditorias/homologacao-h7-fiscal.md` (seção 11), `roadmap.md`, este relatório
