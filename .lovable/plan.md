# H7A — Auditoria pré-implementação: Módulo Fiscal e Certificado A1

Somente leitura. Nenhum arquivo de código, migration, função, banco ou produção foi alterado. Nenhum PFX foi manipulado e nenhuma senha foi solicitada.

## 0. Limitação de evidência (declarar antes de tudo)

A ferramenta de consulta SQL disponível nesta sessão responde por um projeto Supabase que **não é** `ikaauvsflpmamgxmkhoq`: a consulta de inventário retornou `0` tabelas `fiscal%` (só `company_fiscal_settings` e `entrega_conferencia_itens`), incompatível com as 34 tabelas fiscais criadas pelas migrations do repositório. Portanto:

- Todo o inventário abaixo é comprovado por **código e migrations versionadas**, não por leitura do staging.
- Qualquer afirmação sobre **estado de dados/RLS em runtime no staging** fica classificada como **a reconfirmar** na primeira etapa da H7b, após corrigir o binding.
- Produção `navfzbwgwzruipouyfnk` não foi consultada nem tocada.

## 1. Superfície de UI, rotas e perfis

Rotas em `src/config/navigation.ts` (todas `platforms: ["desktop"]`, seção Administração/Financeiro):
`/fiscal/prontidao` (flag `fiscalReadinessCenterUi`), `/configuracoes/fiscal/empresa|produtos|servicos|clientes`, `/fiscal/documentos` (rascunhos NF-e/NFS-e), `/financeiro/notas-fiscais`, `/financeiro/relatorios/nfe-pendente`.

Páginas/componentes: `src/pages/fiscal/{FiscalProntidao,FiscalDocumentos,FiscalReconciliacao}.tsx`, `src/pages/configuracoes/Fiscal{Empresa,Produtos,Servicos,Clientes}.tsx`, `src/components/fiscal/**` (certificados, documentos, sinief49, RTC, prontidão), ~20 hooks `useFiscal*`.

Flags (`src/config/featureFlags.ts`): emissão travada — `fiscalEmissionEnabled: false`, `fiscalDocumentManualEventRpc: false`, `fiscalReconciliationUi/Write: false`.

## 2. Objetos de banco (por migration)

34 tabelas fiscais/regulatórias criadas, entre elas: `company_fiscal_settings`, `product_fiscal_profiles`, `service_fiscal_profiles`, `customer_fiscal_profiles`, `microorganism_fiscal_profiles`, `fiscal_invoices`, `fiscal_invoice_items`, `fiscal_invoice_references`, `fiscal_events`, `fiscal_audit_log`, `fiscal_tax_rules`, `fiscal_operation_policies`, `fiscal_calculation_runs`, `fiscal_document_series`, `fiscal_number_reservations`, `fiscal_idempotency_keys`, `fiscal_certificates`, `fiscal_certificate_material`, `fiscal_xml_runs`, `fiscal_xsd_registry`, `fiscal_environment_marker`, `fiscal_stock_loss_contexts`, `fiscal_matrix_load_ledger`, `microorganism_regulatory_*`.

RPCs/funções relevantes: `rpc_fiscal_company_settings_init`, `rpc_fiscal_company_rtc_get/save`, `rpc_fiscal_draft_save`, `rpc_fiscal_draft_validate_homologation`, `rpc_fiscal_homologation_readiness_v2`, `rpc_fiscal_item_readiness`, `fn_fiscal_item_profile_gate_eval`, `fn_fiscal_environment_gate_v1`, `rpc_fiscal_event_manual` (+ `fn_fiscal_event_fingerprint_v1`), `rpc_fiscal_certificate_register_a1/_os`, `rpc_fiscal_certificate_revoke`, `rpc_fiscal_xml_record_v1`, `fiscal_audit_trigger`, `fiscal_sinief20_snapshot_immutable`, `regulatory_snapshot_immutable`, `rpc_financial_document_soft_delete`, `rpc_hml_fiscal_emit_mock` (**mock explícito**).

Migrations fiscais: 27 arquivos, de `20260721000000_fiscal_fase2_fundacao.sql` a `20260920000000_h7b_fiscal_idempotencia_ambiente_v1.sql`, mais `20260812000000` (quarentena F1), `20260814000000` (regulatório F2), `20260816000000/010000` (F3 cálculo e unicidade), `20260822000000` (F4 motor XML), `20260824000000` (matriz mestre), `20260919*` (H7 hardening + marcador).

## 3. Edge Functions fiscais

- `fiscal-preflight` — avaliação pura, `canTransmit: false` como tipo literal. Sem fetch externo.
- `fiscal-xml-engine` — gera XML NF-e 4.00, valida contra XSD oficial (`xsd/nfe_v4.00.xsd` via `xmllint-wasm`), assina e verifica XMLDSig; teto de estado `SIGNED`, `transmitted: false`. **Nenhuma transmissão SEFAZ.**
- `fiscal-certificate-upload` / `fiscal-certificate-revoke` — cofre A1.
- `fiscal-cnpj-lookup` — consulta cadastral.

NF-e real: **inexistente** (sem provider, SDK, endpoint SEFAZ, recibo/protocolo, cancelamento, CC-e, inutilização ou DANFE). NFS-e: **apenas cadastro** (perfis de serviço, ISS/LC116/CNAE, campos de município) — **nenhum webservice, RPS, lote, cancelamento ou credencial de prefeitura no código**. Scanners `scripts/fiscal-integration-scan.sh` e `fiscal-secrets-scan.sh` impedem integração prematura e segredo versionado.

## 4. Certificado A1 — mecanismo existente (já é o desenho seguro)

`fiscal_certificates` guarda **só metadados** (subject, issuer, serial, `valid_from/until`, `fingerprint_sha256`, `key_usage`, status, revogação); material cifrado fica em `fiscal_certificate_material` + bucket privado `fiscal-certificates`. O upload roda **inteiramente server-side** em `fiscal-certificate-upload`: CORS fail-closed por allowlist, JWT validado em código, `has_role(administrador)`, limite 10 MB, triagem ASN.1 (`asn1Screen.ts`, corrigida em H7c para BER `30 80`), parsing PKCS#12 com node-forge exigindo correspondência chave↔certificado, AES-256-GCM com IVs independentes para material e senha, registro atômico por RPC service-role e rollback do objeto em falha. Frontend (`UploadCertificadoA1.tsx`) não persiste nada; leitura só por `v_fiscal_certificate_readiness`.

**Conclusão: existe mecanismo seguro reutilizável — não criar novo.** Não há PFX no repo, no frontend, em tabela pública, storage público ou localStorage.

Bloqueio atual: `FISCAL_CERTIFICATE_MASTER_KEY` e `FISCAL_CORS_ALLOWLIST` ausentes ⇒ resposta `503 CERTIFICATE_VAULT_NOT_CONFIGURED` / `403 cors_origin_not_allowed` (fail-closed correto).

**Ponto exato em que a senha do PFX é necessária:** um único momento — o campo de senha do formulário `UploadCertificadoA1`, enviado por `multipart/form-data` à Edge Function, usado apenas para `forge.pkcs12.pkcs12FromAsn1` e imediatamente cifrado com AES-256-GCM. A senha nunca transita por SQL, log, repo ou navegador persistido.

**Testes possíveis antes da senha:** ASN.1/`asn1Screen` (13 testes já existentes), toda a suíte estática fiscal, XSD/gramática NF-e com fixtures sintéticas, gates de ambiente e idempotência, RLS/EXECUTE, UI e prontidão. Só assinatura real com A1, cadeia ICP e `valid_until` exigem o certificado.

## 5. Pontos fortes já verificados

- **Guard de ambiente duplo** (`20260919010000`): `fiscal_environment_marker` exige `environment_label='STAGING'` e `production_emission_allowed=false`, somado a `tpAmb=2` em `fn_fiscal_environment_gate_v1`.
- **Idempotência** (`20260920000000`): `rpc_fiscal_event_manual` exige `p_idempotency_key` (fail-closed), usa `pg_advisory_xact_lock` por documento e distingue replay idêntico de conflito por `payload_fingerprint`.
- **Snapshot imutável**: `fiscal_profile_snapshot`/`tax_snapshot` por item com whitelist de chaves e bloqueio de chave sensível; `FISCAL_SNAPSHOT_IMMUTABLE` impede recálculo com cadastro atual.

## 6. Findings e severidade

| ID | Sev | Finding |
| --- | --- | --- |
| H7A-001 | P1 | Binding da ferramenta de consulta não aponta para `ikaauvsflpmamgxmkhoq`; impossível confirmar RLS/GRANT/dados em runtime nesta auditoria. |
| H7A-002 | P1 | Segredos do cofre (`FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST`) ausentes: A1 não pode ser importado. |
| H7A-003 | P2 | Sem camada de transmissão: recibo/protocolo, cancelamento, CC-e, inutilização, contingência e DANFE inexistem — outbox/correlation_id ainda não modelados para transmissão. |
| H7A-004 | P2 | NFS-e permanece 100% externa e sem modelo de RPS/lote; convive com NF-e sem trilha unificada. |
| H7A-005 | P2 | `rpc_hml_fiscal_emit_mock` é mock de homologação e precisa de bloqueio explícito antes de qualquer emissão real. |
| H7A-006 | P3 | Códigos legais (CFOP, CST/CSOSN, alíquotas, CEST, natureza da operação) dependem de validação contábil — não inferir pelo sistema. |

## 7. Plano H7b / H7c / H7d (independentes e reversíveis)

- **H7b — Reconciliação de ambiente (sem emissão).** Corrigir binding para `ikaauvsflpmamgxmkhoq`, reexecutar postchecks H7 (11/11) e segurança (12/12), reconfirmar RLS/GRANT/anon EXECUTE, marcador de ambiente e ausência de dados de teste. Entrega: relatório de paridade. Reversível: nenhuma alteração de schema.
- **H7c — Ativação do cofre A1.** Provisionar os dois segredos, importar o PFX pela UI admin, validar `fingerprint_sha256`/`valid_until`/`status=AVAILABLE`, exercitar revogação e rotação, auditar que nada sensível vaza em logs. Reversível: revogar certificado e remover segredos.
- **H7d — Assinatura e XSD ponta a ponta em homologação.** Com A1 disponível, rodar `fiscal-xml-engine` de `generate` até `SIGNED` sobre documento real de homologação, validar XSD oficial e XMLDSig, congelar snapshot tributário, cobrir rejeições e concorrência em testes. **Parar antes de qualquer transmissão SEFAZ**; produção e `fiscalEmissionEnabled` permanecem desligados.

Pendências para o contador antes de H7d: CFOP e natureza da operação por cenário, CST/CSOSN sob lucro presumido, alíquotas PIS/COFINS/ICMS/IPI, CEST aplicável e enquadramento de IE/destinatário.

## 8. Confirmação

Nenhum código foi editado, nenhuma migration aplicada, nenhuma Edge Function implantada, nenhum dado alterado. Staging `ikaauvsflpmamgxmkhoq` e produção `navfzbwgwzruipouyfnk` permanecem intocados.
