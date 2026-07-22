
# Fase Fiscal 3.16.1 — Plano de correção

Escopo restrito à Fase 3.16. **Nada aplicado em banco, nenhuma Edge deployada, sem provedor externo, sem produção.** Travas `fiscalEmissionEnabled=false`, `fiscalReconciliationWrite=false`, `production_enabled=false` permanecem.

## 1. Canonicalidade da migration

- Mover SQL executável para `supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql`.
- Em `restoration/migrations/20260724000000_...sql` deixar **stub documental** (comentários apontando ao canônico); sem `BEGIN`, `CREATE TABLE`, `ALTER`, `POLICY`, `FUNCTION`.
- Ajustar `src/test/fiscal/fase3_16.static.test.ts`:
  - `CANONICAL_MIGRATION` → `supabase/migrations/...`.
  - `RESTORATION_STUB` → `restoration/migrations/...` (asserção de ausência de SQL executável).

## 2. Correção da migration (antes da primeira aplicação)

- `fiscal_invoices.customer_id` → **FK real** para `public.clientes(id) ON DELETE RESTRICT`.
- `fiscal_certificates.company_settings_id` → `ON DELETE RESTRICT` (não CASCADE).
- Criação idempotente do bucket privado `fiscal-certificates` na migration (public=false, 10 MB).
- Zero policy em `storage.objects` para anon/authenticated (material só via service_role).
- Trigger de auditoria: remover `EXCEPTION WHEN OTHERS THEN NULL`, derivar `changed_by` de `auth.uid()`/`created_by`, e **não** logar alias, object_path, senha, IV ou material.
- View sanitizada continua `security_invoker=true`, sem expor caminhos/segredos.

## 3. RPCs de rascunho — servidor como fonte da verdade

`rpc_fiscal_draft_save`:
- Escrita só `administrador`/`financeiro`; `gestor` valida/lê.
- Servidor força: `provider='NONE'`, `status='DRAFT'`, `normalized_status='DRAFT'`, `document_origin='MANUAL_RECORD'`, `environment ∈ {HOMOLOGATION, NOT_CONFIGURED}`.
- Rejeita `access_key`, `provider_reference`, `protocol`, `authorization`, `xml`, `danfe` e afins.
- `p_items`: array, 1–500, `item_kind` coerente (NF-e produto / NFS-e serviço).
- Recalcula por item: `gross=qty*unit`, `net=gross-desconto`; proíbe negativos e desconto > bruto.
- Total agregado só sobre campos persistidos; frete/seguro/outras só se persistidos.
- Persiste `fiscal_profile_snapshot` e `tax_snapshot` sanitizados (NCM/CEST/CFOP/CST, LC116/CNAE/ISS).
- Valida `customer_id` existente.
- `SELECT FOR UPDATE` + `draft_version`; bloqueia edição de docs travados/emitidos/autorizados/cancelados/`provider≠NONE`.
- Delete de itens só após todas as validações; transação atômica.
- Retorna `{id, draft_version, total_amount, homologation_state}`.

`rpc_fiscal_draft_validate_homologation`:
- `STABLE`, sem `UPDATE`.
- Valida empresa, cliente, itens/perfis, certificado disponível.
- Retorna chaves técnicas + mensagens pt-BR separadas.

## 4. Cofre A1 — fluxo atômico

Nova RPC `rpc_fiscal_certificate_register_a1` interna:
- `EXECUTE` **só** `service_role`; `REVOKE` de PUBLIC/anon/authenticated.
- Recebe base64/hex (decodifica para bytea no SQL).
- Atomicamente: desativa anterior do mesmo ambiente, insere metadado novo, insere `fiscal_certificate_material` (object_path, senha cifrada, IVs, key_version).
- Índice único parcial `1 AVAILABLE ativo por (company_settings_id, environment)`.

Edge faz upload do ciphertext → chama RPC → em falha remove o objeto (rollback). Certificado anterior permanece ativo se RPC falhar.

Revogação: idempotente, valida pertence à config esperada, auditoria; falha ao remover objeto → erro visível, sem sucesso falso. Sem DELETE físico do metadado.

## 5. Edge `fiscal-certificate-upload`

- CORS fail-closed: `FISCAL_CORS_ALLOWLIST` ausente → 500 configuração indisponível; origem não autorizada → 403 (sem fallback).
- JWT + papel administrador via fonte canônica.
- Valida UUID e existência de `company_settings_id`.
- Limites: `display_name`, senha; **sem** log de segredos.
- `.pfx`/`.p12` ≤ 10 MB; magic bytes + parse `node-forge`.
- Exige X.509 **e** chave privada; verifica correspondência chave privada ↔ pública.
- Valida `notBefore ≤ agora < notAfter`.
- Extrai só metadados sanitizados + fingerprint SHA-256.
- AES-256-GCM chave base64 exata 32 bytes; IVs independentes PFX/senha; `key_version`.
- Persistência via RPC service_role base64.
- Respostas com códigos estáveis; UI traduz para pt-BR.

Testes unitários de helpers: chave inválida, CORS fail-closed, limites, PKCS#12 sem chave, senha errada, expirado/não válido, cleanup em rollback.

## 6. Bridge do sistema operacional

- Componente real de configuração que detecta `window.ARBioFiscalCertificateBridge`.
- Sem bridge: aviso pt-BR "Conector do sistema operacional não instalado" + A1 continua utilizável.
- Com bridge: lista metadados sanitizados, permite selecionar e registra via RPC admin-only.
- Valida fingerprint 64 hex, datas, alias limitado (frontend e servidor).
- Botão "Atualizar detecção".
- Sem assinatura nesta fase.

## 7. Integração em `/configuracoes/fiscal/empresa`

- Nova aba "Certificado digital" em `FiscalEmpresa.tsx`.
- Duas opções: (A) SO, (B) A1.
- `UploadCertificadoA1` montado de verdade.
- Status pt-BR: não configurado / disponível / expirado / revogado / erro; validade, emissor, titular, ambiente, origem.
- Ações admin: registrar SO, enviar A1, substituir, revogar (com confirmação).
- Fingerprint mascarado; nunca mostrar senha/object_path.
- Se cofre não ativado: banner "Cofre de certificados ainda não ativado neste ambiente".
- Só HOMOLOGAÇÃO habilitada. Gestor/financeiro leem; só admin escreve.

## 8. Integração do wizard em `/fiscal/documentos`

- Manter lista, filtros, detalhes, auditoria e formulário manual legado (renomeado "Registro fiscal legado/manual").
- Título "Documentos fiscais".
- Ação "Novo rascunho de NF-e ou NFS-e" abre `RascunhoWizard`.
- Editar rascunho `DRAFT/HOMOLOGATION` existente pelo wizard.
- Zero botão de Emitir/Transmitir/Autorizar/Cancelar SEFAZ.
- Banner: preparação de homologação disponível, transmissão desativada.
- Traduções pt-BR para enums (`DRAFT`, `NONE`, `MANUAL_RECORD`, `NOT_CONFIGURED`...).
- NF-e: destinatário, produtos, qty, unidade, valor, desconto, NCM, CEST, CFOP, CST/CSOSN.
- NFS-e: tomador, serviços, qty, valor, LC 116, CNAE, alíquota ISS/retenção.
- Wizard carrega clientes/perfis reais autorizados (sem digitar UUID).
- Estados loading/erro/vazio/indisponível + responsividade.

## 9. Types & testes

- Não adulterar `src/integrations/supabase/types.ts` manualmente. Adaptador tipado local isolado (`src/types/fiscal316Bridge.ts`) até regeneração.
- Testes novos/atualizados:
  - `FiscalEmpresa` importa/renderiza seção certificado + `UploadCertificadoA1`.
  - `FiscalDocumentos` importa/renderiza `RascunhoWizard`.
  - Migração canônica no caminho certo; stub sem SQL executável.
  - Bucket privado, sem policy pública, material só service_role.
  - Edge exige correspondência de chave e CORS fail-closed (helpers unitários).
  - Flags `fiscalEmissionEnabled`/`production_enabled` continuam `false`.
  - Nenhum fetch a provedor/SEFAZ/prefeitura.
  - Rótulos pt-BR em enums de UI.
- Executar `bun run typecheck`, `bun run build`, `bunx vitest run src/test/fiscal`, ESLint nos arquivos alterados.

## Arquivos afetados (previstos)

Movimentação / criação:
- `supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql` (novo canônico)
- `restoration/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql` (reduzido a stub)
- `src/types/fiscal316Bridge.ts` (adaptador tipado local)
- `src/components/fiscal/certificados/CertificadoDigitalSecao.tsx` (SO + A1 integrados)
- `src/components/fiscal/certificados/BridgeCertificadoSO.tsx`
- `src/lib/fiscal/enumsPt.ts` (traduções pt-BR)
- Testes: `src/test/fiscal/fase3_16_1.integracao.test.tsx`, `.migration.test.ts`, `.edge-upload.helpers.test.ts`

Alterações:
- `src/pages/configuracoes/FiscalEmpresa.tsx` (aba certificado)
- `src/pages/fiscal/FiscalDocumentos.tsx` (ação Novo rascunho + wizard + banner)
- `src/components/fiscal/documentos/RascunhoWizard.tsx` (clientes/perfis reais)
- `src/hooks/useFiscalRascunho.ts` (contrato server-truth)
- `supabase/functions/fiscal-certificate-upload/index.ts` (CORS fail-closed, chave privada, correspondência, RPC base64)
- `supabase/functions/fiscal-certificate-revoke/index.ts` (idempotência real)
- `src/test/fiscal/fase3_16.static.test.ts`

## Detalhes técnicos

- **Concorrência**: `SELECT ... FOR UPDATE` + `draft_version`. Retorno `409`-like via jsonb `{error:'draft_version_mismatch'}`.
- **Auditoria**: reutilizar mecanismo existente (`fi_audit_row`) sem swallow de exceção; falha aborta a transação.
- **Storage bucket**: `INSERT INTO storage.buckets (id,name,public,file_size_limit) VALUES ('fiscal-certificates','fiscal-certificates',false,10485760) ON CONFLICT (id) DO NOTHING;`
- **AES-GCM**: `Deno.env.get('FISCAL_CERTIFICATE_MASTER_KEY')` decodificado como base64 e verificado `byteLength === 32`.
- **Traduções**: mapa central `enumsPt.ts` importado por UI (Documentos, Wizard, Certificado).

## Não faz parte desta fase

- Aplicar migration; deploy de Edge; produção; provedor externo; assinatura via SO; regeneração do `types.ts` remoto.

## Relatório final

Ao concluir, entrega itens A–R (classificação, commit, créditos, arquivos, canonicalidade, SQL/RPCs, cofre A1, bridge SO, integrações, traduções, travas, typecheck, build, testes, ESLint, pendências staging, recomendação objetiva).
