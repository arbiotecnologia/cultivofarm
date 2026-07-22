> **ADENDO DE SUPERSESSÃO (Fase 3.12.1)** — O gate **B1** (diff de
> paridade staging × produção) foi encerrado: paridade confirmada
> após aplicação transacional da migration canônica
> `20260722000000_fiscal_fase3_0_1_integridade.sql` em produção.
> Fingerprint global de ambos os ambientes:
> `51d96b09508c2471c3bf13fe42f5b156`. Ver
> `docs/fiscal-fase3-12-1-paridade-confirmada.md`. Gates C, D e E
> permanecem inalterados e bloqueados por decisão humana externa. O
> mapa original abaixo é preservado como referência histórica.

# Fase Fiscal 3.11.5 — Mapa de gates restantes antes de homologação

Auditoria estritamente local e somente-leitura. Nenhum banco tocado.
Nenhuma alteração de runtime, UI, migrations, policies, schema, rotas,
feature flags ou integrações.

Baseline runtime desta auditoria: certificação 3.11.5
(`fiscal-fase3-11-5-certificacao-runtime.md`), 677/677 APTO, staging
temporário `ikaa***hoq`, commit `49c58e5871b14d99cc7a61c2cea7d19a703c1a95`.

## Classificação dos gates

### A) Já concluído (não é gate)

| Gate | Evidência local |
|---|---|
| Canonicalização de migrations de julho | 3.0.2-A/A1 (canônica em vigor) |
| Types fiscais (contrato local sincronizado) | Fase 3.0.2-D.1 + `scripts/verify-fiscal-types.ts` |
| Fundação fiscal (perfis empresa/produto/serviço/cliente, invoices, events, itens, idempotência, audit) | Fases 3.1 → 3.4 |
| Workflow documental manual auditável | Fase 3.5 (flag OFF) |
| Reconciliação assistida com concorrência otimista | Fase 3.6 (flag OFF) |
| Prontidão HEAD-only | Fase 3.7 |
| Preflight fail-closed server-side + PII mask | Fase 3.8 |
| Entrypoint edge não implantado | Fase 3.9 |
| Pacote de certificação staging + anti-produção | Fase 3.10 |
| Harness RLS SQL-nativo executável | Fases 3.11 → 3.11.4 |
| **Runtime completo do harness (677/677 APTO)** | **Fase 3.11.5 (esta)** |

### B) Executável no staging atual (sem novas migrations, sem decisão humana externa)

| Gate | Descrição | Onde vive hoje | Bloqueia? |
|---|---|---|---|
| B1. Diff de paridade policies staging → produção | Confirmar que as policies exercitadas em `ikaa***hoq` são idênticas às vigentes em `navfzbwgwzruipouyfnk` (leitura via `pg_policies` em cada ambiente, diff local). | Não existe script dedicado. `scripts/fiscal-staging-rls-certify.sql` só valida staging. | Antes de promoção |
| B2. Reexecução do harness após qualquer alteração de policy | Rerun determinístico do script 3.11.4 com mesma matriz 677. | Já preparado. | Só após mudança |
| B3. Sanity Vitest fiscal end-to-end contra staging (opcional) | Rodar `src/test/fiscal/rls/runner.ts` com fixtures reais em staging. Hoje o runner é fixture-based local; não conecta ao staging. | `runner.ts` local, sem transport HTTP para staging. | Nice-to-have |

### C) Exige staging limpo pré-migrations (backfill)

| Gate | Descrição | Artefatos locais |
|---|---|---|
| C1. Backfill de perfis fiscais para dados reais anteriores | Preencher `product_fiscal_profiles` / `service_fiscal_profiles` / `customer_fiscal_profiles` / `company_fiscal_settings` para linhas históricas com `profile_status`/`is_active` inconsistentes. | Fixtures em `restoration/backfill-fiscal-fase3/`; nenhum comando executado. |
| C2. Normalização de `fiscal_invoices.document_origin` legado | Garantir que registros pré-canônicos usem `MANUAL_RECORD` até que provedor exista. | Sem migration; requer dry-run em staging limpo. |
| C3. Idempotência de reruns do backfill | Verificar que scripts C1/C2 são reentrantes. | Falta harness de dry-run. |

### D) Exige geração externa oficial (types.ts)

| Gate | Descrição | Estado |
|---|---|---|
| D1. Regeneração de `src/integrations/supabase/types.ts` via Supabase CLI (não pelo agente) | Contrato local está sincronizado por inspeção estática (`scripts/verify-fiscal-types.ts`), mas a geração canônica cabe à CLI/CI humano. | Última regeneração humana registrada em `fiscal-types-provenance.md`. Requer nova rodada oficial antes da promoção. |

### E) Exige dados/decisão humana externa

| Gate | Descrição |
|---|---|
| E1. Seleção do provedor de emissão (Focus NF-e / Plugnotas / outro). |
| E2. Provisionamento do certificado digital A1/A3 e política de rotação. |
| E3. Cadastro dos dados fiscais reais da empresa (CNPJ, razão, CNAE, regime, IBGE) — o admin de produção precisa preencher `company_fiscal_settings` com singleton ativo real (o staging já tem um). |
| E4. Homologação junto à Receita/prefeitura (ambiente HOMOLOG oficial). |
| E5. Definição de webhooks/URLs de callback, secrets, timeouts e retry-policy. |
| E6. Aprovação humana explícita para ligar cada `FEATURE_FLAGS.fiscal*`. |
| E7. Revisão jurídica/contábil das regras (CFOP/CST/NCM/CEST/LC116) contra a operação real. |

## Estado das feature flags fiscais

Todas em `false` em `src/config/featureFlags.ts` (validado pelo teste
estático `flags fiscais permanecem false`). Nenhuma flag depende deste
documento para permanecer OFF.

## Recomendação objetiva da próxima fase mais segura e executável

**Próxima fase recomendada: Fase 3.12 — Diff de paridade de policies
staging × produção (gate B1), estritamente somente-leitura.**

Racional:

1. É o único gate imediatamente executável **sem** tocar produção (só
   `SELECT` em `pg_policies`, `pg_class`, `information_schema`),
   **sem** decisão humana externa e **sem** novo backfill.
2. Fecha a única incerteza estrutural que sobra após 3.11.5: a
   certificação runtime foi feita em staging; precisamos provar
   objetivamente que produção tem exatamente as mesmas policies para
   as 9 tabelas fiscais + 5 views + RPC exercitados.
3. Se o diff der zero divergências, a certificação 3.11.5 é
   automaticamente transferível a produção sem reexecutar o harness em
   produção. Se divergir, a lista de deltas orienta a próxima ação
   antes de qualquer outra fase.
4. Produz artefato local (`restoration/fiscal-fase3-12-policy-diff/`)
   auditável, com project refs mascarados, sem secrets.
5. Não depende dos gates C/D/E, que envolvem terceiros ou decisão
   humana.

Fases subsequentes recomendadas, em ordem de risco crescente e apenas
mediante autorização humana individual:

- **3.13 — Dry-run de backfill (C1/C2/C3)** contra staging limpo, com
  contagens pré/pós e rollback provado.
- **3.14 — Regeneração oficial de types.ts (D1)** pela CLI humana e
  reexecução de `scripts/verify-fiscal-types.ts`.
- **3.15+ — Fases E** (provedor, certificado, dados reais,
  homologação), cada uma com autorização explícita.

## Não iniciar automaticamente

Este documento é apenas mapeamento. Nenhuma fase seguinte é iniciada
sem prompt específico do responsável.
