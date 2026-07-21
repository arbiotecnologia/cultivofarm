# Fase Fiscal 2 — Fundação Fiscal Segura da AR Bio

**Data:** 2026-07-21
**Classificação:** APTO (fundação aditiva, sem emissão externa)
**Escopo:** somente estrutura interna preparatória. Nenhuma transmissão a SEFAZ, Focus NFe, NFS-e Nacional ou prefeitura.

---

## A. Snapshot prévio

Base fiscal completamente vazia no momento da aplicação:
- `fiscal_invoices`: 0 linhas
- `financial_documents`: 0 linhas
- Nenhum órfão, nenhuma duplicidade histórica.
- Enum `app_role` com 13 papéis; função `public.has_role(uuid, app_role)` presente.

Consequência: o backfill previsto não teve dados a corrigir, mas os defaults e checks estão prontos para futuros inserts.

## B. Migration aplicada

Arquivo: `restoration/fiscal_fase2_fundacao.sql` (aplicado via `psql` direto).

Transação única `BEGIN … COMMIT`. Sem `DROP` de coluna, sem renomeação, sem alteração de dado histórico.

## C. Tabelas criadas

| Tabela | Finalidade |
|---|---|
| `company_fiscal_settings` | Identidade fiscal única da AR Bio (singleton via índice parcial). |
| `product_fiscal_profiles` | Perfil fiscal por produto (perfil ativo único). |
| `service_fiscal_profiles` | Perfil fiscal por serviço; `service_id` ou `source_reference`. |
| `customer_fiscal_profiles` | Dados fiscais complementares por cliente. |
| `fiscal_invoice_items` | Itens do documento fiscal (vazio; sem backfill). |
| `fiscal_events` | Histórico e eventos internos; backfill `CREATED` retroativo (nenhum registro nesta base). |
| `fiscal_idempotency_keys` | Fundação de idempotência; sem geração automática. |
| `fiscal_audit_log` | Auditoria genérica das 8 tabelas fiscais. |

## D. Colunas adicionadas em `fiscal_invoices`

`document_model`, `document_origin`, `environment`, `provider`, `provider_reference`, `idempotency_key`, `normalized_status`, `provider_status_raw`, `source_type`, `source_id`, `parent_invoice_id`, `substitution_invoice_id`, `authorized_at`, `rejected_at`, `canceled_at`, `cancel_reason`, `reconciliation_status`, `company_snapshot`, `customer_snapshot`, `fiscal_totals_snapshot`, `payload_schema_version`, `locked_at`, `locked_by`, `company_cnpj`.

Colunas em `financial_documents`: `fiscal_invoice_id`, `document_origin`, `fiscal_event_id`, `file_category`, `environment`, `version_number` (todas nullable).

## E. Constraints e índices

Uniques **parciais** em `fiscal_invoices`:
- `(provider, environment, provider_reference)` quando `provider_reference IS NOT NULL`;
- `(idempotency_key)` quando presente;
- `(access_key)` quando presente;
- `(document_model, series, invoice_number, company_cnpj)` quando todos preenchidos.

Explicitamente **não** foi criado unique em `receivable_id` nem `delivery_id` (permite NF/NFSe múltiplas por AR e substituições).

Checks: `document_model ∈ {NFE,NFSE,OTHER}`, `document_origin ∈ {MANUAL_RECORD,EXTERNAL_IMPORTED,SYSTEM_PREPARED,PROVIDER_INTEGRATED}`, `environment ∈ {NOT_CONFIGURED,HOMOLOGATION,PRODUCTION}`, `normalized_status` conforme spec §8, `reconciliation_status ∈ {NOT_APPLICABLE,PENDING,RECONCILED,DIVERGENT,REQUIRES_REVIEW}`.

## F. Backfill

Nenhum dado histórico presente. Regras de backfill definidas ficam preparadas para dados futuros e para eventuais imports:
- `document_origin='MANUAL_RECORD'` para linhas sem origem;
- `normalized_status='LEGACY_RECORDED'` (nunca converte `ISSUED → AUTHORIZED`);
- `environment='NOT_CONFIGURED'`, `provider='NONE'`;
- `reconciliation_status='PENDING'` quando há `receivable_id`, `NOT_APPLICABLE` caso contrário.

## G–H. Preservação de `fiscal_invoices` e `financial_documents`

Todas as colunas originais preservadas; nenhum registro apagado, renomeado ou reclassificado. Apenas colunas nullable adicionadas.

## I. Identidade fiscal da AR Bio

Um registro `company_fiscal_settings` criado com:
- `configuration_status='DRAFT'`
- `nfe_enabled=false`, `nfse_enabled=false`, `production_enabled=false`
- `fiscal_provider='NONE'`, `fiscal_environment='NOT_CONFIGURED'`
- CNPJ, IE, IM, CNAE, CRT, séries e endereço permanecem `NULL` — devem ser preenchidos pela contabilidade da AR Bio.

## J–L. Perfis de produtos, serviços e clientes

Estruturas prontas. **Nenhum** registro semeado — evita classificação fiscal automática por suposição. Perfis novos nascem em `DRAFT`.

## M. Itens fiscais

`fiscal_invoice_items` criada vazia; itens de documentos futuros terão snapshot fiscal imutável a partir do momento de autorização (não aplicável nesta fase).

## N. Eventos fiscais

Enum inicial de `event_type` cobre ciclo interno + eventos de reconciliação. `event_source='LEGACY_BACKFILL'` reservado para linhas históricas. Payloads sensíveis (tokens/certificados) proibidos por convenção.

## O. Idempotência

`fiscal_idempotency_keys` com unique em `idempotency_key`. Estados `PENDING/LOCKED/COMPLETED/FAILED/EXPIRED`. Nenhuma chave gerada nesta fase.

## P. Reconciliação fiscal-financeira

`reconciliation_status` em `fiscal_invoices` e eventos preparados (`RECONCILIATION_REQUIRED`, `TOTAL_MISMATCH`, `CUSTOMER_MISMATCH`, `SOURCE_MISMATCH`, `REPLACEMENT_REQUIRED`, `DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED`). **Nenhuma** automação altera AR, parcelas, juros, entregas ou pedidos.

## Q. RLS e policies

RLS ativada em todas as tabelas criadas. Uso da função canônica `public.has_role(uuid, app_role)`.

| Tabela | SELECT | WRITE |
|---|---|---|
| `company_fiscal_settings` | administrador, gestor, financeiro | administrador |
| `product_fiscal_profiles` | administrador, gestor, financeiro | administrador, financeiro |
| `service_fiscal_profiles` | idem | idem |
| `customer_fiscal_profiles` | idem | idem |
| `fiscal_invoice_items` | administrador, gestor, financeiro, administrativo | administrador, financeiro |
| `fiscal_events` | administrador, gestor, financeiro | insert por administrador/gestor/financeiro |
| `fiscal_idempotency_keys` | administrador | — |
| `fiscal_audit_log` | administrador | — (populada por trigger `SECURITY DEFINER`) |

Parceiro B2B, parceiro B2B técnico, cliente produtor, técnico agronômico, aplicador, operador on-farm, produção e gestor comercial: **sem** acesso a nenhuma das novas tabelas.

## R. Permissões por perfil

Nenhuma permissão global (`src/lib/permissions.ts`) foi alterada. As policies acima são a única barreira de acesso a dados fiscais internos.

## S. Auditoria

Trigger `public.fiscal_audit_trigger` (SECURITY DEFINER, `search_path = public`) grava INSERT/UPDATE/DELETE de todas as 8 tabelas em `fiscal_audit_log`. Somente administrador lê. Payloads secretos não devem ser gravados nas tabelas fiscais (regra editorial).

## T. Alterações na interface

- `src/pages/financeiro/NotasFiscais.tsx`: subtítulo trocado de "Controle e emissão de documentos fiscais" para "Registro e acompanhamento de documentos fiscais".
- Novo componente `src/components/financeiro/FiscalReadinessBanner.tsx` exibindo aviso "Emissão integrada ainda não habilitada." mais indicadores lidos da view `v_fiscal_company_readiness`.
- **Nenhum** botão de emissão, upload de certificado, campo de token ou seletor de ambiente/produção foi adicionado.
- `FiscalTab`, `DocumentosPanel`, `HistoricoTab` e demais telas permanecem inalterados.

## U. Views de prontidão

`v_fiscal_company_readiness`, `v_product_fiscal_readiness`, `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`, `v_fiscal_document_reconciliation_pending`. Todas `SECURITY INVOKER` (padrão). Herdam RLS das tabelas subjacentes.

## V. Testes criados

- `src/test/fiscal/fase2.contract.test.ts`
  - garante ausência de tokens/certificados/URLs de provedores fiscais nos arquivos alterados e no SQL;
  - garante que o copy antigo foi removido;
  - garante presença do banner de aviso.

## W–Y. Validações

- `bun run typecheck`: **PASS**
- `bun run build`: **PASS**
- `bunx vitest run`: **PASS** (349 → 352 testes com os 3 novos)

## Z. Testes de RLS

Cobertura via convenção de policies. Testes de RLS em banco real dependem da suíte E2E autenticada — deixados para Fase Fiscal 2.1 se solicitado.

## AA. Resultado das migrations

SQL aplicado com sucesso, transação COMMIT limpa. Nenhum erro. Notícias apenas de `DROP … IF NOT EXISTS` (esperado).

## AB–AC. Lint

Arquivos alterados sem erros novos. Lint global segue o baseline histórico.

## AD. Ausência de chamadas externas

Verificada por teste automatizado (`fase2.contract.test.ts`). Nenhum endpoint fiscal introduzido, nenhuma Edge Function criada.

## AE. Ausência de tokens e certificados

`fetch_secrets` continua expondo apenas `LOVABLE_API_KEY` (managed). Nenhum secret fiscal foi criado.

## AF. Alterações fora do escopo

Nenhuma. Regras financeiras, motor B2B, entregas, estoque, produção e permissões gerais estão intactas.

## AG. Achados por severidade

- **Crítico:** 0
- **Alto:** 0
- **Médio:** 1 — perfis fiscais dependem de validação contábil externa antes de qualquer VALIDATED.
- **Baixo:** 1 — catálogo canônico de serviços inexistente; `service_fiscal_profiles.source_reference` cobre a lacuna temporariamente.

## AH. Riscos residuais

- Ativação futura de provedor exigirá secrets, certificado A1 e Edge Functions dedicadas — **fora desta fase**.
- Reconciliação automática AR ↔ NF será desenhada apenas após decisão contábil.

## AI. Dependências da contabilidade

- CNPJ, IE, IM, CNAE, CRT, séries, endereço fiscal da AR Bio;
- classificação NCM/CFOP/CST/CSOSN/PIS/COFINS/IPI dos produtos;
- item LC 116, CNAE, ISS e código municipal dos serviços;
- validação dos perfis (`VALIDATED`) somente após parecer contábil.

## AJ. Dependências de decisão da AR Bio

- Escolha de provedor fiscal (Focus NFe / SEFAZ direto / prefeitura);
- envio e custódia do certificado A1;
- decisão sobre emissão de NFS-e por município ou padrão nacional.

## AK. Recomendação para a Fase Fiscal 3

Após validação humana desta fase e recebimento dos dados contábeis:
1. Popular `company_fiscal_settings` com CNPJ/IE/CNAE/CRT reais (via UI restrita a administrador).
2. Iniciar cadastro de `product_fiscal_profiles` e `customer_fiscal_profiles` para o piloto.
3. **Só então** planejar Fase Fiscal 3 (integração de provedor em homologação) com:
   - definição do provedor,
   - custódia segura do certificado,
   - Edge Functions dedicadas (`prepare`, `issue`, `status`, `cancel`, `substitute`),
   - webhook assinado,
   - testes de idempotência reais.

Aguardar autorização humana específica para a Fase Fiscal 3. **Não iniciar automaticamente.**
