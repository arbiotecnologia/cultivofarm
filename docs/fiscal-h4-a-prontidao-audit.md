# Fase H4-A — Auditoria de Prontidão Configurável para Homologação Fiscal

**Escopo:** somente-leitura + correções críticas/altas que **não** exigem banco remoto, migrations, RLS, provedor ou emissão. Produção `navfzbwgwzruipouyfnk` intocada. Consumo real desta rodada: ~5 créditos.

**Conclusão executiva:** o sistema já implementa, nas Fases 3.7 / 3.15 / 3.16.x / 3.17 / 3.19.x, praticamente todos os contratos e UIs demandados pela H4-A. **Nenhum gap CRÍTICO ou ALTO acionável em frontend/backend local foi identificado nesta rodada.** Os gaps restantes são MÉDIO/BAIXO ou dependem de banco/RLS remoto, provedor ou conector nativo — todos já rastreados em §21–§24 do `fiscal-h2-certificacao-staging.md`.

---

## 1. Inventário por seção (evidência de arquivos)

| Área H4-A | Implementado em | Estado |
|---|---|---|
| 1. Rascunho + checklist consolidado | `src/pages/fiscal/FiscalProntidao.tsx` (view-based) + `src/components/fiscal/homologacao/HomologacaoSecao.tsx` (RPC v2 + fallback); estados `pronto/atencao/bloqueado/nao_verificado` e `READY/INCOMPLETE/BLOCKED/UNAVAILABLE/NOT_CONFIGURED`; blockers priorizados; deep-links por perfil respeitando `getAccessLevel` | ✅ OK |
| 2. Empresa progressiva | `src/pages/configuracoes/FiscalEmpresa.tsx` (823L) + `useFiscalCompanySettings` + `companyFiscalValidation.ts`; CNPJ numérico/alfanumérico separados de emissão; BrasilAPI é opcional (H3-A/B1, sem deploy) | ✅ OK |
| 3. Perfis (Produto/Serviço/Cliente) | `FiscalProdutos.tsx`, `FiscalServicos.tsx`, `FiscalClientes.tsx`; `productFiscalValidation.ts`, `serviceFiscalValidation.ts`, `customerFiscalValidation.ts`; `useProductFiscalProfiles`, `useServiceFiscalProfiles`, `useCustomerFiscalProfiles`; IBS/CBS via `IbsCbsItemCard`; server-side filtering; anti-join `CustomerPicker` | ✅ OK |
| 4A. Certificado A1 | `UploadCertificadoA1.tsx` + Edge `fiscal-certificate-upload` (AES-256-GCM); PFX/senha nunca no cliente; revogação com confirmação em `CertificadoDigitalSecao.tsx`; fingerprint/serial mascarados | ✅ OK |
| 4B. Certificado do SO | `certificateOsAdapter.ts` + `CertificadoDigitalSecao.OsCertificateCard`; declara "Conector do sistema operacional não instalado" quando bridge ausente; **nunca simula detecção** | ✅ OK |
| 5. Conexões/segredos | Provedor e ambiente em `company_settings`; segredos exclusivamente server-side (`fiscal-certificate-upload`, `fiscal-cnpj-lookup`); `production_enabled=false` bloqueia via `classifyCompany` e `HomologacaoSecao` | ✅ OK |
| 6. Normas 2026 | `rtcConfiguration.ts` (RTC/IBS/CBS/IS), `nfseCodeMax30`, CNPJ alfanumérico (`cnpjAlpha.ts`), item LC 116, NBS, CFOP dentro/fora, CST/CSOSN — todos parametrizados; sem alíquotas hardcoded no frontend | ✅ OK |
| 7. UX pt-BR + segurança | Todas as mensagens em pt-BR; `role="status"`/`aria-live`; sem autosave destrutivo (rascunho separado de emissão em `RascunhoWizard`) | ✅ OK |

## 2. Preflight e gates de emissão

- **`EXTERNAL_GATES`** (`src/lib/fiscal/readinessValidation.ts:83`) mantém 7 gates PENDENTES por design — RLS runtime staging, backfill sintético, `mask_sensitive_jsonb`, types.ts oficial, provedor, certificado/secrets, emissão em homologação. UI não oferece caminho para aprovar.
- **`FEATURE_FLAGS.fiscalReadinessCenterUi`** e `fiscalEmissionEnabled` mantêm a superfície de emissão desligada.
- **`classifyCompany`** bloqueia quando `production_enabled=true` sem homologação concluída; motivo objetivo aparece no card.

## 3. Achados desta rodada

### CRÍTICOS/ALTOS acionáveis sem banco
**Nenhum identificado.** A infraestrutura de rascunho, checklist condicional, custódia de certificado, mascaramento de segredos e bloqueio de produção já estão em conformidade com a H4-A.

### MÉDIOS (documentados, sem correção nesta rodada)
1. **Deep-link por campo faltante** — hoje a Central linka para a **aba**, não para o campo específico. Melhoria de UX, não bloqueia homologação.
2. **Antiguidade de documentos pendentes** — a view canônica não expõe idade; card rotula "Não verificado" honestamente. Depende de nova coluna/view.
3. **Alertas proativos de validade do certificado A1** — hoje coluna `days_until_expiration` exibida na tabela, mas sem banner agregado quando < 30 dias. Melhoria de UX.

### BAIXOS
4. **Rótulo "provedor configurado"** aparece como gate binário; poderia detalhar endpoint/versão configurados quando existirem — depende de contrato de provedor definido.
5. **Conector nativo do SO** — contrato `window.ARBioFiscalCertificateBridge` documentado no adapter, mas sem SDK público publicado.

### Dependem de banco/RLS remoto ou provedor (fora do escopo H4-A)
- `rls_runtime_staging`, `backfill_sintetico`, `mask_sensitive_jsonb_runtime` — Fase H2 §19–§21.
- `types_ts_oficial` — H2 §22 concluído com o dump oficial staging.
- `provedor_configurado`, `certificado_e_secrets`, `emissao_em_homologacao` — dependem de contratação/deploy autorizado.

## 4. Validações locais

| Gate | Resultado |
|---|---|
| `bunx vitest run src/test/fiscal` | **1081 passed · 3 skipped** ✓ |
| `bunx tsgo --noEmit` | limpo ✓ |
| `bun run build` | limpo ✓ |
| `bun run scripts/verify-fiscal-types.ts` | OK — 10 tabelas, 5 views, 4 RPCs ✓ |

## 5. Recomendação

1. **Não iniciar correções especulativas.** Antes de propor mudanças, autorizar um sub-escopo específico (ex.: **Médio #1** deep-link por campo, ou **Médio #3** banner de expiração < 30d) — cada um cabe em <20 créditos.
2. **Fase H4-B** (proposta futura, requer autorização): deploy controlado em staging da Edge Function `fiscal-cnpj-lookup` (item pendente de H3-B) + evidência runtime dos gates externos, para converter `PENDENTE` → `APROVADO` de forma auditável.
3. **Não avançar automaticamente.** Aguardar prompt específico.

## 6. Cumprimento das proibições

- ❌ Não tocou produção `navfzbwgwzruipouyfnk`.
- ❌ Não aplicou migrations nem alterou RLS.
- ❌ Não emitiu, transmitiu ou consultou documento fiscal externo.
- ❌ Não integrou provedor nem gravou secrets.
- ❌ Não cadastrou dados inventados nem defaults fiscais presumidos.
