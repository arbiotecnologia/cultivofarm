# Auditoria fiscal NF-e modelo 55 e inventário de microrganismos — SOMENTE LEITURA

- **Base:** commit `dc712682d3fefa0e199334dd0f41ef7f49e8847b` (relatório consolidado em `08354e6e`)
- **Ambiente:** staging `ikaauvsflpmamgxmkhoq` (marker fail-closed `STAGING`)
- **Produção `navfzbwgwzruipouyfnk`:** não conectada, não consultada, não migrada, não alterada, não publicada
- **Natureza:** diagnóstico. Nenhuma alteração de banco, código, migrations, dados, certificados, secrets, usuários, pedidos ou documentos.

---

## 1. Gate de ambiente e baseline

| Item | Resultado |
|---|---|
| `public._fiscal_staging_marker` | `STAGING` / `ikaauvsflpmamgxmkhoq` ✅ |
| Migration list | 628 local / 628 remote, **0 LOCAL_ONLY, 0 REMOTE_ONLY**, 0 duplicidades ✅ |
| Head do ledger | `20260811000000` ✅ |
| Objetos HML/mock | `hml_*` e `_fiscal_hml_*` = **0**; `rpc_hml_fiscal_emit_mock` **removida** ✅ |
| Função remanescente com “hml” no nome | `fn_cockpit_is_hml_environment()` — detector de ambiente, legítimo, não é mock fiscal |
| RPC fiscal real preservada | `rpc_associate_microorganism_fiscal_product(uuid,uuid)` presente, `SECURITY DEFINER` ✅ |

**Usuários `fase-e-*` (4):** mantidos intactos. Possuem 46 referências históricas/financeiras
(`partner_order_audit_logs` 14, `financial_governance_audit_log` 14, `financial_audit_log` 4,
`commercial_condition_audit_log` 4, `commercial_audit_log` 3, `partner_order_financial_links` 2,
`partner_orders.receivable_generated_by` 2, `accounts_receivable` 2, `notificacoes_operacionais` 1).
**Recomendação futura (não executada):** bloquear login (`banned_until`) e/ou marcar
`user_roles`/perfil como inativo, **preservando autoria** — nunca `DELETE`.

---

## 2. Inventário do emitente (dados mascarados)

Fonte de verdade: `public.company_fiscal_settings` (singleton, 1 linha, `is_active=true`).

| Campo | Valor | Situação |
|---|---|---|
| Razão social | `AR BIO (HML STAGING)` | 🔴 placeholder de homologação |
| Nome fantasia | NULL | 🔴 BLOCKED |
| CNPJ | NULL | 🔴 BLOCKED |
| Inscrição Estadual | ausente | 🔴 BLOCKED |
| Inscrição Municipal | NULL | ⚠️ n/a para NF-e 55 |
| Regime / CRT | `lucro_presumido` / **CRT = 3** | ⚠️ presente, **sem validação contábil** |
| CNAE principal / adicionais | NULL / vazio | 🔴 BLOCKED |
| Endereço (logradouro, nº, bairro, CEP, município) | todos NULL | 🔴 BLOCKED |
| Código IBGE do município | NULL | 🔴 BLOCKED |
| UF | `GO` | ⚠️ presente, **não comprovada** (sem IE/endereço) |
| País | `BR` | ok |
| Série NF-e / numeração | `nfe_series` NULL; **não existe tabela/RPC de numeração** | 🔴 BLOCKED |
| Credenciamento NF-e por UF (hml/prod) | `fiscal_environment = NOT_CONFIGURED`, `nfe_enabled=false`, `production_enabled=false` | 🔴 BLOCKED |
| Provedor | `fiscal_provider = NONE`, `nfe_provider = NONE` | 🔴 BLOCKED |
| Certificado A1/A3/PAA | `fiscal_certificates` = **0 linhas**; `fiscal_certificate_material` = **0 linhas**; `certificate_ref` NULL | 🔴 BLOCKED |
| Validação contábil | `configuration_status = DRAFT`, `last_validation_status = NOT_VALIDATED`, `accounting_validated_at` NULL | 🔴 BLOCKED |
| RTC (IBS/CBS/IS) | `rtc_configuration = {}` | 🔴 BLOCKED |

**Certificado — verificação de existência apenas.** Nenhuma senha, chave privada, IV, ciphertext ou
`object_path` foi lido, exportado ou logado. Bucket `fiscal-certificates` é **privado**.
**CSC não avaliado** — é requisito de NFC-e (modelo 65), fora do escopo do modelo 55.

**Política fiscal vigente:** `fiscal_operation_policies` (1 linha ativa) —
`b2b_partner` / `venda_mercadoria` / UF nula (todas) / `requires_invoice = true` / `document_model = 55`,
base legal “Ajuste SINIEF s/nº de 1970 e RICMS”, vigente desde 2026-07-31.

---

## 3. Inventário de microrganismos — 24 registros (24 ativos, 0 inativos)

Todos com `b2b_enabled = true`, todos com 2 apresentações comerciais em `catalogo_volumes` (**5 L** e **20 L**),
todos com `product_id = NULL` e **nenhum** com registro MAPA/SIPEAGRO (tabela `produto_conformidade_perfis` tem **0 linhas**).

| # | Código | Nome / espécie | Tipo | Concentração | product_id | Perfil fiscal | NCM |
|---|---|---|---|---|---|---|---|
| 1 | BAC-2 | Bacillus amyloliquefaciens | bactéria | 3,4 × 10¹⁰ | NULL | SEM_PERFIL | — |
| 2 | BAC-3 | Bacillus aryabhattai | bactéria | 1,2 × 10⁹ | NULL | SEM_PERFIL | — |
| 3 | BAC-4 | Bacillus licheniformis | bactéria | 1,2 × 10⁹ | NULL | SEM_PERFIL | — |
| 4 | BAC-5 | Bacillus megaterium | bactéria | 1,5 × 10⁹ | NULL | SEM_PERFIL | — |
| 5 | BAC-6 | Bacillus methylotrophicus | bactéria | 1,3 × 10⁹ | NULL | SEM_PERFIL | — |
| 6 | BAC-7 | Bacillus pumilus | bactéria | 3,4 × 10¹⁰ | NULL | SEM_PERFIL | — |
| 7 | BAC-8 | Bacillus subtilis | bactéria | 1,3 × 10⁹ | NULL | SEM_PERFIL | — |
| 8 | BAC-9 | Bacillus thuringiensis aizawai | bactéria | 1,4 × 10⁹ | NULL | SEM_PERFIL | — |
| 9 | BAC-10 | Bacillus thuringiensis kurstaki | bactéria | 2,5 × 10⁹ | NULL | SEM_PERFIL | — |
| 10 | BAC-11 | Bacillus velezensis | bactéria | 3,4 × 10¹⁰ | NULL | SEM_PERFIL | — |
| 11 | BAC-13 | Methylobacterium symbioticum | bactéria | 3,5 × 10⁸ | NULL | SEM_PERFIL | — |
| 12 | BAC-14 | Chromobacterium subtsugae | bactéria | 1,2 × 10⁹ | NULL | SEM_PERFIL | — |
| 13 | BAC-15 | Pseudomonas fluorescens | bactéria | 1,5 × 10⁹ | NULL | SEM_PERFIL | — |
| 14 | BAC-16 | Saccharopolyspora spinosa | bactéria | 1,2 × 10⁹ | NULL | SEM_PERFIL | — |
| 15 | FUN-1 | Beauveria bassiana | fungo | 2,1 × 10⁹ | NULL | SEM_PERFIL | — |
| 16 | FUN-2 | Metarhizium anisopliae | fungo | 1,5 × 10⁹ | NULL | SEM_PERFIL | — |
| 17 | FUN-3 | Paecilomyces lilacinus | fungo | 4,5 × 10⁹ | NULL | SEM_PERFIL | — |
| 18 | FUN-4 | Purpureocillium lilacinum | fungo | 1,2 × 10⁹ | NULL | SEM_PERFIL | — |
| 19 | FUN-5 | **Trichoderma asperellum** | fungo | 1,4 × 10¹⁰ | NULL | **DRAFT (sintético)** | 38089299 |
| 20 | FUN-6 | Trichoderma harzianum | fungo | 1,2 × 10⁹ | NULL | SEM_PERFIL | — |
| 21 | FUN-7 | Isaria fumosorosea | fungo | 1,3 × 10⁹ | NULL | SEM_PERFIL | — |
| 22 | FUN-8 | Pochonia chlamydosporia | fungo | 3,4 × 10⁷ | NULL | SEM_PERFIL | — |
| 23 | FUN-9 | Cordyceps javanica | fungo | 1,4 × 10⁹ | NULL | SEM_PERFIL | — |
| 24 | CON-1 | E.M – Microrganismos Eficientes (consórcio) | consórcio | 1,5 × 10¹⁰ | NULL | SEM_PERFIL | — |

### 3.1 Completude fiscal por microrganismo

**23 de 24 microrganismos: completude fiscal 0%** — nenhum perfil fiscal, portanto ausentes:
descrição fiscal, cProd, cEAN/cEANTrib (nem “SEM GTIN”), NCM, CEST, EX TIPI, origem, uCom/uTrib e fator
de conversão, CFOP interno/interestadual, ICMS CST/CSOSN, PIS/COFINS/IPI CST, cBenef, IBS/CBS/IS
(CST, cClassTrib, reduções/diferimentos/crédito presumido). Confiança: **N/A**. Motivo do bloqueio:
`SEM_PERFIL` + emitente não configurado + sem registro MAPA.

**1 de 24 (FUN-5 Trichoderma asperellum): perfil `DRAFT` de origem sintética — NÃO CONFIÁVEL.**
`accounting_notes` = “Perfil sintetico de homologacao - sem validacao contabil”; descrição fiscal
`HML-B2B agente biologico microrganismo 3808.92.99`. Conteúdo: NCM `38089299`, CFOP `5102`/`6102`,
ICMS CST `00` **e simultaneamente** CSOSN `102`, origem `0`, PIS/COFINS CST `01`, uCom/uTrib `L`,
sem CEST, sem GTIN, sem IPI CST, sem cBenef, sem validação contábil.
🔴 **Inconsistência jurídica:** CSOSN é exclusivo do Simples Nacional (CRT 1/2); o emitente está em
CRT 3 (Regime Normal), onde só cabe CST. Coexistência de CST `00` + CSOSN `102` é inválida.
🔴 **Violação da regra 4:** o NCM foi inferido do nome/espécie, sem rótulo, finalidade regulatória,
composição, registro MAPA ou apresentação. Deve ser tratado como **pending_review**, não como verdade.

Mesma contaminação em `product_fiscal_profiles` (2 linhas `DRAFT`, NCM `38089299` e `38089199`,
CFOP `5102`, CST `00` + CSOSN `102`, `ibs_cbs_configuration = {}`), e `service_fiscal_profiles` = 0.

### 3.2 Campos faltantes estruturalmente (não existem colunas no schema)

O cadastro `public.microrganismos` **não possui** campos para: cepa/estirpe, finalidade/categoria
regulatória (inoculante / biofertilizante / agente biológico de controle), formulação, garantia
declarada em rótulo, unidade de garantia, titular do registro, fabricante, número/validade/situação
do registro MAPA-SIPEAGRO e referência de rótulo. `produto_conformidade_perfis` tem as colunas
(`registro_mapa`, `identificadores_regulatorios`, `identificadores_fiscais`, `advertencias`,
`responsavel_tecnico_*`) mas está **vazia (0 linhas)** e é ligada a `produto_id`, não a microrganismo.
Fonte parcial existente: `catalogo_volumes` (62 linhas, apresentação/volume/preço) e
`produto_etiquetas` (8 linhas, campos `cepas`, `composicao_resumida`, `validade_em`, `conservacao`).

---

## 4. Arquitetura NF-e atual

### 4.1 Fluxograma real (staging)

```
pedido B2B (create_partner_order_secure, hash de carrinho + advisory lock)
   -> gates: quote_only / crédito / aprovação
   -> entrega + conferência (rpc_entrega_registrar_conferencia_v1)
   -> accounts_receivable
   -> [ rascunho fiscal ] rpc_fiscal_draft_save / rpc_fiscal_draft_validate_homologation
   -> [ pré-validação ] Edge Function fiscal-preflight  ->  canTransmit = FALSE (hard-coded)
   -> ################ FIM DO FLUXO IMPLEMENTADO ################
        cálculo fiscal ..... AUSENTE
        XML NF-e 4.00 ...... AUSENTE
        validação XSD ...... AUSENTE
        assinatura XML-DSig  AUSENTE
        transmissão SEFAZ .. AUSENTE
        retorno/protocolo .. AUSENTE
        XML autorizado ..... AUSENTE
        DANFE .............. AUSENTE
```

### 4.2 O que existe

**Tabelas (todas com RLS habilitada):** `company_fiscal_settings`, `customer_fiscal_profiles` (0),
`product_fiscal_profiles` (2), `service_fiscal_profiles` (0), `microorganism_fiscal_profiles` (1),
`fiscal_certificates` (0), `fiscal_certificate_material` (0), `fiscal_invoices` (0),
`fiscal_invoice_items` (0), `fiscal_events` (0), `fiscal_idempotency_keys` (0), `fiscal_audit_log` (367),
`fiscal_operation_policies` (1), `fiscal_requirement_exemptions` (0), `fiscal_invoice_references`,
`fiscal_invoice_item_references`, `fiscal_stock_loss_contexts`.

**Views (`security_invoker = true`):** `v_fiscal_company_readiness`, `v_fiscal_certificate_readiness`,
`v_product_fiscal_readiness`, `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`,
`v_microorganism_fiscal_readiness`, `v_fiscal_document_reconciliation_pending`.

**RPCs (37 fiscais):** destaque para `rpc_fiscal_company_settings_init` (singleton com
`pg_advisory_xact_lock`), `rpc_fiscal_certificate_register_a1/_os/_revoke`, `rpc_fiscal_draft_save`,
`rpc_fiscal_draft_validate_homologation`, `rpc_fiscal_homologation_readiness_v2`,
`rpc_fiscal_company_rtc_get/save`, `rpc_fiscal_product_ibs_cbs_get/save`,
`rpc_fiscal_service_ibs_cbs_get/save`, `fn_fiscal_requirement_resolve`,
`rpc_upsert_fiscal_invoice_manual`, `rpc_associate_microorganism_fiscal_product`.
**Triggers de integridade:** `fiscal_invoice_items_state_guard`, `fiscal_sinief20_snapshot_immutable`,
`fiscal_audit_trigger`, `fn_audit_fiscal_status`, `fiscal_json_has_sensitive_key`,
`fiscal_validate_snapshot_keys` (bloqueio de chaves sensíveis em snapshots).

**Edge Functions fiscais (4):** `fiscal-preflight` (JWT + `has_role`, anon key, sem service_role,
retorna sempre `canTransmit=false`, `provider="NONE"`), `fiscal-cnpj-lookup` (BrasilAPI, não SEFAZ),
`fiscal-certificate-upload` (admin-only, PKCS#12 com node-forge, AES-256-GCM, IVs independentes,
bucket privado, service_role só no runtime), `fiscal-certificate-revoke` (admin-only, revogação lógica
+ remoção do material). Nenhuma delas registra log de XML, certificado ou segredo.

**Migrations fiscais principais:** `20260721000000_fiscal_fase2_fundacao`, `20260721010000_fase2_1_hardening`,
`20260722000000_fase3_0_1_integridade`, `20260723000000_fase3_15_central_config`,
`20260724000000_fase3_16_homologacao_certificados`, `20260725000000_homologation_readiness`,
`20260727000000_fase3_19_rtc_2026`, `20260728000000_rls_perfis_split_write`,
`20260731000000_revoke_structural_privileges`, `20260801000000_revoke_anon_table_privileges`,
`20260802000000_invoice_items_state_guard`, `20260803000000_certificates_revoke_anon`,
`20260804000000_microrganismos_product_association`, `20260805000000_rpc_associate_microorganism`,
`20260806000000_fiscal_microorganism_profiles`, `20260807000000_sinief_49_scaffolding`,
`20260808000000_sinief_20_2026`, `20260811000000_higienizacao_objetos_hml_sinteticos`.

### 4.3 O que NÃO existe (confirmado por varredura exaustiva do repositório)

Geração de XML NF-e 4.00; XSD vigente; assinatura XML-DSig com a chave do A1; endpoints SEFAZ por UF
(nenhuma URL de webservice no repositório); `tpAmb` 1/2 operacional; cálculo da chave de acesso de 44
dígitos com DV mod-11 e `cNF`; numeração sequencial de série/nNF com lock; contingência (EPEC/FS-DA/SVC);
consulta por chave; retry de transmissão; cancelamento; inutilização de numeração; CC-e; manifestação
do destinatário; DANFE (PDF); cálculo de tributos (ICMS/ST/PIS/COFINS/IPI/FCP/DIFAL); cálculo e leiaute
IBS/CBS/IS (só há cadastro de configuração RTC, sem motor nem tabelas versionadas por vigência);
EFD ICMS/IPI e qualquer rotina SPED; validação de destinatário `indIEDest`/IE/IBGE no ato da emissão;
transporte/frete/volumes/duplicatas/totalizadores e regras de arredondamento fiscal.

---

## 5. Gates operacionais (comprovação)

| Gate | Resultado |
|---|---|
| `quote_only` jamais fatura | ✅ pedido nasce `aguardando_cotacao`, valores zerados; `fn_b2b_order_priceable` bloqueia recebível |
| Preço vem de snapshot do servidor | ✅ `fn_resolve_b2b_cart` + `fn_b2b_cart_hash`; divergência → `price_changed`. Frontend não define preço |
| Idempotência / lock | ✅ `p_idempotency_key` obrigatório + `pg_advisory_xact_lock` + fingerprint canônico |
| Crédito | ✅ `fn_b2b_credit_exposure` (`credit_blocked_overdue` / `aguardando_aprovacao_credito`) |
| Duplicidade de NF-e por pedido/entrega | ⚠️ **não comprovável** — 0 documentos e nenhuma emissão real; não há constraint única `(partner_order_id)`/`(delivery_id)` para documento autorizado |
| Cancelamento/rejeição sem apagar histórico | ⚠️ parcial — colunas `canceled_at`/`rejected_at`/`cancel_reason` e `fiscal_events` existem; **sem RPC de cancelamento** |
| Documento autorizado imutável | ⚠️ parcial — `fiscal_invoice_items_state_guard` e `fiscal_sinief20_snapshot_immutable` existem; sem estado “autorizado” real para testar |
| Emissão só após entrega elegível | 🔴 **não existe trava SQL** ligando conferência de entrega à emissão fiscal (não há emissão a travar) |

---

## 6. Lacunas

### Críticas (bloqueiam qualquer emissão)
1. **Motor de emissão inexistente** — sem XML 4.00, XSD, assinatura, transmissão, protocolo, DANFE.
2. **Emitente não configurado** — CNPJ, IE, CNAE, endereço, IBGE, CEP, série NF-e ausentes; UF `GO` não comprovada.
3. **Sem certificado digital** (`fiscal_certificates` = 0) — impossível assinar.
4. **Sem credenciamento SEFAZ** (`fiscal_environment = NOT_CONFIGURED`, `nfe_enabled=false`).
5. **Sem numeração fiscal** — nenhuma tabela/RPC de série+nNF com lock transacional e sem reuso.
6. **23/24 microrganismos sem qualquer perfil fiscal**; o único existente é sintético e juridicamente inválido (CST 00 + CSOSN 102 sob CRT 3).
7. **Zero dados regulatórios MAPA/SIPEAGRO** — sem registro, titular, finalidade, formulação e rótulo, o NCM não pode ser determinado juridicamente.
8. **`product_id` NULL em 24/24** — não há ponte entre o microrganismo e a mercadoria efetivamente faturável.

### Altas
9. **Grants residuais para `anon`** (ALL) em `microrganismos`, `microorganism_fiscal_profiles`,
   `microorganism_targets`, `microorganism_technical_profiles`, `microorganism_crop_recommendations`,
   `fiscal_invoice_references`, `fiscal_invoice_item_references`, `fiscal_stock_loss_contexts` e nas
   6 views `v_*_readiness`. Mitigado hoje por RLS (todas as policies são `TO authenticated`) e
   `security_invoker=true`, mas **viola o requisito “grants sem PUBLIC/anon”**.
10. Perfis `DRAFT` sintéticos remanescentes em `product_fiscal_profiles` (2) contaminando prontidão.
11. RTC vazio (`rtc_configuration = {}`, `ibs_cbs_configuration = {}`) — sem preparo para NT 2025.002 / IBS-CBS-IS 2026.
12. Sem cadastro fiscal de clientes (`customer_fiscal_profiles` = 0) — destinatário não validável.
13. Edge Functions residuais de homologação ainda presentes no repositório: `hml-b2b-runtime-harness`, `fase-e-runtime-harness`.

### Médias
14. Sem SPED/EFD (não confundir com emissão — é escrituração posterior, também ausente).
15. Sem trava de duplicidade documento↔pedido/entrega.
16. `fiscal_certificates` sem policy de `INSERT/UPDATE` para `authenticated` (só `fc_read_metadata`) — correto por design, mas depende inteiramente das Edge Functions; registrar como decisão.
17. Modelo de dados de microrganismo sem campos regulatórios (item 3.2) — exige migration futura.

---

## 7. Fontes de verdade e duplicidades

| Domínio | Fonte de verdade | Duplicidade / risco |
|---|---|---|
| Emitente | `company_fiscal_settings` (singleton) | — |
| Item fiscal microrganismo | `microorganism_fiscal_profiles` | Sobreposição potencial com `product_fiscal_profiles` quando `product_id` for preenchido — **definir precedência antes de popular** |
| Apresentação/volume | `catalogo_volumes` | `produto_etiquetas.volume` replica sem vínculo fiscal |
| Regulatório/rótulo | `produto_conformidade_perfis` (vazia) | `produto_etiquetas.cepas/composicao_resumida` é fonte informal concorrente |
| Preço | `commercial_price_rules` + snapshot do pedido | ✅ único |
| Documento fiscal | `fiscal_invoices` + snapshots (`company_snapshot`, `customer_snapshot`, `fiscal_profile_snapshot`, `tax_snapshot`) | ✅ desenho correto de imutabilidade |

---

## 8. Matriz de permissões / RLS (resumo)

| Tabela | RLS | Policies | Papéis | anon |
|---|---|---|---|---|
| `company_fiscal_settings` | on | 4 | authenticated | 🔴 grant residual não; ok |
| `fiscal_invoices` | on | 5 (staff CRUD + leitura produtor) | authenticated | ok |
| `fiscal_certificates` | on | 1 (só leitura de metadados) | authenticated | ok |
| `fiscal_certificate_material` | on | **0** (acesso só service_role) | — | ok |
| `product_fiscal_profiles` | on | 4 | authenticated | ok |
| `microorganism_fiscal_profiles` | on | 2 | authenticated | 🔴 **grant ALL para anon** |
| `microrganismos` | on | 3 | authenticated | 🔴 **grant ALL para anon** |
| `v_*_readiness` | security_invoker | herdadas | authenticated | 🔴 **grant ALL para anon** |

---

## 9. Checklists

**NF-e modelo 55:** emitente ❌ · certificado ❌ · credenciamento ❌ · série/numeração ❌ · chave/cNF/DV ❌ ·
XML 4.00 ❌ · XSD ❌ · assinatura ❌ · transmissão por UF ❌ · tpAmb 2→1 ❌ · protocolo ❌ · XML autorizado ❌ ·
DANFE ❌ · contingência ❌ · cancelamento ❌ · inutilização ❌ · CC-e ❌ · consulta por chave ❌ ·
destinatário/IE/IBGE/indIEDest ❌ · transporte/volumes/duplicatas/totalizadores ❌ ·
idempotência ✅ (infra) · auditoria/eventos ✅ (infra) · imutabilidade de snapshot ✅ (infra) ·
segredos só no backend ✅.

**RTC (IBS/CBS/IS, NT 2025.002 e NTs 2026):** cadastro de configuração ✅ · valores preenchidos ❌ ·
CST/cClassTrib por item ❌ · reduções/diferimento/crédito presumido ❌ · tabelas versionadas por vigência ❌ ·
campos no leiaute ❌.

**SPED/EFD ICMS-IPI:** ❌ integralmente ausente (escrituração, não emissão).

---

## 10. Plano de correção em fases (proposta, reversível — NÃO EXECUTADO)

| Fase | Escopo | Reversão |
|---|---|---|
| F1 | Higienizar perfis fiscais sintéticos (1 micro + 2 produtos `DRAFT`) e revogar grants `anon` residuais | migration `REVOKE`/restore com baseline CSV |
| F2 | Completar `company_fiscal_settings` com dados reais do emitente + validação contábil | dados versionados por `configuration_version` |
| F3 | Modelo regulatório: colunas de cepa/finalidade/formulação/garantia + popular `produto_conformidade_perfis` com registro MAPA | migration aditiva (drop reversível) |
| F4 | Associar `microrganismos.product_id` via `rpc_associate_microorganism_fiscal_product` e definir precedência de perfil | `product_id = NULL` |
| F5 | Perfis fiscais item a item com validação contábil (NCM/CEST/CFOP/CST por CRT 3) | `profile_status` + histórico |
| F6 | Certificado A1 + credenciamento SEFAZ homologação (`tpAmb=2`) | revogação lógica já implementada |
| F7 | Numeração (série/nNF/cNF/chave com DV e lock), XML 4.00 + XSD, assinatura | forward-only com feature flag OFF |
| F8 | Transmissão/protocolo/contingência/retry, cancelamento, inutilização, CC-e, DANFE | flag OFF + ambiente 2 |
| F9 | RTC IBS/CBS/IS com tabelas versionadas por vigência | tabelas novas |
| F10 | EFD/SPED e BI fiscal | tabelas novas |

### Preenchimento automático — o que pode e o que não pode

**Alta confiança (derivável do próprio banco):** `commercial_unit`/`taxable_unit` = `L` e fator 1
(todas as apresentações são 5 L e 20 L); `origin_code = 0` se a produção for nacional (confirmar);
`fiscal_description` a partir de nome científico + concentração + volume; “SEM GTIN” quando não houver
GTIN cadastrado; código IBGE derivável do município **depois** que o município real for informado.

**Exige contador / MAPA — proibido inferir:** NCM, CEST, EX TIPI, CFOP por operação/destino,
CST ICMS (CRT 3), PIS/COFINS/IPI CST, cBenef, CST/cClassTrib de IBS/CBS/IS, CNAE, regime especial,
número/validade de registro MAPA-SIPEAGRO, finalidade regulatória e classificação da mercadoria.

---

## 11. Testes e evidências (somente leitura)

Todas as verificações foram `SELECT`/catálogo (`information_schema`, `pg_catalog`, `pg_policies`,
`supabase_migrations.schema_migrations`, `storage.buckets`) e leitura estática do repositório.
`rpc_fiscal_homologation_readiness_v2()` retornou `FISCAL_FORBIDDEN` sob a sessão de auditoria —
comportamento **esperado e correto** (fail-closed por papel), registrado como evidência de RBAC.
Nenhum `INSERT`/`UPDATE`/`DELETE`/`DDL` foi executado. Nenhum conteúdo de certificado, senha, IV,
DSN, token ou dado pessoal sensível foi lido, exibido ou exportado.

---

## 12. Confirmações finais

- Produção `navfzbwgwzruipouyfnk`: **não conectada, não consultada, não migrada, não alterada**.
- **Nada publicado.** Nenhuma alteração de dados fiscais, código funcional, migrations, certificados,
  secrets, usuários, pedidos ou documentos.
- Escopo não ampliado; nenhuma classificação fiscal foi preenchida nesta chamada.

## Status

# 🔴 NÃO APTO

Não apto para emissão de NF-e modelo 55, nem para implementação de emissão em staging, enquanto
persistirem as 8 lacunas críticas — em especial a ausência total do motor de emissão, a ausência de
emitente/certificado/credenciamento e a ausência de dados regulatórios MAPA que sustentem a
classificação fiscal de 24/24 microrganismos.
