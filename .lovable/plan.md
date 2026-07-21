## Fase Fiscal 2 — Fundação Fiscal Segura da AR Bio

Escopo estritamente aditivo, sem emissão externa, sem segredos, sem alterar módulos existentes. Todos os artefatos serão criados internamente e prontos para uma integração futura, mas nada será transmitido a Focus/SEFAZ/NFS-e.

### Snapshot prévio (read-only, antes das migrations)
- Contagem de `fiscal_invoices` por `status`, `invoice_type`, com/sem `receivable_id`, com/sem `access_key`.
- Contagem de `financial_documents` por `owner_type` e `document_type` (foco em `FISCAL_INVOICE`, `XML`, `DANFE`).
- Órfãos: `fiscal_invoices.receivable_id` sem AR correspondente; duplicidades atuais por `(invoice_number, series)` quando ambos preenchidos.
- Registrar tudo em `docs/fiscal-fase2-snapshot.md`.

### Migrations (aditivas, transacionais, idempotentes)
Uma migration por artefato lógico, todas em `supabase/migrations/2026072*_fiscal_fase2_*.sql`:

1. **`company_fiscal_settings`** — singleton via índice único parcial `WHERE is_active`; defaults seguros (`DRAFT`, `nfe_enabled=false`, `nfse_enabled=false`, `production_enabled=false`, `fiscal_environment='NOT_CONFIGURED'`, `fiscal_provider='NONE'`); **sem** popular CNPJ/IE/CNAE/CRT.
2. **`product_fiscal_profiles`** — FK para `products`, unique parcial de perfil ativo por produto, estados `DRAFT|PENDING_ACCOUNTING|VALIDATED|BLOCKED|NOT_FISCALLY_SOLD`, todos os campos tributários nullable.
3. **`service_fiscal_profiles`** — `service_id` nullable + `source_reference` textual (lacuna documentada de catálogo canônico de serviços).
4. **`customer_fiscal_profiles`** — complementar a `clientes`, sem sobrescrever endereço principal, sem consulta externa.
5. **Evolução de `fiscal_invoices`** — `ADD COLUMN IF NOT EXISTS` para todas as colunas listadas na spec §8; nenhuma coluna existente removida/renomeada. Backfill:
   - `document_origin = 'MANUAL_RECORD'` para linhas atuais;
   - `normalized_status = 'LEGACY_RECORDED'` (não converte `ISSUED → AUTHORIZED`);
   - `environment = 'NOT_CONFIGURED'`, `provider = 'NONE'`;
   - `reconciliation_status = 'NOT_APPLICABLE'` quando `receivable_id IS NULL`, senão `PENDING`.
6. **Constraints de duplicidade** — índices `UNIQUE` **parciais**:
   - `(provider, environment, provider_reference) WHERE provider_reference IS NOT NULL`;
   - `(idempotency_key) WHERE idempotency_key IS NOT NULL`;
   - `(access_key) WHERE access_key IS NOT NULL`;
   - `(document_model, series, invoice_number, company_cnpj) WHERE todos NOT NULL`.
   - **Não** criar unique em `receivable_id` nem `delivery_id`.
7. **`fiscal_invoice_items`** — vazia; não backfill em históricos.
8. **`fiscal_events`** — inserir evento `CREATED` retroativo apenas para linhas manuais existentes com `event_source='LEGACY_BACKFILL'`, sem payloads sensíveis.
9. **`fiscal_idempotency_keys`** — só a estrutura + índice único em `idempotency_key`.
10. **Metadados aditivos em `financial_documents`** — `fiscal_invoice_id`, `document_origin`, `fiscal_event_id`, `file_category`, `environment`, `version_number` (todos nullable). Nenhum arquivo movido.
11. **Views de prontidão** (SECURITY INVOKER, respeitam RLS): `v_fiscal_company_readiness`, `v_product_fiscal_readiness`, `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`, `v_fiscal_document_reconciliation_pending`.
12. **GRANTS obrigatórios** em cada nova tabela (`authenticated`, `service_role`) — sem `anon`.
13. **RLS** ativada em todas as novas tabelas, usando `public.has_role(auth.uid(), ...)` já existente. Matriz por papel conforme spec §15. Parceiros B2B e clientes produtores sem acesso às configurações/perfis internos; cliente vê apenas seus próprios `financial_documents` já regidos por policy atual (não alterada).
14. **Trigger de auditoria** genérica gravando em `fiscal_audit_log` (nova) para as 8 tabelas — sem payloads secretos.

Rollback: cada migration termina com bloco comentado `-- ROLLBACK:` descrevendo `DROP` reverso.

### Alterações mínimas de interface (frontend)
- `src/pages/financeiro/NotasFiscais.tsx`: trocar `"Controle e emissão de documentos fiscais"` por `"Registro e acompanhamento de documentos fiscais"` + aviso `"Emissão integrada ainda não habilitada."`.
- Novo componente `FiscalReadinessBanner` lendo as 4 views de prontidão, exibido no topo de `NotasFiscais` e em `Configuracoes.tsx` (aba Financeiro).
- **Nenhum** botão de emissão, upload de certificado, campo de token ou seletor de ambiente/produção.

Nenhuma outra tela é tocada. `FiscalTab`, `DocumentosPanel`, `HistoricoTab` permanecem idênticos.

### Testes
Adicionar em `src/test/fiscal/`:
- `fiscal.migrations.contract.test.ts` — presença das novas tabelas/colunas via `information_schema` (mock) e defaults.
- `fiscal.backfill.test.ts` — nenhuma linha antiga com `normalized_status='AUTHORIZED'`; todas com `document_origin='MANUAL_RECORD'`.
- `fiscal.duplicity.constraints.test.ts` — permite múltiplas NF por `receivable_id`; bloqueia mesma `access_key` duplicada.
- `fiscal.rls.parceiro.test.ts` / `fiscal.rls.cliente.test.ts` — negam leitura de `company/product/service/customer_fiscal_profiles`, `fiscal_events`, `fiscal_idempotency_keys`.
- `fiscal.ui.copy.test.tsx` — copy antigo ausente, aviso novo presente.
- `fiscal.no-external-calls.test.ts` — grep no diff por `FOCUS_`, `SEFAZ`, `NFSE_TOKEN`, `.pfx`, `.p12`, `CERT_PASSWORD`, `Authorization: Bearer`.

### Validações finais
`bun run typecheck`, `bun run build`, `bunx vitest run`, `bun run lint` (registro), grep de segurança, verificação de secrets (`fetch_secrets`) confirmando ausência de segredos fiscais.

### Entregáveis
- Migrations em `supabase/migrations/`
- Regeneração de `src/integrations/supabase/types.ts`
- Alterações mínimas em `NotasFiscais.tsx` + novo `FiscalReadinessBanner.tsx`
- Testes novos em `src/test/fiscal/`
- Relatório em `docs/fiscal-fase2-relatorio.md` cobrindo itens A–AK
- Snapshot em `docs/fiscal-fase2-snapshot.md`

### Fora de escopo (bloqueado)
Emissão real, Focus/SEFAZ/NFS-e, certificados, tokens, secrets fiscais, Edge Functions fiscais, mudanças em regras financeiras/motor B2B/entregas/estoque, ativação de produção, unicidade em `receivable_id`/`delivery_id`.

Aguardando autorização explícita para executar. Confirma que aplico as migrations diretamente via a connection string já fornecida ou prefere revisar cada SQL antes?
