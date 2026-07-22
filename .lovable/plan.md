
# Fase Fiscal 3.16 — Homologação preparada, rascunhos NF-e/NFS-e e certificado digital

Escopo: preparar todo o módulo fiscal para homologação (NF-e e NFS-e) com wizard em pt-BR, migration canônica aditiva, tabela/edge functions de certificado digital (SO + A1). **Sem aplicar migration, sem deploy de Edge Functions, sem emissão, sem chamadas a SEFAZ/prefeitura/provedor.** `fiscalEmissionEnabled=false` e `production_enabled=false` permanecem trancados.

## Premissas confirmadas pela auditoria prévia

- Fases 3.0–3.15 já certificadas (paridade staging↔prod, RLS harness 677/677, 1060 testes verdes).
- `company_fiscal_settings`, `fiscal_invoices`, `fiscal_invoice_items`, `fiscal_events`, `fiscal_audit_log`, perfis fiscais e views de prontidão já existem e estão tipados.
- `fiscal-preflight` Edge Function existe e é `PRECHECK_ONLY` — reuso obrigatório, nada de duplicar lógica.
- Central de Configuração Fiscal (3.15) já tem abas Empresa/NF-e/NFS-e/Integração/Revisão — a fase 3.16 estende, não substitui.

## 1. Feature flags (`src/config/featureFlags.ts`)

Habilitar apenas o mínimo:
- `fiscalConfigurationUi` ✓ (já true)
- `fiscalProductProfilesUi` → true
- `fiscalServiceProfilesUi` → true
- `fiscalCustomerProfilesUi` → true
- `fiscalDocumentWorkflowUi` → true
- `fiscalReadinessCenterUi` → true

Permanecem `false`: `fiscalEmissionEnabled`, `fiscalReconciliationWrite`, `fiscalReconciliationUi`, `fiscalDocumentManualEventRpc` (sem justificativa nesta fase — eventos manuais continuam bloqueados até certificação separada).

## 2. Navegação (`src/config/navigation.ts`)

Novo grupo **Fiscal** (rótulo pt-BR, pesquisável) com itens visíveis a `administrador` (rw) e `financeiro` (rw exceto certificado), `gestor` (r):

1. Visão Geral Fiscal — `/fiscal/prontidao` (já existe)
2. Configuração da Empresa — `/configuracoes/fiscal/empresa` (já existe)
3. Produtos — `/fiscal/perfis/produtos`
4. Serviços — `/fiscal/perfis/servicos`
5. Clientes — `/fiscal/perfis/clientes`
6. Rascunhos de NF-e e NFS-e — `/fiscal/documentos` (renomeado; página refatorada)

**Não remover** o item "Notas Fiscais" (financeiro/acompanhamento). Documentar a diferença em `docs/notas-fiscais-modulo.md` (nota curta).

## 3. Wizard de rascunho — `src/pages/fiscal/FiscalDocumentos.tsx`

Refator para "Preparação de NF-e e NFS-e — Homologação". Preserva lista, detalhes, timeline, auditoria existentes.

Novo componente `src/components/fiscal/documentos/RascunhoWizard.tsx` com 5 etapas:

1. **Documento** — tipo NF-e/NFS-e, modelo (55/NFS-e), ambiente (fixo `HOMOLOGATION` ou `NOT_CONFIGURED`), natureza, finalidade, presença, consumidor final, série, data emissão, vínculo opcional a receivable/entrega, observações.
2. **Destinatário** — combobox de clientes reais; carrega perfil fiscal + endereço; CPF/CNPJ mascarado em listas (`***.***.***-##`), exibido integral apenas com role autorizada; IE/contribuinte, IM, e-mail, telefone, endereço + IBGE; gera `customer_snapshot` no salvamento.
3. **Itens / Serviços** — CRUD + reordenação de `fiscal_invoice_items`; escolha produto ou perfil de serviço; campos NF-e (NCM/CEST/origem/CFOP/CST-CSOSN, PIS, COFINS, IPI) ou NFS-e (item LC116, CNAE, cód. tributação nacional/municipal, ISS, retenção, município IBGE); gera `fiscal_profile_snapshot` + `tax_snapshot` imutáveis no rascunho.
4. **Tributos e Totais** — bases, ICMS, IPI, PIS, COFINS, ISS, retenções, desconto, frete, seguro, outras despesas, total; aviso "Cálculos preparatórios sujeitos a validação contábil"; gera `fiscal_totals_snapshot`.
5. **Revisão** — checklist pt-BR, avisos por aba/campo, botões:
   - **Salvar rascunho** (RPC nova).
   - **Validar para homologação** (RPC somente-leitura — chama preflight interno / leituras locais). Resultado: Pronto / Incompleto / Bloqueado.
   - **Nenhum** botão de transmissão/emissão/autorização.

Restrição: `status ∈ {DRAFT, HOMOLOGATION}`, `document_origin ∈ {MANUAL_RECORD, NOT_CONFIGURED, HOMOLOGATION}`, `provider = NONE`, `access_key = null`, `provider_reference = null`.

Hooks/schemas: novos arquivos tipados, sem `any`/`as unknown as`:
- `src/lib/fiscal/rascunhoWizardValidation.ts` (Zod por etapa + agregador).
- `src/hooks/useFiscalRascunho.ts` (leitura por id, CRUD itens via RPC, salvar rascunho, validar homologação — concorrência por `draft_version`).

## 4. Migration canônica aditiva

Arquivo real: `supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql`
Stub: `restoration/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql` (apenas comentário documental, rejeitado pelo teste estático se executável).

Alterações **aditivas** em `fiscal_invoices`:
- `draft_version integer NOT NULL DEFAULT 1`
- `homologation_validation_status text NOT NULL DEFAULT 'NOT_VALIDATED'` (enum textual: `NOT_VALIDATED`, `READY`, `INCOMPLETE`, `BLOCKED`)
- `homologation_validation_at timestamptz`
- `homologation_validation_summary jsonb NOT NULL DEFAULT '{}'` + CHECK `jsonb_typeof = 'object'` + CHECK `NOT fiscal_json_has_sensitive_key(...)` (função já existe de 3.15).
- `customer_id uuid` **sem** FK ainda — auditoria de órfãos primeiro; adicionar apenas se contagem zero (comentado no SQL com pré-check `DO $$`).

**Novos objetos:**

- `public.fiscal_certificates` (metadados apenas — colunas conforme spec §5, sem senha/PFX/chave). CHECK constraints, unicidade parcial "um ativo por (company_settings_id, environment)".
- `public.fiscal_certificate_material` (só service_role): `certificate_id`, `object_path`, `encrypted_password`, `password_iv`, `material_iv`, `key_version`, `created_at`. `REVOKE ALL FROM anon, authenticated;` `GRANT ALL ON ... TO service_role;` RLS ligada, **zero policies**.
- View sanitizada `public.v_fiscal_certificate_readiness` com `security_invoker=true` (fonte, status, validade, dias restantes; sem material).
- Bucket privado `fiscal-certificates` via `supabase--storage_create_bucket` **após** aplicação da migration (não nesta execução) — documentado no relatório e stub SQL como TODO manual.

**RPCs (todas `SECURITY DEFINER`, `search_path = public, pg_temp`, fail-closed, admin/financeiro conforme cada caso):**

- `rpc_fiscal_draft_save(p_invoice jsonb, p_items jsonb[], p_expected_version int)` — transação: valida payload, recalcula totais no servidor, grava snapshots, bloqueia se `status ∉ {DRAFT, HOMOLOGATION}` ou `provider ≠ NONE`, retorna nova versão. Optimistic lock por `draft_version`.
- `rpc_fiscal_draft_validate_homologation(p_invoice_id uuid)` — **read-only**, chama helpers internos; retorna JSONB `{status, checklist[]}`. Nunca aceita status `AUTHORIZED/ISSUED`.
- `rpc_fiscal_certificate_register_os(p_company_settings_id uuid, p_metadata jsonb)` — admin-only, insere metadados vindos do bridge do SO; verifica assinatura/formato dos campos.
- `rpc_fiscal_certificate_revoke(p_certificate_id uuid, p_reason text)` — admin-only, logical delete.

Nenhuma RPC concede rota para `AUTHORIZED/ISSUED`. Trigger de auditoria em `fiscal_certificates` grava apenas metadados sanitizados (reusa padrão 3.15).

## 5. Bridge do certificado do sistema operacional

- `src/types/fiscalCertificateBridge.ts` — contrato `window.ARBioFiscalCertificateBridge` opcional (`isAvailable`, `listCertificates`, `selectCertificate`, `getStatus`). Retornos: apenas alias/subject/issuer/serial/validade/fingerprint. **Nenhum** método de assinatura implementado nesta fase.
- `src/lib/fiscal/certificateOsAdapter.ts` — detecção, fallback pt-BR "instale o conector nativo ARBio".
- UI dentro de `FiscalEmpresa.tsx` (aba Integração) — cartão "Repositório do sistema operacional" listando aliases; ação "Registrar metadados" chama `rpc_fiscal_certificate_register_os`.

## 6. Fluxo A1 — Edge Functions

**`supabase/functions/fiscal-certificate-upload/index.ts`** (não deployada nesta execução):
- JWT admin verificado via `getClaims` + `has_role`.
- `multipart/form-data`, aceita `.pfx`/`.p12`, ≤10 MB, MIME `application/x-pkcs12` ou octet-stream com magic bytes conferidos.
- Senha em memória; nunca logada.
- Valida PKCS#12 usando `node-forge` via `npm:node-forge@1` (Deno), extrai X.509 (subject, issuer, serial, validade, SHA-256), rejeita expirado/inválido/cadeia ausente.
- AES-256-GCM (`crypto.subtle`) para material e senha; IVs aleatórios separados; `FISCAL_CERTIFICATE_MASTER_KEY` (base64 32B) — se ausente/malformada, retorna `CERTIFICATE_VAULT_NOT_CONFIGURED`.
- Upload do ciphertext ao bucket privado `fiscal-certificates` (nome random UUID); grava metadados via service_role.
- Rollback: se `fiscal_certificate_material` insert falhar, remover objeto.
- CORS por allowlist (env `FISCAL_CORS_ALLOWLIST`).
- Nunca loga body/senha/JWT/chave/service_role.

**`supabase/functions/fiscal-certificate-revoke/index.ts`** — admin-only, remove objeto do bucket, marca metadado revogado, idempotente, auditável.

**Sem** função de descriptografia/assinatura nesta fase.

**Frontend A1** — `src/components/fiscal/certificados/UploadCertificadoA1.tsx`:
- Input arquivo `accept=".pfx,.p12"`, senha `type=password` `autocomplete=new-password`.
- Aviso pt-BR de segurança.
- Chama `supabase.functions.invoke('fiscal-certificate-upload')`.
- Limpa `File` + senha da memória em `finally`.
- Se function retornar `CERTIFICATE_VAULT_NOT_CONFIGURED`, exibe "Cofre de certificados ainda não configurado".
- Lista metadados + ação "Revogar" (confirmação).

## 7. Integração na Central Fiscal

Aba Integração e Segurança (`FiscalEmpresa.tsx`) — nova seção "Certificado digital":
- Select fonte: Não configurado / Sistema operacional / A1 armazenado com segurança.
- Card certificado ativo (nome, validade, dias restantes, fonte).
- Status conector nativo (do bridge).
- Status cofre A1 (via probe leve — apenas verifica existência do secret configurado, exposta por hook seguro).
- Bloqueio "Pronto para homologação" quando estratégia futura exigir certificado e nenhum estiver ativo.
- `production_enabled` invisível e imutável.

## 8. Testes

Novos arquivos em `src/test/fiscal/`:
- `fase3_16.static.test.ts` — flags, ausência de botões emitir/transmitir/produção, rotas visíveis por papel, textos pt-BR, ausência de fetch a provedor.
- `fase3_16.wizard.test.tsx` — cada etapa renderiza, salvar rascunho chama RPC correta, validar homologação read-only, nenhum status `AUTHORIZED`.
- `fase3_16.certificado.test.ts` — schemas Zod, adapter OS retorna só metadados, upload A1 limpa senha da memória, componente exibe fallback quando vault não configurado.
- `fase3_16.migration.test.ts` — canônica em `supabase/migrations/`, stub em `restoration/` sem SQL executável, sem GRANT anon em `fiscal_certificate_material`, `fiscal_certificates` com CHECK de fonte/status.
- `fase3_16.edge.test.ts` — parsing estático da função upload: rejeita >10MB, valida MIME, exige master key, nunca chama console.log com senha/body.

Rodar após implementação: `bun run typecheck`, `bunx vitest run`, `bun run build`.

## 9. Relatório

`docs/fiscal-fase3-16-homologacao-certificados.md` cobrindo:
- arquivos criados/alterados, schema aditivo, RPCs, Edge Functions;
- telas, permissões, campos NF-e/NFS-e;
- fluxo SO, fluxo A1 (com modelo de ameaça);
- secrets externos pendentes (`FISCAL_CERTIFICATE_MASTER_KEY`, `FISCAL_CORS_ALLOWLIST`);
- passos manuais pendentes (aplicar migration, criar bucket privado, deploy das duas edge functions, gerar master key com `secrets--generate_secret` de 44 chars base64);
- confirmação: produção/emissão bloqueadas, `fiscalEmissionEnabled=false`, `production_enabled=false`.

Classificação final: **PREPARADO PARA APLICAÇÃO CONTROLADA** apenas se typecheck + build + Vitest verdes.

## Fora do escopo

- Deploy de qualquer Edge Function.
- Aplicação de migration em staging/produção.
- Criação real do bucket (documentada como passo manual).
- Função de assinatura digital / emissão / transmissão.
- Habilitar `fiscalEmissionEnabled` ou `production_enabled`.
- Ampliar policies certificadas em 3.11/3.12.

## Confirmação

Aguardando aprovação para iniciar a implementação estrita desta fase.
