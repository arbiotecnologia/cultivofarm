# H7O — Relatório parcial (rodada 1) — staging `ikaauvsflpmamgxmkhoq`

Data: 2026-09-04 (UTC). Produção `navfzbwgwzruipouyfnk` **não consultada, não alterada, não promovida**.
Nenhum DDL/DML foi executado no staging nesta rodada: apenas leituras de catálogo, ledger e corpos de função.

## 1. Estado de partida verificado
- Drift detectado em HEAD (`fad37927`): `.env` apontava para o sandbox `yzszl…` e `types.ts` tinha 2.052 linhas. Ambos restaurados do commit `ddee31ab` (21.850 linhas). `check-frontend-binding.sh` e `guard-staging.sh`: OK (`tpAmb=2`, produção fiscal desabilitada).
- `h7n-postcheck.sh`: PASS integral (ledger H7N 5/5 com MD5, views 5/5 `security_invoker`, wrappers 4/4, RPCs 13/13, allowlist 504 sem drift, fiscal `HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY`).
- As cinco migrations H7N (`20260904130615`…`20260904131341`) permanecem intactas e não foram reaplicadas.

## 2. Objetivo 10 — migration `20260903182144_h7l_security_advisor_hardening` recuperada
- Extraída byte a byte do ledger (`encode(convert_to(statements[1],'UTF8'),'base64')`), 4.156 bytes, MD5 `dc2ee1f7db4a0e2768a6adf29ac6310b` (idêntico ao `md5(statements[1])` do ledger).
- Versionada em `supabase/migrations/20260903182144_h7l_security_advisor_hardening.sql`. Não reaplicada. Conteúdo: guard de staging, `security_invoker` + grants em 3 views `v_fiscal_nfe_*`, `search_path` em 34 funções fiscais, revogação de 2 trigger functions.

## 3. Objetivos 1–2 — classificação individual das 397 assinaturas SECURITY DEFINER
Artefatos em `restoration/homologacao-h7/h7o-inventario/`:
- `00-secdef-inventory.sql` (catálogo read-only: ACL, `pg_depend`, callers, cron, guardas, DML, MD5) → `secdef_catalog.tsv` (397 assinaturas; 395 só `authenticated`, 2 também `anon`; 0 EXECUTE PUBLIC; 0 sem `search_path`).
- `01-repo-refs.py` → `repo_refs.tsv` (referências fortes/fracas no frontend, Edge Functions, testes, harnesses, migrations; inclui mapas de RPC dinâmicos).
- `02-classify.py` + `03-refine-guards.py` → `secdef_classification.tsv` e `call_graph.tsv` (guarda própria ou **delegada a helper nomeado** — 43 helpers de autorização confirmados: `_visita_lock_and_check`, `fn_cockpit_assert_operador`, `fn_entrega_assert_confirmador`, `fn_cc_can_prepare`, `fn_fiscal_can_read_internal`, `is_financial_staff`, …).

| Categoria | Qtde |
|---|---|
| RPC autenticada com guarda (própria ou delegada) | 249 |
| Estrutural (policy/view/constraint/cron/Edge Function) | 82 |
| Candidata à revogação (sem consumidor direto; callers só SECURITY DEFINER ou nenhum) | 54 |
| RPC autenticada **sem guarda** (leitura de corpo concluída) | 10 |
| Pública necessária (anon, QR/token) | 2 |

Risco após leitura manual: 2 ALTO (DML sem guarda), 11 MÉDIO, 384 BAIXO.

### 3.1 As 10 sem guarda — decisão por leitura do corpo
| Função | Consumidores comprovados | Decisão proposta (próxima rodada) |
|---|---|---|
| `fn_generate_recurring_title(uuid,date,bool)` — DML (gera títulos) | `Recorrencias.tsx:440` (manual) e cron `recurring-financial-daily` via `fn_run_recurring_generation` | **Guardar**: permitir sessão interna (sem JWT) / service_role / `is_financial_staff(auth.uid())`; senão `42501`. Preserva cron e tela. |
| `recalc_partner_risk_score(uuid)` — DML (upsert score) | `useB2BFinanceiro.ts:385` e trigger `tg_recalc_risk_on_ar_change` | **Guardar**: `pg_trigger_depth()>0` ou sessão interna ou `is_financial_staff`; senão `42501`. |
| `check_cliente/fazenda/talhao_dependencies` — só contagens | `src/lib/cadastros.ts:72-84` | **Guardar** com `is_operational_staff(auth.uid()) OR can_user_access_cliente(auth.uid(), cliente)`; senão `42501`. |
| `rpc_validar_integridade_esteira(text,uuid)` — leitura de flags por OS | `useEsteiraLaboratorio.ts:727` (a sobrecarga de 3 args, INVOKER, é a usada internamente) | **Guardar** com `is_operational_staff(auth.uid())`; senão `42501`. |
| `rpc_cockpit_confirmar_entrega_v1`, `rpc_entrega_confirmar_v1` | wrappers puros de `fn_entrega_confirmar_engine_v1` → `fn_entrega_assert_confirmador` | Reclassificar como guarda delegada (2 níveis). Sem alteração. |
| `fn_catalogo_preco_canonico`, `fn_cockpit_is_hml_environment` | views de catálogo / botão de fixtures HML | Leitura não sensível por design. Sem alteração; documentar. |

### 3.2 As 54 candidatas — evidência
Busca textual ampla (`src`, `supabase/functions`, `e2e`, `tests`, `scripts`, excluindo migrations/docs/types) = **0 ocorrências** para todas as 54. Nenhuma tem dependência em policy/view/trigger/cron.
- **Grupo A (helpers/engines chamados só por SECURITY DEFINER)** — revogação de EXECUTE `authenticated` segura (mesmo padrão H7N), pendente de confirmação de que harnesses não as invocam diretamente como `authenticated`: `_assert_visita_editavel`, `_comunicacao_require_admin`, `_rpc_avancar_esteira_laboratorio_internal`, `can_checkin_technical_visit`, `can_user_access_cliente(uuid,uuid)`, `can_view_bi_operacional`, `fn_cockpit_assert_operador`, `fn_entrega_assert_confirmador`, `fn_entrega_confirmar_engine_v1`, `fn_estoque_pode_operar`, `generate_production_orders_from_partner`, `is_operational_staff`, `is_visit_org_manager`, `is_valid_b2b_partner_user`, `get_b2b_user_role_for_partner`, `log_report_view`, `rpc_gerar_alertas_operacionais`, `rpc_recalcular_prioridade_alerta`, `rpc_regulatory_sod_override`.
- **Grupo B (RPCs guardadas sem nenhum consumidor — código morto ou exercitado só por harness fiscal/regulatório)**: manter sem alteração nesta fase (guardas presentes; remoção é decisão de produto). Exceção a reavaliar: `rpc_substituir_etiqueta_produto` (DML, guarda fraca `uid_check`, sem consumidor) → candidata a revogação fail-closed.

## 4. Objetivo 11 — views protegidas em migrations posteriores a H7N
- `20260908000000_h3_base_tecnica_catalogo_v1.sql` (CREATE OR REPLACE) e `20260909000000_h3b_preco_canonico_fichas_v1.sql` (DROP/CREATE) recriam `vw_catalogo_ficha_produtos` e `vw_catalogo_ficha_microrganismos` **sem** `security_invoker`. As outras 3 views não são tocadas.
- Ambas são repo-only (não estão no ledger) mas seu conteúdo já está aplicado no staging (ex.: `fn_catalogo_preco_canonico` existe); a reconstrução em ordem de repositório perderia `security_invoker`.
- Correção planejada: migration nova numerada **após** `20260929000000` (última do repo) que reafirma `ALTER VIEW … SET (security_invoker = true)` nas 5 views de forma idempotente + teste estático que exige reafirmação após qualquer CREATE/DROP de view protegida.

## 5. Objetivo 6 — rate-limit de `rpc_validar_comprovante_entrega` (projeto)
- Função atual: SECURITY DEFINER, `search_path=public`, EXECUTE `anon`; token `uuid` com `gen_random_uuid()` (imprevisível); retorno mínimo e mensagem genérica; **sem** limite nem auditoria.
- Estrutura existente: `communication_provider_settings_rate_limit(user_id uuid NOT NULL, action, window_start, count)` + `rpc_service_check_rate_limit` (restrita a service_role/postgres, chave por usuário) — não serve a chamadas anônimas sem distorcer a semântica de `user_id`.
- Proposta: tabela em schema `private` (já existente, não exposto à Data API; ACL `authenticated=U, service_role=U`), chave `(scope, bucket_key, window_start)`, contadores por token (hash), por origem (hash sha256 de `x-forwarded-for`/`cf-connecting-ip` + sal diário, sem IP em claro) e teto global; verificação **antes** da consulta ao token (resposta `valido=false, rate_limited=true, retry_after_seconds` sem revelar validade); poda via função + job `pg_cron` (padrão `prune-old-audit-logs`); rollback com `DROP` + restauração do corpo atual (capturado por `pg_get_functiondef`).

## 6. Objetivo 7 — as 7 tabelas com RLS sem policy (evidência de catálogo)
| Tabela | Grants | Linhas | Leitura |
|---|---|---|---|
| `_f42_harness_fixtures` | postgres, service_role | 14 | fail-closed deliberado (fixtures de harness) |
| `_fiscal_staging_marker` | postgres, service_role | 1 | fail-closed deliberado (marcador lido só por SECURITY DEFINER) |
| `commercial_payment_plans` | postgres, service_role | 18 | acesso só via RPCs `rpc_admin_*_commercial_plans` (SECURITY DEFINER) — fail-closed correto |
| `communication_provider_settings` | **anon/authenticated com ALL** (grant sem policy = negado por RLS) | 1 | fail-closed efetivo; grants excedentes a `anon`/`authenticated` são candidatos a revogação (sem impacto: RLS já nega) |
| `communication_provider_settings_rate_limit` | postgres, service_role | 2 | fail-closed deliberado (uso via `rpc_service_check_rate_limit`) |
| `comunicacao_inapp_dispatch` | postgres, service_role | 0 | fail-closed deliberado (worker service_role) |
| `fiscal_certificate_material` | postgres, service_role | 1 | fail-closed obrigatório (cofre A1; Edge Function com service_role) |
Conclusão preliminar: nenhuma precisa de policy; todas são deliberadamente fail-closed. Confirmar consumidores frontend antes de fechar.

## 7. Objetivo 8 — extensões
`btree_gist 1.7` em `public` (relocável) e `pg_net 0.20.4` em `public` (não relocável). Sem mover/recriar/atualizar nesta fase; dependências (constraints EXCLUDE com gist, chamadas `net.http_post` em triggers/funções) a inventariar antes de qualquer decisão.

## 8. Comparação repo ↔ `schema_migrations`
- Ledger: 650 versões, máx. `20260904131341`. Repo: 709 arquivos (após versionar H7L). 59 versões repo-only, das quais 27 nomeadas entre `20260905000000` e `20260929000000` (fases H3–H7a) cujo conteúdo foi aplicado ao staging sem registro no ledger — reconciliação permanece item P2 do roadmap.
- Numeração das migrations H7O: `20260930000000_h7o_*` (posterior ao ledger e a todos os arquivos do repo), seguindo a convenção das fases H.

## 9. Pendências desta rodada (próxima execução)
Objetivos 3–9, 11–14: migrations H7O (guardas das 6 funções, 42501 em `rpc_b2b_aging`/`rpc_b2b_partner_profitability`, revogações do Grupo A, rate-limit, reafirmação das views), rollbacks, gate determinístico de binding (pre-commit/CI), Advisor antes/depois, harness por perfil ampliado, typecheck/build/Vitest/scan, ensaio rollback→reapply, validação fiscal read-only e atualização de `docs/auditorias/homologacao-h7-fiscal.md`, `97-h7n-p0p1-auditoria.md` e roadmap.
