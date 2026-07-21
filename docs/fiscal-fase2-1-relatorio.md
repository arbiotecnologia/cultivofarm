# Fase Fiscal 2.1 — Relatório Final

**Classificação:** APTO PARA FASE FISCAL 3 — ENRIQUECIMENTO CONTÁBIL (com ressalvas registradas em Y/AA).

## A. Classificação geral
Fundação fiscal reconciliada, endurecida e reproduzível. Nenhuma emissão externa introduzida.

## B. Migration canônica
- `restoration/migrations/20260721000000_fiscal_fase2_fundacao.sql` (idempotente)
- `restoration/migrations/20260721010000_fiscal_fase2_1_hardening.sql` (idempotente)

## C. Reconciliação do histórico
Registrada no `supabase_migrations.schema_migrations` sem reaplicação destrutiva. Procedimento em `docs/fiscal-fase2-1-reconciliacao.md`. Ressalva: diretório `supabase/migrations/` deste projeto é bloqueado pelo sandbox Lovable — a fonte canônica reside em `restoration/migrations/` (mesmo padrão de versionamento).

## D. Migration × schema real
Snapshot em `restoration/fiscal_fase2_applied_schema.sql` + `restoration/fiscal_fase2_applied_schema_full.txt`. Divergência única encontrada: views sem `security_invoker` — **corrigida** na 2.1.

## E. Tabelas, colunas e tipos
8 tabelas fiscais + 24 colunas aditivas em `fiscal_invoices` + 6 em `financial_documents` (confirmadas via `pg_catalog`).

## F. FKs e ON DELETE (pós-hardening)
| Origem | Coluna | Alvo | ON DELETE |
| --- | --- | --- | --- |
| product_fiscal_profiles | product_id | products | (herdado, sem CASCADE) |
| customer_fiscal_profiles | customer_id | clientes | (herdado) |
| fiscal_invoice_items | fiscal_invoice_id | fiscal_invoices | CASCADE (documentado — item só existe com cabeçalho) |
| fiscal_events | fiscal_invoice_id | fiscal_invoices | **RESTRICT** (era CASCADE) |
| fiscal_idempotency_keys | fiscal_invoice_id | fiscal_invoices | SET NULL |
| financial_documents | fiscal_invoice_id | fiscal_invoices | SET NULL |
| fiscal_invoices | parent_invoice_id | fiscal_invoices | RESTRICT (novo) |
| fiscal_invoices | substitution_invoice_id | fiscal_invoices | RESTRICT (novo) |

## G. Constraints e índices
Adicionados: `chk_fi_no_self_parent`, `chk_fi_no_self_substitution`.
Substituídos: `ux_fi_doc_model_series_number_company` → `ux_fi_env_doc_model_series_number_company`; `ux_fi_provider_ref` → `ux_fi_provider_env_model_ref`.

## H. Unicidade por ambiente
Agora: `(company_cnpj, document_model, environment, series, invoice_number)` — homologação e produção podem repetir. `access_key` mantém unicidade global.

## I. Backfill sintético
**PENDENTE / UNVERIFIED.** Ambiente sandbox sem Docker; base real de produção continua vazia (`fiscal_invoices=0`, `financial_documents=0`). Os defaults foram testados via `UPDATE` da própria fundação (idempotente) — nenhum registro histórico existe para regredir. Recomendação: rodar o backfill em staging antes de qualquer carga real.

## J. RLS por perfil e tabela
**Estático (SQL):** policies auditadas — administrador (full), gestor (leitura ampla), financeiro (leitura + escrita em items/profiles), administrativo (removido de items, ver L). Demais perfis (produção, aplicador, técnico, consultor, cliente, parceiros) **sem** policy fiscal → acesso negado. `anon` sem grants em nenhuma tabela nova.
**Runtime multi-perfil via JWT:** **UNVERIFIED** — sandbox não emite JWT por role; suíte real fica para Fase 3.

## K. Views
Todas as 5 agora com `security_invoker=true` (`pg_class.reloptions` confirmado). Respeitam RLS das tabelas base.

## L. Perfil administrativo
**Decisão: REMOVIDO** de `fiscal_invoice_items` (SELECT). Justificativa: administrativo opera faturamento agregado; itens contêm snapshot tributário sensível. Aplicado em `20260721010000`.

## M. Segurança de fiscal_events
- `REVOKE INSERT/UPDATE/DELETE` de authenticated.
- Policies `USING (false)` em UPDATE/DELETE.
- RPC `rpc_fiscal_event_manual(invoice_id, event_type, notes)` `SECURITY DEFINER`, `search_path=public,pg_temp`, whitelist `MANUAL_UPDATED|RECONCILIATION_REQUIRED|RECONCILIATION_COMPLETED`, `event_source='USER'`, `performed_by=auth.uid()`. Rejeita `PROVIDER|WEBHOOK|SYSTEM|SEFAZ|NFSE_NACIONAL` pelo simples fato de não estarem na whitelist. `EXECUTE` restrito a authenticated + gate interno de role.

## N. Segurança de fiscal_audit_log
- `REVOKE INSERT/UPDATE/DELETE` de authenticated; policy `USING (false)` em ALL.
- SELECT apenas para `administrador`.
- Trigger reescrito: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, referências schema-qualificadas, allowlist de 8 tabelas, `performed_by=auth.uid()` sempre.
- `mask_sensitive_jsonb(jsonb)` remove chaves: authorization, token, password, senha, certificate, certificado, private_key, secret, pfx, p12, api_key, apikey, bearer.

## O. Tipos Supabase
**UNVERIFIED.** Regeneração de `src/integrations/supabase/types.ts` requer CLI Supabase autenticado (não disponível no sandbox). O código atual usa `("rpc_upsert_fiscal_invoice_manual" as any)` em `FiscalTab.tsx` — dívida técnica pré-existente, sem `@ts-ignore` novo introduzido. Regenerar antes da Fase 3.

## P. Módulo manual preservado
`FiscalTab`, `DocumentosPanel`, `HistoricoTab`, `NotasFiscais` intocados exceto o banner já existente. Teste `fase2_1.ui.test.tsx` cobre.

## Q. Testes de interface
5 asserts em `src/test/fiscal/fase2_1.ui.test.tsx` (copy, banner, ausência de emissão/certificado/token, preservação da RPC manual, ausência de SDK fiscal em `package.json`).

## R. Confirmação de ausência de emissão externa
`production_enabled=false`, `nfe_enabled=false`, `nfse_enabled=false`, `fiscal_environment='NOT_CONFIGURED'`, `fiscal_provider='NONE'` no singleton `company_fiscal_settings`. Nenhuma Edge Function fiscal criada.

## S. Ausência de tokens/certificados
`scripts/fiscal-security-scan.sh` → **OK**. Nenhum `FOCUS_TOKEN`, `NFSE_TOKEN`, `SEFAZ_TOKEN`, `CERT_PASSWORD`, `.pfx`, `.p12`, `focusnfe.com`, `nfse.gov.br`, `homologacao.sefaz`, nem `Authorization: Bearer` em arquivos fiscais. `secrets--fetch_secrets` não consultado neste turno; recomendação: rodar antes da Fase 3.

## T. Typecheck
`bun run typecheck` → **PASS** (`tsc --noEmit` sem erros).

## U. Build
`bun run build` → **PASS** (Vite + PWA precache 20 entradas).

## V. Testes
`bunx vitest run` → **360/360 PASS** (43 arquivos).

## W. ESLint arquivos alterados
Não executado (lint global fora de escopo por regra de proteção). Sem novos `any`/`@ts-ignore`.

## X. Lint global
Não executado neste turno.

## Y. Alterações fora do escopo
Nenhuma. Somente: `restoration/migrations/*`, `scripts/fiscal-security-scan.sh`, `src/test/fiscal/fase2_1.ui.test.tsx`, `docs/fiscal-fase2-1-*.md`.

## Z. Achados por severidade
- **Alto (corrigido):** views sem `security_invoker` → potencial bypass de RLS.
- **Alto (corrigido):** `fiscal_audit_log` permitia gravação direta por authenticated.
- **Alto (corrigido):** `fiscal_events` permitia INSERT falsificável.
- **Médio (corrigido):** unicidade de numeração não considerava ambiente.
- **Médio (corrigido):** ausência de guarda anti auto-substituição.
- **Médio (corrigido):** trigger de auditoria persistia payloads sem máscara.
- **Baixo (aceito):** `ax_fi_access_key` global — correto para NF-e/NFS-e reais.

## AA. Riscos residuais
1. Backfill não testado com dados sintéticos (I).
2. Suíte RLS runtime multi-perfil ausente (J).
3. Tipos Supabase não regenerados (O).
4. `supabase/migrations/` bloqueado — canônico vive em `restoration/migrations/`.

## AB. Dependências da contabilidade
Preenchimento de `company_fiscal_settings` (CNPJ, IE, CRT, CNAE, município IBGE), `product_fiscal_profiles`, `service_fiscal_profiles`, `customer_fiscal_profiles`. Views `v_*_readiness` medem esse progresso.

## AC. Recomendação
**AUTORIZADO PARA FASE FISCAL 3 — ENRIQUECIMENTO CONTÁBIL**, condicionado a:
- executar backfill sintético em staging antes de carga real;
- regenerar `types.ts` via CLI Supabase autenticado;
- planejar suíte RLS runtime multi-perfil como parte da Fase 3.

Fase Fiscal 3 **não** foi iniciada.
