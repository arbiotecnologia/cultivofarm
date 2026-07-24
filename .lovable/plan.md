# Fase 0 — Matriz Regulatória e Auditoria de Impacto (Ajuste SINIEF 49/2025 + 8/2026, 15/2026, 20/2026)

Auditoria somente leitura. Nada foi editado, migrado ou aplicado. Emissão permanece bloqueada.

## J. Estado real de emissão (verificado)

- `src/config/featureFlags.ts` → `fiscalEmissionEnabled: false` (TRAVA ativa).
- `supabase/functions/fiscal-preflight/index.ts` → resposta hardcoded `canTransmit: false as const`, `provider: "NONE" as const`, `production: false as const`; sem `service_role`; sem writes.
- `supabase/functions/_shared/fiscal/preflight.ts` → literal-type impede promoção mesmo com todos os gates `true`.
- `company_fiscal_settings.fiscal_provider` CHECK inclui `NONE|NOT_CONFIGURED|FOCUS_NFE|SEFAZ_DIRETO|NFSE_NACIONAL|MUNICIPAL`; `LOCKED_PROVIDER="NONE"` em `companyFiscalValidation.ts`.
- Nenhuma Edge Function referencia SEFAZ/provedor; Edge Functions existentes: `fiscal-preflight`, `fiscal-cnpj-lookup`, `fiscal-certificate-upload`, `fiscal-certificate-revoke`.
- Nenhum builder de XML NF-e/NFS-e no repositório.

## A. Inventário de superfícies afetadas

**Tabelas fiscais (18 migrations, `20260721…20260806`):**
`company_fiscal_settings`, `product_fiscal_profiles`, `service_fiscal_profiles`, `customer_fiscal_profiles`, `microorganism_fiscal_profiles`, `fiscal_invoices`, `fiscal_invoice_items`, `fiscal_events`, `fiscal_idempotency_keys`, `fiscal_audit_log`, `fiscal_certificates`, `fiscal_documents`, RTC 2026 (`20260727`), `microrganismos.product_id` (`20260804`), RPC `rpc_associate_microorganism_fiscal_product` (`20260805`).

**Colunas de `fiscal_invoices` hoje:** `document_model` (`NFE|NFSE|OTHER`), `document_origin` (`MANUAL_RECORD|EXTERNAL_IMPORTED|SYSTEM_PREPARED|PROVIDER_INTEGRATED`), `normalized_status`, `environment`, `provider`, `reconciliation_status`, `access_key`, `series`, `invoice_number`, `receivable_id`, snapshots (`company_snapshot|customer_snapshot|fiscal_totals_snapshot`), `payload_schema_version`, idempotência. **Não há** `finNFe`, `tpNFDebito`, `tpNFCredito`, `natOp`, `nf_referenciadas`, `nfe_referenced_id`, nem estruturas para DFeReferenciado por item.

**Itens (`fiscal_invoice_items`):** `source_item_type`, `source_item_id`, `item_kind ∈ {PRODUCT|SERVICE|OTHER}`, snapshots `fiscal_profile_snapshot`/`tax_snapshot`. **Não há** referência a NF-e original por item (necessário para recusa parcial e redução).

**Eventos (`fiscal_events.event_type`):** conjunto atual não cobre `SINIEF_ANTICIPATION_ISSUED`, `SINIEF_EFFECTIVE_SHIPMENT`, `SINIEF_STOCK_LOSS`, `SINIEF_REDUCTION`, `SINIEF_RETURN_REFUSAL`.

**Front (páginas/hooks/libs):** `pages/configuracoes/{FiscalEmpresa,FiscalProdutos,FiscalServicos,FiscalClientes}.tsx`, `pages/financeiro/NotasFiscais.tsx`, `components/fiscal/documentos/RascunhoWizard.tsx`, `components/financeiro/FiscalTab.tsx`, `components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx`, hooks `useFiscalDocuments`, `useFiscalRascunho`, `useFiscalReconciliation`, `useFiscalReadiness`, `useFiscalHomologationReadiness`, libs `documentWorkflowValidation`, `rascunhoWizardValidation`, `rascunhoSnapshots`, `labels/index.ts`.

**Domínios operacionais tocados pelo SINIEF (auditoria futura precisará mapear em detalhe):** contas a receber (`accounts_receivable` + espelhamento fiscal), pagamentos antecipados, pedidos/entregas (`ConfirmarEntregaFinanceiroDialog`, `fn_generate_receivable_from_entrega`), estoque/movimentações, produção/lotes/envase, portal do produtor (leitura de NFs por `customer_id`).

## B. Matriz requisito legal × suporte × lacuna

| # | Requisito SINIEF (03/08/2026) | Suporte hoje | Lacuna | Módulo | Risco | Solução proposta |
|---|---|---|---|---|---|---|
| 1 | **Antecipação** `finNFe=6`, `tpNFDebito=06`, CFOP 5.922/6.922, sem ICMS; saída efetiva `finNFe=1` + `refNFe` | Nenhum. Só `document_model` genérico | Campos `finalidade_nfe`, `tp_nf_debito`, `nat_op`, `referenced_invoice_id`, marcação "sem destaque ICMS" | fiscal_invoices, itens, financeiro (AR antecipado), builder XML futuro | Alto | Colunas aditivas nullable + tabela `fiscal_invoice_references` (N:1) + estados no workflow |
| 2 | **Perda de estoque** `finNFe=6`, `tpNFDebito=07`, CFOP 5.927, destinatário próprio, justificativa em `infAdFisco` | Nenhum. Sem fluxo próprio | Campos idem + `justificativa_fisco text`, integração com módulo estoque (movimento de baixa) | Estoque, fiscal, auditoria | Alto | Rota `/estoque/baixa-fiscal` com criação de fiscal_invoice `PURPOSE=STOCK_LOSS`; snapshot do lote |
| 3 | **Redução** NF-e entrada, `finNFe=5`, `tpNFCredito=04`, CFOP inverso, `refNFe` da original, mesmo destinatário, apenas valores/qtd deduzidos | Nenhum | Direção "entrada" ausente; `finNFe/tpNFCredito` ausentes; validação "apenas dedução vs original" ausente | Fiscal, financeiro (nota de crédito), pedidos | Alto | Coluna `direction ∈ {OUT,IN}` + `tp_nf_credito` + validador cruzado com NF-e original |
| 4 | **Recusa** entrada, `finNFe=5`, `tpNFCredito ∈ {03 total, 06 parcial}`; total: `refNFe`; parcial: `DFeReferenciado` por item; itens não entregues em `prod` | Nenhum | Referência por item ausente; falta workflow parcial vs total; falta integração com entrega recusada | Entregas, fiscal, estoque (retorno) | Alto | Colunas em `fiscal_invoice_items` (`referenced_item_seq`, `referenced_access_key`, `not_delivered_reason`) |
| 5 | ICMS na perda quando UF exigir (03/08/2026) | Sem cálculo de tributo | Sem motor tributário — projeto declara "não inventar tributação" | Fiscal, contábil | Bloqueante | Marcar como **BLOQUEADO até validação contábil**; expor apenas placeholder editável |
| 6 | Estorno/escrituração por UF | Não existe | Sem SPED, sem escrituração | Contábil | Médio | Fora de escopo — registrar como dívida técnica |

## C. Modelo de estados e vínculos

```
NF-e ORIGINAL (finNFe=1, saída)
   │
   ├─► ANTECIPAÇÃO (finNFe=6, tpNFDebito=06, CFOP 5.922) — referenced_by SAÍDA_EFETIVA
   │       └─► SAÍDA_EFETIVA (finNFe=1) refNFe→ANTECIPAÇÃO
   │
   ├─► REDUÇÃO (finNFe=5 entrada, tpNFCredito=04) refNFe→ORIGINAL
   │       (apenas valores/qtd; destinatário = destinatário original)
   │
   └─► RECUSA (finNFe=5 entrada)
           ├─ TOTAL/NÃO_LOCALIZAÇÃO (tpNFCredito=03) refNFe→ORIGINAL
           └─ PARCIAL (tpNFCredito=06) DFeReferenciado por item

PERDA_ESTOQUE (finNFe=6, tpNFDebito=07, CFOP 5.927) — autônoma, destinatário=própria empresa
```

Requer tabela associativa `fiscal_invoice_references (id, invoice_id, referenced_access_key, referenced_invoice_id NULL, relation_type ∈ {ANTICIPATION_OF, EFFECTIVE_OF, REDUCTION_OF, REFUSAL_TOTAL_OF, REFUSAL_PARTIAL_OF}, item_sequence NULL)`.

## D. Matriz operacional por cenário

| Operação | Estoque | Financeiro | Pedido/Entrega | Fiscal | Auditoria |
|---|---|---|---|---|---|
| Antecipação | não movimenta | AR "recebimento antecipado" | pedido aberto, sem entrega | NF antecipação | evento `ANTICIPATION_ISSUED` |
| Saída efetiva | baixa lote | quita/mantém AR | entrega confirmada | NF saída `refNFe`→antecipação | `EFFECTIVE_SHIPMENT` |
| Perda | baixa por perda (motivo) | sem AR | sem pedido | NF perda | `STOCK_LOSS` |
| Redução | ajuste qtd (se aplicável) | nota de crédito no AR | pedido revisto | NF entrada redução | `REDUCTION_ISSUED` |
| Recusa total | retorno integral lote | estorno AR | entrega marcada recusada | NF entrada recusa total | `RETURN_REFUSAL_TOTAL` |
| Recusa parcial | retorno parcial lote | estorno parcial AR | itens marcados recusados | NF entrada com DFeReferenciado por item | `RETURN_REFUSAL_PARTIAL` |

## E. Reutilizáveis × Aditivos

**Reutilizáveis:** `fiscal_invoices` (id, series, invoice_number, access_key, snapshots, environment, provider, reconciliation_status, receivable_id), `fiscal_invoice_items.source_item_type/id`, `fiscal_events` (extensível), `fiscal_idempotency_keys`, `fiscal_audit_log`, `product_fiscal_profiles`, `microorganism_fiscal_profiles`, workflow de rascunho.

**Aditivos necessários (todos NULLABLE, todos aditivos):**
- `fiscal_invoices`: `direction text CHECK IN ('OUT','IN')`, `fiscal_purpose text CHECK IN ('NORMAL','COMPLEMENT','ADJUSTMENT','RETURN','ANTICIPATION','EFFECTIVE_SHIPMENT','STOCK_LOSS','REDUCTION','REFUSAL_TOTAL','REFUSAL_PARTIAL')`, `fin_nfe smallint`, `tp_nf_debito smallint`, `tp_nf_credito smallint`, `nat_op text`, `justificativa_fisco text`, `sinief_scenario text`.
- Nova `fiscal_invoice_references` (ver C).
- `fiscal_invoice_items`: `referenced_item_sequence int`, `referenced_access_key text`, `not_delivered_reason text`, `is_effective_delivery boolean`.
- `fiscal_events.event_type` CHECK ampliado com os 6 tipos SINIEF.
- Sem novas RLS mais permissivas — reutilizar policies existentes (`administrador`/`financeiro` para escrita; leitura conforme padrão).

## F. Regras UF/regime bloqueadas até validação contábil

- Alíquota ICMS aplicável à perda a partir de 03/08/2026.
- CFOP diferente do padrão em operações interestaduais (5.922↔6.922, 5.927 e inversos de redução/recusa) — apenas expor campos, sem heurística.
- Regras de escrituração/estorno por UF.
- Substituição tributária, ST, DIFAL sobre perda.
- Retenção de ISS em cenários de retorno de NFS-e (SINIEF trata NF-e; NFS-e permanece fora do escopo dos 4 cenários).

Todos os campos tributários entram como texto/numérico opcional e revisão obrigatória pela contabilidade antes de qualquer transmissão.

## G. Matriz de permissões proposta

| Ação | administrador | financeiro | gestor | administrativo | tecnico_agronomo | cliente/parceiro |
|---|---|---|---|---|---|---|
| Criar NF antecipação/redução/recusa/perda | ✔ | ✔ | — | — | — | — |
| Editar snapshot / referências | ✔ | ✔ | — | — | — | — |
| Emitir eventos SINIEF | ✔ | ✔ | — | — | — | — |
| Ler NFs (todas) | ✔ | ✔ | ✔ | leitura | — | somente próprias |
| Executar baixa fiscal de estoque | ✔ | ✔ | — | — | — | — |
| Transmitir a SEFAZ | **NÃO — flag `false`** | | | | | |

Mantém padrão existente; nenhuma RLS afrouxa.

## H. Testes obrigatórios por cenário

**Positivos:** cada uma das 4 operações compõe um rascunho válido; referências obrigatórias presentes; snapshots imutáveis; eventos SINIEF gravados; idempotência preservada; readiness diferencia direções OUT/IN.

**Negativos:** antecipação sem CFOP 5.922/6.922 é recusada; redução sem `refNFe` original é recusada; recusa parcial sem `DFeReferenciado` por item é recusada; perda sem justificativa é recusada; nenhuma operação SINIEF permite `canTransmit=true`; edição de campos após LOCK é recusada; tentativa de escrever direto em `fiscal_invoices` sem RPC é bloqueada por RLS; role fora da matriz recebe `permission_denied`; provider ≠ `NONE` é rejeitado; item `referenced_item_sequence` inexistente na NF original é rejeitado.

**Estáticos:** migrations exclusivamente aditivas; enum ampliado sem remover valores; `fiscalEmissionEnabled=false` invariante; ausência de URL de SEFAZ/provedor.

## I. Plano detalhado Fases 1–7 (gate APTO/INAPTO por fase)

- **Fase 1 — Modelagem canônica (SQL + tipos).** Migration aditiva `20260807…_sinief_49_scaffolding.sql` (colunas + tabela `fiscal_invoice_references` + expansão do CHECK de `fiscal_events`), stub em `restoration/`, atualização de `src/integrations/supabase/types.ts` **apenas via regeneração oficial**. Gate: static tests + typecheck + build.
- **Fase 2 — Domínio & validação puros.** `src/lib/fiscal/sinief/` com enums (`FiscalPurpose`, `FinNFe`, `TpNFDebito`, `TpNFCredito`), validadores por cenário, referências. Sem I/O. Gate: 100% cobertura dos validadores.
- **Fase 3 — Workflow de rascunho por cenário.** Estender `rascunhoWizardValidation` + `rascunhoSnapshots` + UI `RascunhoWizard`. Gate: matriz UI × cenário verde.
- **Fase 4 — Integração operacional.**
  - 4a Estoque: rota "Baixa fiscal (perda)".
  - 4b Financeiro/AR: antecipação e saída efetiva.
  - 4c Entregas: recusa total/parcial dispara rascunho de NF entrada.
  - 4d Pedidos: redução ligada à NF original.
  Gate por sub-fase.
- **Fase 5 — Readiness & auditoria.** Novos gates em `readinessValidation`, novos `event_type`, painel em `NotasFiscais.tsx`. Gate: preflight retorna evidências novas; nunca promove `canTransmit`.
- **Fase 6 — RLS/roles.** Confirmar policies em novas tabelas; sem afrouxar; tests estáticos de policy parity.
- **Fase 7 — Homologação assistida (sem SEFAZ).** Fixtures em `restoration/fiscal-homologation-fixtures/`, documentação por UF **em branco**, checklist para contabilidade. Gate final: `fiscalEmissionEnabled` continua `false` e nenhum caminho novo consegue promovê-lo.

Cada fase começa somente após prompt explícito, aceite formal e classificação APTO na anterior — regra Core do projeto.

## K. Riscos críticos e ordem recomendada

1. **R1 — Regeneração de `types.ts`:** projeto usa Supabase gerenciado externamente; sem `SUPABASE_ACCESS_TOKEN` no ambiente. **Bloqueia** Fase 1 se não confirmado.
2. **R2 — Sem builder XML/adapter provedor:** Fases 1–5 são seguras sem isso; Fase 7 depende de decisão futura fora de escopo.
3. **R3 — Cálculo tributário por UF:** deve ficar declarado como responsabilidade contábil; nunca inferido pelo sistema.
4. **R4 — Impacto em estoque e AR:** 4a/4b/4c/4d exigem migrations aditivas em módulos não-fiscais (movimentos, `accounts_receivable`); risco de regressão financeira — obrigatoriamente com dry-run e testes E2E.
5. **R5 — Retrocompatibilidade de `fiscal_invoices` legadas:** todos os novos campos NULLABLE; UPDATE de backfill apenas para `direction='OUT'` e `fiscal_purpose='NORMAL'` onde `document_origin='MANUAL_RECORD'`.

Ordem recomendada: **1 → 2 → 3 → 4a → 4b → 4c → 4d → 5 → 6 → 7**.

## Classificação final

**APTO COM RESSALVAS PARA FASE 1**, condicionado a:

1. Confirmar que a regeneração oficial de `src/integrations/supabase/types.ts` será realizada externamente pelo humano após a migration da Fase 1 (mesmo procedimento já usado em fases anteriores).
2. Aceitar explicitamente que Fase 1 aplica **apenas** migration aditiva no ambiente (fora do Lovable) e que campos tributários permanecem sem cálculo automático.
3. Manter `fiscalEmissionEnabled=false` como invariante contratual até Fase 7 fechada com validação contábil.

Não avançar sem novo prompt específico para Fase 1.
