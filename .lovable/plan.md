## Fase Fiscal 3.16.2-B — Plano de execução

Escopo estrito das 6 pendências apontadas pela auditoria. Nada além será tocado.
Migration `20260724000000` ainda não aplicada → pode ser corrigida no lugar.
Sem deploy Edge, sem habilitar emissão/produção, sem provedor.

---

### 1. Certificado do SO no `CertificadoDigitalSecao`
`src/components/fiscal/certificados/CertificadoDigitalSecao.tsx`
- Dois cards lado a lado: **A1 (upload)** e **Sistema Operacional (bridge)**.
- Card SO usa `probeOsBridge`/`listOsCertificatesSafe` do `certificateOsAdapter`.
- Botão "Registrar no cofre" chama nova mutation `useRegisterOsCertificate` → RPC `rpc_fiscal_certificate_register_os`.
- Se `probeOsBridge()` retornar `available:false`, exibe mensagem pt-BR do conector nativo (não simula).
- Nova prop `canManageCertificates: boolean` substitui `canEdit` para gates de escrita (upload/revogar/registrar SO). `canEdit` permanece para visualização da seção.

### 2. Restringir gestão de certificados a administrador
`src/pages/configuracoes/FiscalEmpresa.tsx`
- Calcular `const canManageCertificates = roles.includes("administrador")` a partir de `useAuth().roles`.
- Passar ao `CertificadoDigitalSecao`. `financeiro`/`gestor` continuam vendo, mas sem botões de escrita.

### 3. Hardening do `rpc_fiscal_certificate_register_os`
`supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql`
- Whitelist de chaves em `p_metadata` (rejeita qualquer chave fora de: display_name, native_alias, subject_name, issuer_name, serial_number, valid_from, valid_until, fingerprint_sha256, key_usage).
- Limites: display_name ≤120, native_alias ≤200, subject/issuer_name ≤500, serial_number ≤128.
- `fingerprint_sha256` obrigatório, 64 hex minúsculos (regex `^[0-9a-f]{64}$`).
- `valid_from < valid_until`, e `valid_until > now()` (bloqueia expirado).
- Bloqueia environment `PRODUCTION` (sempre `HOMOLOGATION` nesta fase).
- Mantém REVOKE de anterior + GRANT `authenticated` (usa `has_role` interno).

### 4. Wizard com campos fiscais reais
`src/components/fiscal/documentos/RascunhoWizard.tsx` + `src/lib/fiscal/rascunhoWizardValidation.ts`
- `itemSchema` estendido com: `cest`, `cfop`, `icms_cst`, `icms_csosn`, `ipi_cst`, `pis_cst`, `cofins_cst`, `origin_code`, `lc116_item`, `cnae`, `municipal_taxation_code`, `iss_rate`, `iss_withheld`, `fiscal_profile_snapshot`, `tax_snapshot`.
- Novo passo "Tributos por item" (ou expansão no passo "Itens"): inputs pt-BR para os campos acima, condicionados a NF-e/NFS-e.
- Ao selecionar produto/serviço (novos pickers `ProdutoPicker`/`ServicoPicker` usando `useProductFiscalProfiles`/`useServiceFiscalProfiles`), preenche automaticamente os campos e monta `fiscal_profile_snapshot` (perfil sanitizado, sem PII) e `tax_snapshot` (aliquotas/CST computados).
- Sem UUID manual: campo "ID do cliente" removido; permanece apenas via `ClientePicker`.

### 5. Persistência de snapshots por item
`src/hooks/useFiscalRascunho.ts`
- `itemsPayload` inclui `fiscal_profile_snapshot` e `tax_snapshot` por item.

`supabase/migrations/20260724000000_...sql` — `rpc_fiscal_draft_save`
- `v_computed_items` inclui `fiscal_profile_snapshot` e `tax_snapshot` de cada item (rejeita `sensitive_key_in_snapshot`).
- `INSERT INTO fiscal_invoice_items` grava `fiscal_profile_snapshot`, `tax_snapshot`.

`rpc_fiscal_draft_validate_homologation`
- Para cada item PRODUCT: exige `fiscal_profile_snapshot` não-vazio com `ncm`.
- Para cada item SERVICE: exige `fiscal_profile_snapshot` com `lc116_item` e `cnae`.
- Mensagens pt-BR por item (`Item N sem perfil fiscal…`).

### 6. Rotulação pt-BR
`src/pages/fiscal/FiscalDocumentos.tsx`
- Novo módulo `src/lib/fiscal/documentLabels.ts` com maps para `document_model`, `document_origin`, `normalized_status`, `status`, `environment`, `reconciliation_status`, `invoice_type`, `item_kind`.
- Tabela de listagem e filtros exibem rótulos pt-BR (mantendo `value` técnico interno).
- `SelectItem` mostra label pt-BR; badges idem.

### 7. Testes (`src/test/fiscal/fase3_16.static.test.ts`)
Novas asserções:
- `rpc_fiscal_certificate_register_os`: whitelist + regex fingerprint + validade + bloqueio PRODUCTION.
- Wizard contém labels pt-BR "NCM", "CFOP", "LC116", "CNAE", "ISS".
- `useFiscalRascunho` envia `fiscal_profile_snapshot`/`tax_snapshot` por item.
- Migration `rpc_fiscal_draft_save`: `fiscal_profile_snapshot`/`tax_snapshot` no INSERT de itens.
- `rpc_fiscal_draft_validate_homologation`: mensagens por item (`Item %`).
- `documentLabels.ts` existe e não expõe enum cru na tela.

### Validação
`bun run typecheck`, `bun run build`, `bunx vitest run`.
Sem migrations aplicadas. Sem alterações em rotas/permissões/dependências.

### Fora de escopo
Aplicação da migration, deploy de Edge Function, ativação de emissão, criação de novas rotas, alteração de RLS de outras tabelas.
