# Fase Fiscal 3.16 — Homologação preparada, rascunhos NF-e/NFS-e e certificado digital

## Objetivo

Deixar o módulo fiscal funcional para preencher, revisar e salvar todas
as informações necessárias à futura emissão de NF-e e NFS-e em ambiente
de **HOMOLOGAÇÃO**. Nada é transmitido; nenhum provedor é chamado.
`fiscalEmissionEnabled = false` e `production_enabled = false` permanecem.

## Arquivos

| Arquivo | Escopo |
| --- | --- |
| `src/config/featureFlags.ts` | Libera preparação/homologação; TRAVA de emissão intacta. |
| `src/config/navigation.ts` | Novo agrupamento fiscal (Prontidão, Perfis, Rascunhos). |
| `restoration/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql` | Migration canônica aditiva. **Não aplicada** — promover a `supabase/migrations/` após auditoria. |
| `src/lib/fiscal/rascunhoWizardValidation.ts` | Schemas Zod por etapa + agregador. |
| `src/hooks/useFiscalRascunho.ts` | RPC transacional de salvar + validar homologação. |
| `src/components/fiscal/documentos/RascunhoWizard.tsx` | Wizard 5 etapas em pt-BR. |
| `src/types/fiscalCertificateBridge.ts` | Contrato tipado `window.ARBioFiscalCertificateBridge`. |
| `src/lib/fiscal/certificateOsAdapter.ts` | Detecção do conector nativo + sanitização de metadados. |
| `src/components/fiscal/certificados/UploadCertificadoA1.tsx` | Upload seguro A1 (envia direto à Edge Function). |
| `supabase/functions/fiscal-certificate-upload/index.ts` | Edge Function admin-only para PKCS#12 + AES-256-GCM. |
| `supabase/functions/fiscal-certificate-revoke/index.ts` | Edge Function admin-only para revogação lógica. |
| `src/test/fiscal/fase3_16.static.test.ts` | Testes estáticos de estrutura, segurança e ausência de emissão. |

## Schema (aditivo)

### `public.fiscal_invoices` (colunas novas)
- `draft_version integer NOT NULL DEFAULT 1`
- `homologation_validation_status text` (`NOT_VALIDATED|READY|INCOMPLETE|BLOCKED`)
- `homologation_validation_at timestamptz`
- `homologation_validation_summary jsonb` — CHECK object, sem chaves sensíveis
- `customer_id uuid` — sem FK ainda (auditoria de órfãos pendente)

### `public.fiscal_certificates` (novo — só metadados)
Colunas: `id, company_settings_id, source_type, environment, status,
display_name, native_alias, subject_name, issuer_name, serial_number,
valid_from, valid_until, fingerprint_sha256, key_usage, is_active,
version, created_by/at, updated_at, revoked_by/at, revoke_reason`.

CHECKs: `source_type ∈ {SYSTEM_STORE, A1_UPLOAD}`, `environment ∈
{HOMOLOGATION, PRODUCTION}`, `status ∈ {NOT_CONFIGURED, AVAILABLE,
EXPIRED, REVOKED, ERROR}`, fingerprint hex de 64 chars quando presente.

Unicidade parcial: um ativo por `(company_settings_id, environment)`
com `is_active=true AND status='AVAILABLE'`.

RLS: read para administrador/gestor/financeiro; write só administrador;
DELETE físico sem policy (negado).

### `public.fiscal_certificate_material` (cofre)
`certificate_id, object_path, encrypted_password, password_iv,
material_iv, key_version, created_at`.

`REVOKE ALL FROM anon, authenticated`. `GRANT ALL TO service_role`.
RLS ativa, zero policies frontend. Acesso apenas server-side em Edge Functions.

### `public.v_fiscal_certificate_readiness`
View `security_invoker=true` com metadados sanitizados e `days_until_expiration`.

## RPCs

Todas `SECURITY DEFINER`, `search_path = public, pg_temp`, fail-closed.

- `rpc_fiscal_draft_save(p_invoice_id, p_invoice, p_items, p_expected_version) → jsonb` — transação: verifica role, rejeita status ≠ `DRAFT/HOMOLOGATION`, provider ≠ `NONE`, chaves sensíveis; reescreve itens, recalcula totais no servidor; concorrência via `draft_version`.
- `rpc_fiscal_draft_validate_homologation(p_invoice_id) → jsonb` — READ-ONLY. Retorna `READY | INCOMPLETE | BLOCKED`; nunca aceita status `AUTHORIZED/ISSUED`.
- `rpc_fiscal_certificate_register_os(p_company_settings_id, p_metadata) → uuid` — admin-only, insere metadados vindos do bridge do SO; desativa prévios ativos.
- `rpc_fiscal_certificate_revoke(p_certificate_id, p_reason) → void` — admin-only, revogação lógica.

## Edge Functions

### `fiscal-certificate-upload`
- Auth: JWT + `has_role(administrador)`.
- Aceita `.pfx`/`.p12`, ≤10 MB, valida magic bytes `0x30 0x82`.
- Valida PKCS#12 e senha com `node-forge`; extrai X.509 (subject, issuer, serial, validade, SHA-256).
- Rejeita expirado, inválido, senha errada, arquivo disfarçado.
- `FISCAL_CERTIFICATE_MASTER_KEY` (base64 32 bytes) — se ausente, retorna `CERTIFICATE_VAULT_NOT_CONFIGURED`.
- AES-256-GCM para material e senha; IVs aleatórios separados.
- Upload ciphertext ao bucket privado `fiscal-certificates` (path aleatório).
- Rollback: remove objeto se metadados falharem.
- CORS por allowlist (`FISCAL_CORS_ALLOWLIST`).
- Nunca loga body/senha/JWT/chave/service_role.

### `fiscal-certificate-revoke`
- Auth: JWT + `has_role(administrador)`.
- Busca `object_path`, chama RPC lógica, remove material físico do bucket.
- Idempotente.

## Bridge do sistema operacional

Contrato `window.ARBioFiscalCertificateBridge`:
- `isAvailable(): boolean`
- `listCertificates(): Promise<FiscalOsCertificateMetadata[]>` — apenas alias, subject, issuer, serial, validade, fingerprint, key usage
- `selectCertificate(alias): Promise<FiscalOsCertificateMetadata>`
- `getStatus(): Promise<FiscalOsBridgeStatus>`

**Nenhum método retorna PFX/senha/chave privada.** `signDigest` está
fora do escopo desta fase — será adicionado após homologação certificada
com o parceiro do conector nativo.

Se o bridge não estiver presente, a UI exibe em pt-BR: "Conector nativo
ARBio não detectado. Instale o conector futuro para acessar o
repositório de certificados do sistema operacional."

## Telas e permissões

| Rota | Administrador | Gestor | Financeiro |
| --- | --- | --- | --- |
| `/fiscal/prontidao` | leitura | leitura | leitura |
| `/fiscal/perfis/produtos` | rw | leitura | rw |
| `/fiscal/perfis/servicos` | rw | leitura | rw |
| `/fiscal/perfis/clientes` | rw | leitura | rw |
| `/fiscal/documentos` (rascunhos) | rw | leitura | rw |
| `/configuracoes/fiscal/empresa` (aba Certificado) | rw | leitura | leitura (upload negado) |

## Modelo de ameaça — A1

- **Ativo protegido**: material PKCS#12 e senha de proteção.
- **Superfície**: Edge Function admin-only; frontend nunca lê/persiste bytes ou senha.
- **Chave mestra**: `FISCAL_CERTIFICATE_MASTER_KEY` (32 bytes, base64) — segredo por ambiente, jamais no bundle. Comprometimento da chave implica reemissão do certificado.
- **Ciphertext em repouso**: bucket privado `fiscal-certificates`, sem policies frontend; nome aleatório impossibilita enumeração.
- **Metadata em `fiscal_certificate_material`**: acessível somente via service_role.
- **Transporte**: HTTPS obrigatório; JWT admin no cabeçalho.
- **Logs**: proibidos para senha/PFX/JWT/chave/service_role.
- **Rotação**: revogação lógica + remoção física do ciphertext.

## Secrets externos ainda necessários

- `FISCAL_CERTIFICATE_MASTER_KEY` — gerar com `secrets--generate_secret` (base64 de 32 bytes = 44 chars).
- `FISCAL_CORS_ALLOWLIST` — lista separada por vírgula com as origens autorizadas.

## Passos manuais pendentes (não realizados nesta fase)

1. Promover `restoration/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql` para `supabase/migrations/` via ferramenta de migração e aplicar em transação única em staging, depois produção.
2. Criar bucket privado `fiscal-certificates` (via `supabase--storage_create_bucket`, `public=false`).
3. Configurar secrets `FISCAL_CERTIFICATE_MASTER_KEY` e `FISCAL_CORS_ALLOWLIST`.
4. Deploy das Edge Functions `fiscal-certificate-upload` e `fiscal-certificate-revoke`.
5. Regenerar `src/integrations/supabase/types.ts` a partir do banco atualizado.
6. Auditoria de órfãos em `fiscal_invoices.customer_id` antes de ligar a FK opcional.

## Confirmação

- `fiscalEmissionEnabled` permanece **`false`**.
- `production_enabled` permanece invisível/imutável.
- Nenhum botão de Emitir/Transmitir/Autorizar/Cancelar/Consultar SEFAZ/prefeitura.
- Nenhuma chamada a provedor/SEFAZ/prefeitura em runtime.
- Nenhuma migration foi aplicada; nenhuma Edge Function foi deployada.

**Classificação: PREPARADO PARA APLICAÇÃO CONTROLADA.**
