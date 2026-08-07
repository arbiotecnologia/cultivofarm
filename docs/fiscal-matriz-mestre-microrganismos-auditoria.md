# Auditoria SOMENTE LEITURA — Preparação da Matriz Fiscal Mestre dos Microrganismos

**Projeto:** AR Bio Manager
**Ambiente auditado:** staging Supabase `ikaauvsflpmamgxmkhoq` (leitura autenticada via REST/PostgREST, perfil `administrador`)
**Produção `navfzbwgwzruipouyfnk`:** não acessada, não consultada, não migrada, não publicada.
**Escritas realizadas no banco:** **nenhuma**. NF-e/SEFAZ: nenhuma transmissão. App: não publicado.
**Data:** 2026-08-07

---

## 1. Microrganismos cadastrados (staging)

Total em `public.microrganismos`: **25 linhas** — 24 legítimos + 1 resíduo de harness.
Colunas existentes: `id, nome, nome_cientifico, codigo, tipo, ativo, b2b_enabled, product_id,
concentracao_ufc_ml, concentracao_label, dose_ml_ha, valor_dose_brl, valor_litro_brl,
preco_tabela, funcao_agronomica, meio_cultivo, fornecedor, producao_on_farm, safra_referencia,
descricao, observacoes, created_at`.
**Não há nenhum campo fiscal em `microrganismos`** — a classificação fiscal vive exclusivamente
em `microorganism_fiscal_profiles` e o lastro regulatório em `microorganism_regulatory_dossiers`.

| # | Nome / Nome científico | Código | Ativo | B2B | product_id | UFC/mL | Perfil fiscal | Dossiê |
|---|---|---|---|---|---|---|---|---|
| 1 | Bacillus amyloliquefaciens | BAC-2 | sim | sim | — | 3,4×10¹⁰ | ausente | DRAFT v1 |
| 2 | Bacillus aryabhattai | BAC-3 | sim | sim | — | 1,2×10⁹ | ausente | DRAFT v1 |
| 3 | Bacillus licheniformis | BAC-4 | sim | sim | — | 1,2×10⁹ | ausente | DRAFT v1 |
| 4 | Bacillus megaterium | BAC-5 | sim | sim | — | 1,5×10⁹ | ausente | DRAFT v1 |
| 5 | Bacillus methylotrophicus | BAC-6 | sim | sim | — | 1,3×10⁹ | ausente | DRAFT v1 |
| 6 | Bacillus pumilus | BAC-7 | sim | sim | — | 3,4×10¹⁰ | ausente | DRAFT v1 |
| 7 | Bacillus subtilis | BAC-8 | sim | sim | — | 1,3×10⁹ | ausente | DRAFT v1 |
| 8 | Bacillus thuringiensis aizawai | BAC-9 | sim | sim | — | 1,4×10⁹ | ausente | DRAFT v1 |
| 9 | Bacillus thuringiensis kurstaki | BAC-10 | sim | sim | — | 2,5×10⁹ | ausente | DRAFT v1 |
| 10 | Bacillus velezensis | BAC-11 | sim | sim | — | 3,4×10¹⁰ | ausente | DRAFT v1 |
| 11 | Methylobacterium symbioticum | BAC-13 | sim | sim | — | 3,5×10⁸ | ausente | DRAFT v1 |
| 12 | Chromobacterium subtsugae | BAC-14 | sim | sim | — | 1,2×10⁹ | ausente | DRAFT v1 |
| 13 | Pseudomonas fluorescens | BAC-15 | sim | sim | — | 1,5×10⁹ | ausente | DRAFT v1 |
| 14 | Saccharopolyspora spinosa | BAC-16 | sim | sim | — | 1,2×10⁹ | ausente | DRAFT v1 |
| 15 | Beauveria bassiana | FUN-1 | sim | sim | — | 2,1×10⁹ | ausente | DRAFT v1 |
| 16 | Metarhizium anisopliae | FUN-2 | sim | sim | — | 1,5×10⁹ | ausente | DRAFT v1 |
| 17 | Paecilomyces lilacinus | FUN-3 | sim | sim | — | 4,5×10⁹ | ausente | DRAFT v1 |
| 18 | Purpureocillium lilacinum | FUN-4 | sim | sim | — | 1,2×10⁹ | ausente | DRAFT v1 |
| 19 | Trichoderma asperellum | FUN-5 | sim | sim | — | 1,4×10¹⁰ | ausente | DRAFT v1 |
| 20 | Trichoderma harzianum | FUN-6 | sim | sim | — | 1,2×10⁹ | ausente | DRAFT v1 |
| 21 | Isaria fumosorosea | FUN-7 | sim | sim | — | 1,3×10⁹ | ausente | DRAFT v1 |
| 22 | Pochonia chlamydosporia | FUN-8 | sim | sim | — | 3,4×10⁷ | ausente | DRAFT v1 |
| 23 | Cordyceps javanica | FUN-9 | sim | sim | — | 1,4×10⁹ | ausente | DRAFT v1 |
| 24 | E.M — Microrganismos Eficientes (consórcio) | CON-1 | sim | sim | — | 1,5×10¹⁰ | ausente | DRAFT v1 |
| — | `F42-HARNESS-20260806121703-FA6EB0 MICRO` | BAC-27 | sim | sim | — | nulo | 1 perfil `is_active=false` | **sem dossiê** |

Nenhum dado sensível (documento, endereço, credencial) foi lido ou reproduzido.

---

## 2. Inventário de estruturas fiscais/regulatórias

### 2.1 Tabelas e colunas

| Domínio | Tabela | Colunas relevantes | Migration |
|---|---|---|---|
| Perfil fiscal do microrganismo | `microorganism_fiscal_profiles` | `microorganism_id` (FK → `microrganismos` RESTRICT), `is_active`, `fiscal_description`, `commercial_unit`, `taxable_unit`, `ncm`, `cest`, `origin_code`, `cfop_in_state`, `cfop_interstate`, `icms_cst`, `icms_csosn`, `pis_cst`, `cofins_cst`, `ipi_cst`, `gtin`, `taxable_gtin`, `tax_benefit_code`, `profile_status`, `accounting_notes`, `accounting_validated_at/_by` | `20260806000000_fiscal_microorganism_profiles.sql:38-118` |
| Perfil fiscal do produto | `product_fiscal_profiles` | mesmos campos + `approximate_tax_source`, `ibs_cbs_configuration jsonb` | `20260721000000_fiscal_fase2_fundacao.sql:84-136`; RTC em `20260727000000_fiscal_fase3_19_rtc_2026.sql:85-115` |
| Perfil fiscal do serviço | `service_fiscal_profiles` | LC116/CNAE/ISS + `ibs_cbs_configuration` | `20260721000000...:141-186` |
| Perfil fiscal do cliente | `customer_fiscal_profiles` | `taxpayer_indicator`, IE, UF/IBGE, `profile_status`, `nfe_readiness_status/_pendencies` | `20260721000000...:191-240`; `20260816000000_fase_f3_prontidao_calculo_nfe.sql:386-397` |
| Emitente | `company_fiscal_settings` | `crt`, `fiscal_environment`, `production_enabled`, `nfe_environment_code`, `nfe_readiness_status/_pendencies`, `rtc_configuration jsonb`, `nfe_series`, `icms_st_responsible`, `fcp_applicable`, `difal_responsible` | `20260721000000...:13-79`; `20260727000000...:85`; `20260816000000...:228-262` |
| Dossiê regulatório (versionado) | `microorganism_regulatory_dossiers` | `version`, `status`, `strain_code/name`, `regulatory_category` (finalidade), `formulation`, `label_guarantee`, `guarantee_unit`, `mapa_registration_number/holder/manufacturer/status/valid_until/not_applicable_reason`, `published_ncm`, `published_cest`, `published_ncm_candidate_id`, tríade `technical_/regulatory_/fiscal_review_status`, `blocked_reason`, `sod_override_*`, soft-delete | `20260814000000_fase_f2_regulatorio_microrganismos.sql:120-216` |
| Apresentações (UFC/volume, GTIN, unidades) | `microorganism_regulatory_presentations` | `volume_ml`, `label`, `commercial_unit`, `taxable_unit`, `conversion_factor`, `units_confirmed*`, `gtin`, `gtin_absent(_reason)`, `gtin_confirmed*` | `20260814000000...:220-261` |
| Candidatos de NCM/CEST com **confiança** | `microorganism_ncm_candidates` | `ncm`, `cest`, `justification` (≥20 chars), `confidence` (`LOW/MEDIUM/HIGH`), `status` (`PROPOSED/APPROVED/REJECTED`), `source_id`, `source_url` | `20260814000000...:270-304` |
| Evidências | `microorganism_regulatory_documents` | `content_sha256`, bucket privado `fiscal-regulatorio`, validade, `source_id/url` | `20260814000000...:316+` |
| Checklist regulatório | `microorganism_regulatory_checklist` | `item_key`, `state`, `justification`, `evidence_document_id` | `20260814000000...:371+` |
| Snapshot de publicação | `microorganism_regulatory_publication_snapshots` | imutável por trigger | `20260814000000...` |
| Fontes oficiais | `fiscal_official_sources` | `source_key` (inclui `MAPA_SIPEAGRO`), `authority`, `url` (https), `doc_version`, `consulted_at` | `20260814000000...:~95-105` |
| Documento fiscal | `fiscal_invoices` / `fiscal_invoice_items` | itens com `source_item_type`, `ncm_snapshot`, `cest_snapshot`, `cfop_snapshot`, `cst_icms_snapshot`, `csosn_snapshot`, `origem_snapshot`, `commercial_unit`, `taxable_unit`, `taxable_quantity`, `fiscal_profile_snapshot`, `tax_snapshot` | `20260721000000...:245-405` + fases F3 |

**IBS/CBS e `cClassTrib`:** não existem colunas tipadas. Vivem como chaves dentro de
`ibs_cbs_configuration` / `rtc_configuration` (`c_class_trib`, `cst_ibs_cbs`, `reducao`,
`diferimento`, `monofasia`, alíquotas), validadas por allowlist em
`_fiscal_rtc_assert_payload` (`20260727000000...:121-238`). `rtc_environment` aceita apenas
`NOT_CONFIGURED`/`HOMOLOGATION`.

**UFC/mL:** não é campo fiscal. Existe em `microrganismos.concentracao_ufc_ml` (técnico) e
como garantia de rótulo em `dossiers.label_guarantee` + `guarantee_unit`, e como
`presentations.conversion_factor` para converter unidade comercial ↔ tributável.

### 2.2 Constraints e índices críticos
- `ux_microorganism_fiscal_profiles_active` — 1 perfil ativo por microrganismo.
- `profile_status CHECK IN ('DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED','NOT_FISCALLY_SOLD')`.
- `mrd_uq_micro_version`, `mrd_uq_published_per_micro` (1 `VALIDATED` por microrganismo),
  `mrd_uq_open_per_micro` (1 rascunho aberto por vez).
- `mrd_published_requires_reviews` — só `VALIDATED` com as **três** revisões `APPROVED` + `published_at`.
- `mrd_mapa_na_chk` — `NOT_APPLICABLE` exige justificativa.
- `published_ncm ~ '^[0-9]{8}$'`, `published_cest ~ '^[0-9]{7}$'`, GTIN 8/12/13/14 + dígito verificador (`fn_gtin_is_valid`).
- `mnc_uq_approved_per_dossier` — 1 candidato NCM aprovado por dossiê.
- `ftr_rtc_not_publishable_chk` — regra IBS/CBS nunca publicável.

### 2.3 RLS, grants e triggers
- Todas as tabelas fiscais/regulatórias com RLS habilitada; leitura `administrador/gestor/financeiro`,
  escrita `administrador/financeiro` (regulatório usa `fn_regulatory_can_read/_prepare/_approve`).
- `anon` **sem** SELECT (confirmado em runtime: `GET /rest/v1/microrganismos` anônimo →
  `42501 permission denied`). `20260820000000` revoga `anon` das RPCs fiscais.
- Triggers: `fiscal_audit_trigger`, `fiscal_audit_trigger_microorganism_profiles`,
  `regulatory_audit_trigger`, `regulatory_block_published_edit`,
  `regulatory_block_published_child_edit`, `regulatory_snapshot_immutable`,
  `regulatory_touch_updated_at`, `fn_regulatory_ncm_source_guard`,
  `fn_regulatory_published_candidate_guard`, `set_updated_at`.

### 2.4 RPCs
Regulatório (todas SECURITY DEFINER, `20260814000000` + correções `20260815000000`):
`rpc_regulatory_dossier_ensure_draft`, `_update_draft`, `_submit`, `_publish`, `_new_version`,
`_block`, `_detail`, `rpc_regulatory_review_decide`, `rpc_regulatory_checklist_set`,
`rpc_regulatory_presentation_upsert`, `rpc_regulatory_document_register`,
`rpc_regulatory_ncm_candidate_add`, `rpc_regulatory_ncm_candidate_decide`,
`rpc_microorganism_regulatory_overview`, `fn_microorganism_regulatory_facts`.
Fiscal: `rpc_fiscal_item_readiness(p_scope,p_id)`, `fn_fiscal_item_profile_gate_eval`,
`rpc_fiscal_calculate_invoice_v1`, `fn_fiscal_apply_tax_v2`, `fn_fiscal_resolve_operation`,
`fn_fiscal_resolve_tax_rule`, `fn_fiscal_invoice_eligibility`,
`fn_fiscal_assert_environment_homologation`, `rpc_fiscal_reserve_nfe_number_v1`,
`rpc_fiscal_xml_prepare_v1`, `rpc_fiscal_xml_record_v1`, RPCs RTC IBS/CBS.

### 2.5 Telas / hooks
`src/components/fiscal/RegulatorioMicrorganismosSecao.tsx` (dossiê, MAPA, aba NCM),
`src/pages/configuracoes/FiscalProdutos.tsx` (grid unificado Produtos + Microrganismos com
NCM/CEST/CFOP/status), `src/pages/fiscal/FiscalProntidao.tsx`,
`src/components/fiscal/ProntidaoNfeSecao.tsx`, `IbsCbsItemCard.tsx`, `RtcCompanyCard.tsx`,
`FiscalReadinessBanner.tsx`; hooks `useMicroorganismRegulatory.ts`,
`useMicroorganismFiscalProfiles.ts`, `useMicroorganismProfile.ts`,
`useMicroorganismFiscalAssociation.ts`, `useFiscalReadiness.ts`, `useFiscalNfeReadiness.ts`,
`useFiscalRtc.ts`, `useFiscalMicrorganismosLite.ts`; validação em
`src/lib/fiscal/microorganismFiscalValidation.ts` e `productFiscalValidation.ts`.

---

## 3. Como o motor resolve a regra por item e o que vira snapshot

1. **Montagem do item (rascunho).** `source_item_type` (`PRODUCT | MICROORGANISM | SERVICE`,
   `src/lib/fiscal/sourceItemTypes.ts`, espelho em `supabase/functions/_shared/fiscal/sourceItemTypes.ts`)
   decide qual tabela de perfil é lida. `MICROORGANISM` lê **exclusivamente**
   `microorganism_fiscal_profiles` — nunca cai para `product_fiscal_profiles`
   (`_shared/fiscal/resolveMicroorganismItem.ts:8-11,102-158`). Os campos do perfil são
   **congelados** em `fiscal_invoice_items.{ncm_snapshot, cest_snapshot, cfop_snapshot,
   cst_icms_snapshot, csosn_snapshot, origem_snapshot, commercial_unit, taxable_unit}`.
2. **Cálculo.** `rpc_fiscal_calculate_invoice_v1` **não relê os perfis**: opera sobre o snapshot.
   Por item resolve `fn_fiscal_resolve_operation(...)` (CFOP/natureza via
   `fiscal_operation_policies`) e, por tributo na ordem `ICMS → IPI → ICMS_ST → FCP/FCP_ST →
   DIFAL → PIS/COFINS`, `fn_fiscal_resolve_tax_rule(...)` sobre `fiscal_tax_rules` com
   `status='PUBLISHED'`. A chave de resolução é **NCM + UF origem/destino + CRT + indicadores do
   destinatário** — ambiguidade ou ausência gera `FISCAL_*_AMBIGUOUS` / `FISCAL_*_NOT_FOUND`
   (fail-closed, nunca escolhe silenciosamente). `fn_fiscal_apply_tax_v2` calcula; parâmetro
   faltante → `FISCAL_TAX_RULE_INCOMPLETE`. IBS/CBS/IS sempre `FISCAL_RTC_ENGINE_UNAVAILABLE`.
3. **Snapshot gravado.** Item: `tax_snapshot` com `engineVersion='F3.3'`, política de operação,
   `chainedContext`, `itemTotals`, `taxes`. Documento: `tax_snapshot` +
   `fiscal_totals_snapshot` + `company_snapshot` + `customer_snapshot`. Recalcular documento já
   calculado → `FISCAL_SNAPSHOT_IMMUTABLE`.
4. **XML.** `rpc_fiscal_xml_prepare_v1` congela o payload (append-only em `fiscal_xml_runs`,
   hash SHA-256, imutável); `buildNfeXml.ts` monta `<prod>` a partir de
   `NCM/CEST/CFOP/uCom/qCom` do snapshot e `<imposto>` a partir de
   `cst_icms_snapshot`/`csosn_snapshot` + `taxes.PIS/COFINS`. `fiscal-xml-engine` assina e valida
   contra o XSD oficial `PL_010e_v1.02` — teto `SIGNED`, nunca transmite.
   **Lacuna conhecida:** IPI, ICMS-ST, FCP/FCP-ST e DIFAL são calculados e gravados no snapshot,
   mas os grupos `<IPI>`, `ICMS51/60/70` e `<ICMSUFDest>` ainda não são emitidos pelo builder.

---

## 4. Lacunas, duplicidades e conflitos

| # | Achado | Evidência | Severidade |
|---|---|---|---|
| A1 | **0 de 24 microrganismos possuem perfil fiscal.** `microorganism_fiscal_profiles` tem 1 linha, referente ao microrganismo de harness, `is_active=false`, `profile_status` sintético. | consulta staging | Bloqueante para faturar |
| A2 | **24 dossiês, todos `DRAFT` v1**, com `technical/regulatory/fiscal_review_status = PENDING`, `regulatory_category`, `strain_code`, `mapa_status`, `published_ncm` todos nulos. | consulta staging | Bloqueante |
| A3 | **288 itens de checklist, 100 % `PENDING`** (12 chaves × 24 dossiês). | consulta staging | Bloqueante |
| A4 | **0 candidatos de NCM/CEST** e **0 snapshots de publicação**. | consulta staging | Bloqueante |
| A5 | **48 apresentações** cadastradas (2 por dossiê), mas sem GTIN confirmado nem unidades confirmadas. | consulta staging | Alta |
| A6 | **Divergência de contagem: 24 microrganismos reais × 27 esperados na Matriz Mestre.** A sequência de códigos tem lacunas em `BAC-1` e `BAC-12`; nenhum `BAC-17+` além do resíduo `BAC-27`. | tabela §1 | Bloqueante para importação 1:1 |
| A7 | **Resíduo de harness** `F42-HARNESS-...-FA6EB0 MICRO` (`BAC-27`) ativo e `b2b_enabled=true`, com perfil fiscal sintético associado. | consulta staging | Média (higiene) |
| A8 | **Conflito de nomenclatura**: `Paecilomyces lilacinus` (FUN-3) e `Purpureocillium lilacinum` (FUN-4) são **sinônimos taxonômicos da mesma espécie** cadastrados como registros distintos. Idem risco de granularidade em `Bacillus thuringiensis aizawai`/`kurstaki` (subespécies) e `Bacillus methylotrophicus`≈`Bacillus velezensis` (sinonímia aceita). | tabela §1 | Alta — decisão do regulatório/contador |
| A9 | `E.M — Microrganismos Eficientes` (CON-1) é **consórcio**, não espécie única: `strain_code`/`label_guarantee` exigem tratamento distinto e possivelmente NCM diferente. | tabela §1 | Alta |
| A10 | **Nenhum microrganismo tem `product_id`** — 0/25 associados a `produtos`. A coluna existe (migration `20260804000000`) e a RPC `rpc_fiscal_associate_microorganism` também, mas nunca foi usada. Logo, não há “produto sem correspondência”: há **catálogo inteiro sem correspondência**. | consulta staging | Média |
| A11 | Duplicidade por `nome_cientifico` **exata**: nenhuma. Duplicidade de `codigo`: nenhuma. Todos com código. | consulta staging | OK |
| A12 | Emitente: 2 linhas em `company_fiscal_settings` — a **ativa** está `NOT_CONFIGURED / DRAFT / nfe_enabled=false`; a de `HOMOLOGATION / VALIDATED / nfe_enabled=true` está **inativa**. | consulta staging | Alta — bloqueia cálculo real |
| A13 | `microorganism_fiscal_profiles` ainda **fora de `src/integrations/supabase/types.ts`**, exigindo casts `as unknown as` (`useMicroorganismFiscalProfiles.ts:12-16`, `microorganismFiscalValidation.ts:9-16`). | código | Média |
| A14 | Escopo `SERVICE` não tem view de readiness nem suporte em `rpc_fiscal_item_readiness` (só `PRODUCT`/`MICROORGANISM`). | código | Baixa (fora deste escopo) |

---

## 5. Suporte a rascunho/homologação × regra publicada/produção — **CONFIRMADO**

Existe e é fail-closed em quatro camadas independentes:

1. **Perfil fiscal:** `profile_status` `DRAFT → PENDING_ACCOUNTING → VALIDATED | BLOCKED | NOT_FISCALLY_SOLD`, mais `is_active` e `accounting_validated_at/_by` (validação formal do contador).
2. **Dossiê regulatório:** `status` `DRAFT → PENDING_REVIEW → VALIDATED | BLOCKED`, versionado (`version`, `mrd_uq_published_per_micro`), com tríade obrigatória de aprovações e snapshot imutável de publicação.
3. **Gate de item:** `fn_fiscal_item_profile_gate_eval` marca `quarantined=true` para `profile_status='BLOCKED'` **ou** perfil sintético (notas com `sintetic/homologacao/hml/test_only/quarentena`), e para microrganismos exige dossiê `VALIDATED` — caso contrário `REGULATORY_DOSSIER_MISSING` / `_NOT_PUBLISHED` / `_BLOCKED`, MAPA, cepa, formulação, garantia de rótulo, rótulo e laudo anexados e as três revisões aprovadas.
4. **Gate de ambiente:** `fn_fiscal_assert_environment_homologation()` lança `FISCAL_PRODUCTION_BLOCKED` para `nfe_environment_code='1'`, chamado antes de qualquer efeito em cálculo, reserva de numeração e preparo de XML; `nfe_readiness_status` tem teto `READY_HOMOLOGATION`; `rtc_environment` proíbe produção.

Conclusão: **é seguro importar a Matriz Mestre como rascunho** — nada se torna faturável sem
publicação explícita do dossiê e validação contábil registrada.

---

## 6. Menor alteração integrada proposta (sem fluxo paralelo)

Nenhuma tabela nova, nenhuma RPC nova, nenhum fluxo paralelo. A Matriz Mestre é importada
**pelas estruturas que já existem**, na ordem que o modelo já impõe:

1. `microorganism_regulatory_dossiers` (v1 `DRAFT` já existente) → `rpc_regulatory_dossier_update_draft`
   preenche `strain_code/name`, `regulatory_category`, `formulation`, `label_guarantee`,
   `guarantee_unit`, `mapa_*`.
2. `microorganism_ncm_candidates` → `rpc_regulatory_ncm_candidate_add` com `confidence`
   (`LOW` por padrão na importação), `justification` e `source_id` apontando para
   `fiscal_official_sources` (TIPI/MAPA_SIPEAGRO). **Não aprovar** candidatos na importação.
3. `microorganism_regulatory_presentations` → `rpc_regulatory_presentation_upsert` com
   `commercial_unit`, `taxable_unit`, `conversion_factor`, GTIN ou `gtin_absent + reason`,
   **sem** `gtin_confirmed`/`units_confirmed`.
4. `microorganism_fiscal_profiles` → 1 linha por microrganismo com
   `is_active = false` e `profile_status = 'DRAFT'`, `accounting_validated_at = NULL`,
   `accounting_notes` contendo o marcador `IMPORTACAO_MATRIZ_MESTRE — quarentena`
   (aciona `PROFILE_SYNTHETIC` no gate, garantindo bloqueio duplo).
5. `microorganism_regulatory_checklist` permanece `PENDING` — a importação **não** decide item algum.

Único ajuste de código sugerido (não obrigatório para importar):
regenerar `src/integrations/supabase/types.ts` para eliminar os casts `as unknown as`
de `microorganism_fiscal_profiles` (achado A13).

**Decisões humanas necessárias antes da importação (não podem ser inferidas):**
divergência 24×27 (A6), tratamento dos sinônimos taxonômicos (A8), tratamento do consórcio
E.M. (A9), remoção do resíduo de harness (A7) e ativação da linha correta de
`company_fiscal_settings` (A12).

---

## 7. Plano de importação — idempotente, transacional e reversível

Local proposto: `restoration/matriz-fiscal-microrganismos/` (kit, **não** migration —
é carga de dados, não mudança de schema).

| Passo | Arquivo | Conteúdo | Reversível |
|---|---|---|---|
| 0 | `00-precheck.sql` | Fail-fast: assert `current_database()` e marker `_fiscal_staging_marker='STAGING'/ikaauvsflpmamgxmkhoq`; assert `production_enabled=false` e `fiscal_environment <> 'PRODUCTION'` em toda linha de `company_fiscal_settings`; abortar se qualquer dossiê estiver `VALIDATED`. | n/a |
| 1 | `10-matriz.csv` | 27 linhas revisadas pelo responsável técnico: `codigo, nome, nome_cientifico, strain_code, regulatory_category, formulation, label_guarantee, guarantee_unit, mapa_*, ncm_candidato, cest_candidato, confidence, justificativa, fonte, commercial_unit, taxable_unit, conversion_factor, gtin\|gtin_absent_reason, origin_code, cfop_in_state, cfop_interstate, icms_cst\|csosn, pis_cst, cofins_cst, ipi_cst`. | n/a |
| 2 | `20-import.sql` | `BEGIN; SET LOCAL statement_timeout`. Tabela temporária a partir do CSV. `INSERT ... ON CONFLICT DO UPDATE` chaveado por `codigo` (dossiê aberto v1) e por `microorganism_id` (perfil, respeitando `ux_..._active`). Todas as linhas gravadas com `import_batch` gravado em `accounting_notes`/`justification` no formato `MATRIZ_MESTRE:<batch_uuid>`. `COMMIT`. Reexecução com o mesmo CSV produz o mesmo estado (idempotente). | sim |
| 3 | `30-verify.sql` | Gates: (a) 27 dossiês `DRAFT` preenchidos; (b) 27 perfis com `is_active=false` e `profile_status='DRAFT'`; (c) `rpc_fiscal_item_readiness('MICROORGANISM', id)` retorna `ready=false` e `quarantined=true` para **todos**; (d) 0 candidatos NCM `APPROVED`; (e) 0 checklist `APPROVED`; (f) nenhum `accounting_validated_at` preenchido; (g) `SELECT count(*) FROM microorganism_regulatory_publication_snapshots = 0`. Qualquer falha → abortar e rodar rollback. | n/a |
| 4 | `90-rollback.sql` | `BEGIN;` `DELETE` de perfis e candidatos/apresentações cujo marcador `MATRIZ_MESTRE:<batch_uuid>` bata; `UPDATE` dos dossiês restaurando os campos ao estado nulo capturado em `00-baseline.json`; assert de que nenhuma linha `VALIDATED` seria tocada; `COMMIT`. | — |
| 5 | `RUNBOOK.md` | Ordem fail-fast 0 → 1 → 2 → 3 (→ 4 se falhar), com DSN de staging fornecido em runtime e nunca registrado. | — |

**Invariantes obrigatórias da carga (bloqueio de faturamento real preservado):**
`is_active=false`, `profile_status='DRAFT'`, `accounting_validated_at IS NULL`,
dossiê nunca sai de `DRAFT`, nenhuma revisão passa a `APPROVED`, nenhum candidato NCM é
aprovado, nenhum checklist é decidido, `gtin_confirmed`/`units_confirmed` permanecem falsos.
Com isso o gate `fn_fiscal_item_profile_gate_eval` retorna `ready=false, quarantined=true` para
os 27 itens, e a emissão continua barrada por três camadas independentes.

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Classificar NCM/CEST sem parecer contábil | Candidatos entram apenas como `PROPOSED` com `confidence='LOW'`; aprovação exige `rpc_regulatory_ncm_candidate_decide` por usuário autorizado |
| Sinônimos taxonômicos gerarem duplicidade fiscal (A8) | Decisão humana registrada antes do passo 1; `mrd_uq_open_per_micro` impede dossiês concorrentes |
| Divergência 24×27 (A6) | Importação bloqueada até o CSV ser conciliado com o catálogo; criação de novos microrganismos é passo separado e explícito |
| Perfil sintético de harness contaminar readiness (A7) | Já está `is_active=false` e quarentenado; limpeza opcional em tarefa própria |
| Emitente ativo `NOT_CONFIGURED` (A12) | Não afeta a importação; bloqueia apenas cálculo — deve ser tratado antes da homologação |
| Vazamento para produção | `00-precheck.sql` fail-closed por marker + `production_enabled=false`; produção nunca conectada |

---

## 9. Status

**BLOQUEADO PARA IMPORTAÇÃO** — bloqueio de dados de entrada, não de arquitetura.

O modelo existente é suficiente e seguro (rascunho/homologação × publicado está implementado e
fail-closed). Os bloqueios são: (A6) divergência 24 × 27 microrganismos, (A8) sinônimos
taxonômicos a decidir, (A9) tratamento do consórcio E.M., e a ausência da Matriz Mestre
revisada em formato tabular. Resolvidos esses quatro pontos, o plano do §7 pode ser executado
em staging sem qualquer alteração de schema.

Nenhuma alteração foi realizada no banco ou nos dados nesta auditoria.
