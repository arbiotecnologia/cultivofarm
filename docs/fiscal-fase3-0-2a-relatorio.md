# Fase Fiscal 3.0.2-A — Relatório

**A. Classificação:** APROVADO — canonicalização, integridade e policies concluídas apenas na camada SQL. Nada aplicado no banco real. Fase 3.1 **não** iniciada.

**B. Estado da versão `20260722000000`:** **Cenário A** — não estava em `supabase/migrations/` e não foi aplicada ao projeto real. Corrigida e movida antes de qualquer execução.

**C. Migration canônica final:** `supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql` (325 linhas, transacional, idempotente). Reescreve integralmente o conteúdo herdado de `restoration/migrations/` com todos os endurecimentos exigidos.

**D. Restoration convertida em stub:** `restoration/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql` reduzida a `SELECT 1 WHERE false` com aviso. Nenhuma outra fonte executável duplica a versão.

**E. FKs adicionadas (RESTRICT):**
- `product_fiscal_profiles.product_id → public.produtos(id)`
- `customer_fiscal_profiles.customer_id → public.clientes(id)`
- `fiscal_events.fiscal_invoice_id → public.fiscal_invoices(id)` (reforço da 2.1)
- `service_fiscal_profiles.service_id` **sem FK** (catálogo canônico ausente; source_reference reforçada).
Ausência de `produtos` ou `clientes` faz a migration **falhar objetivamente** — sem swallow.

**F. NOT NULL:** `fiscal_events.fiscal_invoice_id` recebe `SET NOT NULL`. Órfãos abortam a migration com `RAISE EXCEPTION`. Nenhum `EXCEPTION WHEN OTHERS THEN NULL` restante no arquivo.

**G. Integridade dos serviços:**
- CHECK `chk_service_fp_ref_or_id`: `service_id IS NOT NULL OR NULLIF(btrim(source_reference),'') IS NOT NULL`.
- Índice `ux_service_fiscal_profiles_service_active` (service_id ativo).
- Índice `ux_service_fp_source_ref_ci_active` sobre `lower(btrim(source_reference))` (case-insensitive, ativo, sem string vazia).
- `source_reference` documentada como transitória via `COMMENT ON COLUMN`.

**H. Policies de `company_fiscal_settings`:** `FOR ALL` removida. Split em `_insert` (admin), `_update` (admin), `_delete` (`USING(false)`). `SELECT` preservada como estava (admin/gestor/financeiro). `REVOKE DELETE` explícito. Singleton preservado.

**I. Policies de `fiscal_invoices`:** `fi_staff_all` / `is_financial_staff` derrubadas. Substituídas por `fi_staff_select`, `fi_staff_insert`, `fi_staff_update` (admin/gestor/financeiro) e `fi_staff_delete USING(false)`. `fi_producer_read` recriada restrita a `cliente_produtor` com filtro `customer_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())`. Perfil `administrativo` **não** recebe acesso — cancelamento passa a ocorrer via status/evento.

**J. Policies dos perfis fiscais:** loop `DO $$` cria `*_delete USING(false)` e `REVOKE DELETE` em `product_fiscal_profiles`, `service_fiscal_profiles` e `customer_fiscal_profiles`. Nenhuma RPC de desativação foi criada — decisão consciente adiada até que exista fluxo demandando.

**K. Eventos:** `fiscal_events.notes text` com CHECK `char_length(notes) <= 2000`. `rpc_fiscal_event_manual(uuid,text,text)` reescrita: valida `auth.uid`, role em (admin/financeiro/gestor), `p_invoice_id` obrigatório e existente, `event_type` em allowlist, `notes` normalizada (`btrim`/`NULLIF`) e limitada. `event_source='USER'` e `performed_by=auth.uid()` gravados no servidor. INSERT/UPDATE/DELETE direto continua bloqueado por policies da 2.1. Nenhum erro silenciado.

**L. Mascaramento:** `mask_sensitive_jsonb` mantida recursiva de verdade (objeto → chave → valor recursivo; array → iteração). Cobre 17 termos sensíveis (authorization, token, access_token, refresh_token, password, senha, certificate, certificado, private_key, privatekey, secret, client_secret, pfx, p12, api_key, apikey, bearer). Match `position(term in lower(k))` — case-insensitive e parcial. Valor substituído por `'***REDACTED***'`. Contrato testado em `mask.test.ts` sem qualquer valor real.

**M. View de reconciliação:** `v_fiscal_document_reconciliation_pending` recriada com `security_invoker=true` e filtro explícito `has_role(auth.uid(),...)` para admin/gestor/financeiro. `REVOKE ALL FROM public, anon` + `GRANT SELECT TO authenticated`. Nenhuma exposição a cliente_produtor, administrativo ou parceiros.

**N. Testes:**
- `src/test/fiscal/fase3_0_2a.static.test.ts`: **23/23 verdes** (canonicalização, stub, FKs, NOT NULL, sem swallow, integridade de serviços, policies, RPC, máscara, view).
- Matriz RLS `src/test/fiscal/rls/matrix.ts` atualizada: DELETE dos 3 profiles → `deny`; `administrativo` removido de `fiscal_invoices`.
- Suíte fiscal completa: **50 passed | 4 skipped** (skips explícitos aguardando `PGURL_STAGING`).

**O. Typecheck:** `bun run typecheck` → **OK**.

**P. Build:** `bun run build` → **OK** (mesmo aviso pré-existente de chunk > 500 kB).

**Q. ESLint:** typecheck cobre o código TS; nenhum novo arquivo TS introduz erro (validado indiretamente pelo build sem warnings novos). Migração SQL não é analisada por ESLint.

**R. Riscos residuais:**
1. `service_fiscal_profiles` segue sem FK real até existir catálogo canônico — mitigado por CHECK e índice CI, mas ainda permite referência a serviço inexistente.
2. `NOT NULL` de `fiscal_events.fiscal_invoice_id` só será efetivo em staging/produção após execução; em bancos com órfãos legados a migration abortará (comportamento intencional).
3. Cancelamento de nota via status/evento ainda não tem RPC dedicada — apenas o caminho manual atual continua válido.
4. Migration não foi executada no projeto real (`navfzbwgwzruipouyfnk`) — ainda pendente de aplicação externa via CLI autenticada em staging isolado.

**S. Recomendação para Parte B:** **NÃO iniciar automaticamente.** Antes da Parte B, executar em staging isolado, coletar log de aplicação e apenas então registrar `supabase_migrations.schema_migrations` para `20260722000000`. Após esse retorno, autorizar Parte B.
