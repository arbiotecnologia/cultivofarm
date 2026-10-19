# Inventário de callers — 19/10/2026, somente leitura

| owner_type | Parent canônico | Caller/contrato observado |
|---|---|---|
| RECEIVABLE | accounts_receivable | DocumentosPanel via DocumentosReceberTab/ContaDrawer; financial-docs OWNER/UUID/file |
| PAYABLE | accounts_payable | DocumentosPanel via ContaDrawer; mesmo path |
| PAYMENT_RECEIVABLE | receivable_payments | DocumentosPanel/DocumentosReceberTab; BaixaDialog→anexarComprovanteBaixa |
| PAYMENT_PAYABLE | payable_payments | BaixaDialog→anexarComprovanteBaixa; mesmo owner parent |
| DELIVERY | entregas | ConfirmarEntregaFinanceiroDialog→DocumentosPanel, upload atualmente desabilitado; metadata parent válida não concede Storage |
| FISCAL_INVOICE | fiscal_invoices | FiscalTab/NotasFiscais→DocumentosPanel; financial-docs OWNER/UUID/file |
| FINANCIAL_RECEIPT | financial_receipts | Tipo em constraint atual; sem INSERT metadata localizado em runtime/pg_proc. generate-financial-receipt grava arquivo/locator no parent em financial-receipts, não financial_documents |
| REPORT_EXPORT | financial_report_exports | Tipo em constraint atual; sem INSERT metadata localizado. generate-financial-report usa financial-reports e register_financial_report_export no parent, não financial_documents |

Todos oito parents possuem organization_id. Os dois últimos também storage_bucket/storage_path; candidata exige locator exato já registrado no parent e bucket esperado, sem criar canal novo. FINANCIAL_RECEIPT/REPORT_EXPORT têm **zero registros live** no snapshot agregado, não declarar compatibilidade com writer externo não capturado.

Leitores: DocumentosReceberTab, ContasReceber, ContasPagar e AuditoriaFinanceira; nenhuma alteração frontend nesta fase. Writer RPC localizado: rpc_financial_document_soft_delete; triggers auditam mas não validam owner. Captura pg_proc buscou corpos INSERT/UPDATE financial_documents, incluindo schemas public/platform_private; SQL dinâmico externo não é inventário completo garantido.

**Pendência preexistente não corrigida aqui:** anexarComprovanteBaixa.ts ainda monta organization_id/OWNER/UUID/idempotency-name e upsert true, incompatível com Storage owner-first atual. Isso já falha na emissão Storage antes da metadata; não aceitar esse prefixo como contrato novo nem mudar frontend nesta candidata SERVER. Positivos de pagamento locais usam o path canônico do DocumentosPanel. Revisão desse caller requer recorte próprio autorizado.

Service Edges existentes não inserem metadata financial_documents: receipt atualiza financial_receipts e report registra financial_report_exports. Candidata preserva esses writers intactos. INSERT service de metadata com UID ausente exige papel DB service_role (não claim editável), organization explícita e parent/path consistentes. Com UID presente exige h15/staff e uploaded_by self. Legado orgNULL permanece invisível/nega escrita; sem atribuição/backfill. Softdelete de legacy locator inalterado permite somente transição tombstone de parent/tenant válidos, sem reparenting/alterar autor.