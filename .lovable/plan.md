
# Fase Fiscal 3.0.1 — Plano corretivo

Escopo estritamente corretivo e preparatório. **Não inicia 3.1**, não toca produção, não edita migrations já aplicadas (`20260721000000`, `20260721010000`), não altera motor financeiro/B2B, não cria usuários/fixtures no projeto real.

## 1. Inventário do schema real (leitura)
Reler as duas migrations fiscais aplicadas + `src/integrations/supabase/types.ts` e mapear nomes reais de tabelas, colunas, nullables, views, RPC, policies. Registrar em `docs/fiscal-fase3-0-1-inventario.md` como fonte-de-verdade para os passos 2–8. Nenhuma leitura contra o projeto real; apenas artefatos do repo.

## 2. Verificador `scripts/verify-fiscal-types.ts`
Reescrever whitelist para refletir schema real:
- `company_fiscal_settings`: `cnpj`, `fiscal_environment`, `fiscal_provider`, `configuration_status`, `nfe_enabled`, `nfse_enabled`, `production_enabled`.
- `product_fiscal_profiles`: `product_id`, `ncm`, `cfop_in_state`, `cfop_interstate`, `profile_status`.
- `service_fiscal_profiles`: `service_id` (nullable), `source_reference` (nullable), `lc116_item`, `cnae`, `profile_status`.
- `customer_fiscal_profiles`: `customer_id`, `taxpayer_indicator`, `fiscal_municipality_ibge_code`, `profile_status`.
- `fiscal_invoices`: `company_cnpj`, `document_model`, `environment`, `series`, `invoice_number` todos nullable.
- `fiscal_invoice_items.fiscal_invoice_id`; `fiscal_events` (`fiscal_invoice_id`, `request_snapshot`, `response_snapshot`, `event_type`); `fiscal_idempotency_keys` (`idempotency_key`, `fiscal_invoice_id`); `fiscal_audit_log` (`old_values`, `new_values`, `changed_by`, `changed_at`).
- Views reais: `v_fiscal_company_readiness`, `v_product_fiscal_readiness`, `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`, `v_fiscal_document_reconciliation_pending`.
- RPC: `rpc_fiscal_event_manual(p_invoice_id uuid, p_event_type text, p_notes text) RETURNS uuid`.
- `mask_sensitive_jsonb(v jsonb) RETURNS jsonb`.

Adicionar `scripts/verify-fiscal-types.test.ts` com 4 fixtures embutidas (correta, coluna ausente, nullable errado, RPC errada) — usa `child_process` para invocar o script.

## 3. Nova migration incremental
`supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql`, aditiva:
- FKs (idempotentes, condicionais a zero órfãos verificados via `DO $$ ... RAISE EXCEPTION`):
  - `product_fiscal_profiles.product_id → produtos(id) ON DELETE RESTRICT`
  - `customer_fiscal_profiles.customer_id → clientes(id) ON DELETE RESTRICT`
- `service_fiscal_profiles`: **sem FK** (catálogo canônico ausente). Unique parciais:
  - `(service_id) WHERE service_id IS NOT NULL AND profile_status = 'active'`
  - `(source_reference) WHERE source_reference IS NOT NULL AND profile_status = 'active'`
  - Comentário SQL documentando `source_reference` como transitório.
- `fiscal_events.fiscal_invoice_id`: guard `DO` que aborta se houver órfãos; caso contrário `SET NOT NULL` + FK RESTRICT idempotente.
- `mask_sensitive_jsonb` substituída por versão realmente recursiva (ver §4).
- `rpc_fiscal_event_manual`: recriada com validação `p_invoice_id IS NOT NULL`, `EXISTS` em `fiscal_invoices`, `performed_by := auth.uid()`, `event_source` fixo interno; `p_notes` gravado em coluna `notes` aditiva em `fiscal_events` (adicionar `ADD COLUMN IF NOT EXISTS notes text`). Autorização por role preservada.

## 4. `mask_sensitive_jsonb` recursiva
Implementação PL/pgSQL que percorre `jsonb_typeof` (`object`/`array`/primitivo/null); em objeto, `lower(key) LIKE '%<term>%'` para cada termo da lista mínima solicitada (authorization, token, access_token, refresh_token, password, senha, certificate, certificado, private_key, privatekey, secret, client_secret, pfx, p12, api_key, apikey, bearer). Chave sensível → `"***REDACTED***"`. Contrato idêntico ao TS.

## 5. Testes de máscara
`src/test/fiscal/mask.test.ts` (TS) e `src/test/fiscal/rls/mask.sql.test.ts` (SQL via `pg`) — mesmo conjunto de casos: 1º nível, 3 níveis, arrays, arrays de objetos, headers, `accessToken`, `private_key_pem`, `null`, objeto vazio, array vazio, payload grande (500 chaves). O SQL test **falha explicitamente** se `PGURL_STAGING` presente e `pg` não puder ser carregado; skip apenas quando envs ausentes.

## 6. Dependências
`bun add -d pg @types/pg tsx` (se ausentes).

## 7. Matriz RLS por-tabela
Reescrever `src/test/fiscal/rls/matrix.ts` — expectativas explícitas por (role, tabela, op) conforme policies reais (ver especificação §6 do prompt). Incluir `fiscal_invoices` com célula `cliente_produtor_own` (documento próprio → ALLOW SELECT) e `cliente_produtor_other` (ALLOW SELECT mas 0 linhas — enforced pelo runner). Incluir `financial_documents` se relevante ao escopo fiscal.

## 8. Views do harness
Substituir nomes antigos pelos reais listados em §2. Expectativa por-view. Para `v_fiscal_document_reconciliation_pending`: nova migration adiciona filtro `WHERE has_role(auth.uid(),'administrador'|'gestor'|'financeiro')` diretamente na view (recriada em migration 3.0.1) para impedir vazamento a cliente_produtor.

## 9. Runner RLS baseado em fixtures
Reescrever `src/test/fiscal/rls/runner.ts`:
- Setup: cria UUIDs conhecidos por tabela usando `service_role` (staging isolado).
- SELECT: consulta por UUID; DENY = 0 linhas; ALLOW = linha presente.
- INSERT: payload válido; distingue `42501`/RLS de `23xxx`/constraint; cleanup.
- UPDATE: `Prefer: return=representation`; conta linhas; confere valor.
- DELETE: cria descartável e conta linhas removidas.
- RPC: 15 chamadas (`rpc_fiscal_event_manual`).
- Certificação exige zero skip / zero falha; JWT ausente ⇒ falha.

## 10. Guard anti-produção
`src/test/fiscal/rls/guard.ts` (usado pelo runner e pelo backfill): aborta se URL/host contiver `navfzbwgwzruipouyfnk`, se `FISCAL_TEST_ENV !== 'STAGING'`, ou se tabela marker `public._fiscal_staging_marker` ausente.

## 11. Backfill redesenhado
`restoration/backfill-fiscal-fase3/` — reescrever:
- `01-prepare.sql`: cria marker de staging + fixtures em tabelas reais (`clientes`, `accounts_receivable`, `entregas`, `financial_documents`, `fiscal_invoices`) cobrindo PENDING/ISSUED/CANCELED/ERROR, com/sem receivable/delivery, com access_key/XML/DANFE, múltiplos por conta, sem número, sem série, manual, externo.
- `02-baseline.sql`: snapshot **antes** das migrations fiscais.
- `03-apply.sh`: aplica `20260721000000` + `20260721010000` + `20260722000000`.
- `04-verify.sql`: contagens antes/depois, zero perda/órfão, ISSUED ≠ AUTHORIZED, origem MANUAL_RECORD, normalized_status LEGACY_RECORDED, provider NONE, environment NOT_CONFIGURED, anexos preservados, múltiplos preservados, índices aplicados, zero emissão.
- `99-cleanup.sql`: descarta banco.
- README atualizado: só executável em banco isolado.

## 12. Scanner de segurança
`scripts/fiscal-security-scan.sh`:
- Adicionar padrões: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET`, `DATABASE_URL`, `DB_PASSWORD`, `PRIVATE_KEY`, `CLIENT_SECRET`, `FOCUS_*`, `PLUGNOTAS_*`, `*.pfx`, `*.p12`.
- Remover exclusão em bloco de `docs/`, `restoration/`, `src/test/`; substituir por allowlist de termos documentais conhecidos.
- Saída mascarada: `arquivo:linha [tipo] <valor mascarado>`.

## 13. Validações
`bun run typecheck`, `bun run build`, `bunx vitest run`, ESLint nos arquivos alterados, `scripts/fiscal-security-scan.sh`. Sem execução runtime contra projeto real.

## 14. Relatório
`docs/fiscal-fase3-0-1-relatorio.md` com seções A–X exatamente como especificado. Recomendação será uma de: AUTORIZADO / CORRIGIR ANTES / INCONCLUSIVA — decidida a partir dos resultados de §13.

## Detalhes técnicos

```text
supabase/migrations/
  20260721000000_fiscal_fase2_fundacao.sql       (INTACTA)
  20260721010000_fiscal_fase2_1_hardening.sql    (INTACTA)
  20260722000000_fiscal_fase3_0_1_integridade.sql (NOVA — aditiva, idempotente)
```

Arquivos previstos para edição/criação:
- `scripts/verify-fiscal-types.ts` (reescrito)
- `scripts/verify-fiscal-types.test.ts` (novo)
- `scripts/fiscal-security-scan.sh` (ampliado)
- `supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql` (novo)
- `src/test/fiscal/rls/matrix.ts` (reescrito)
- `src/test/fiscal/rls/runner.ts` (reescrito)
- `src/test/fiscal/rls/guard.ts` (novo)
- `src/test/fiscal/rls/harness.test.ts` (ajuste de nomes/expectativas)
- `src/test/fiscal/rls/mask.sql.test.ts` (endurecido)
- `src/test/fiscal/mask.test.ts` (ampliado)
- `restoration/backfill-fiscal-fase3/*` (redesenhado)
- `docs/fiscal-fase3-0-1-inventario.md` (novo)
- `docs/fiscal-fase3-0-1-relatorio.md` (novo)
- `package.json` (devDeps: `pg`, `@types/pg`, `tsx` se ausentes)

Aguardo aprovação para executar.
