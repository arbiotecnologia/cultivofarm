# Matriz Fiscal Mestre v1 — Microrganismos · Implementação e correção das ressalvas

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não acessada.
Nenhuma publicação, nenhuma transmissão SEFAZ, nenhum secret gravado.

## 1. Escopo

Correção das três ressalvas da auditoria independente do commit `1d14c53e`:

| # | Ressalva | Correção |
|---|---|---|
| 1 | `CONDITIONAL` degradado para `LOW` | Domínio `mnc_conf_chk` evoluído para `LOW/MEDIUM/HIGH/CONDITIONAL`; 7 candidatos primários + 1 alternativo reconciliados; RPC e UI cientes |
| 2 | Rollback sem proveniência | Novo `public.fiscal_matrix_load_ledger` (campo a campo); `90-rollback.sql` só reverte `regulatory_category` quando o valor atual foi escrito pelo lote |
| 3 | Sem histórico oficial de migration | Artefato canônico versionado `20260824000000_matriz_fiscal_mestre_v1_microrganismos.sql` (ver ressalva aberta no item 6) |

## 2. Artefatos

- `restoration/matriz-fiscal-microrganismos/00-migration-20260824000000_matriz_fiscal_mestre_v1_microrganismos.sql`
  — guarda de ambiente fail-closed, domínio, ledger, carga/reconciliação idempotente, backfill de proveniência, asserções finais, RPC `rpc_regulatory_ncm_candidate_add` com `fn_regulatory_confidence_normalize`.
- `restoration/matriz-fiscal-microrganismos/90-rollback.sql` — reversão por proveniência.
- `src/components/fiscal/RegulatorioMicrorganismosSecao.tsx` — badge de confiança, aviso condicional, seletor de confiança no cadastro e bloqueio de aprovação de candidato `CONDITIONAL`.

`microorganism_ncm_candidates.confidence` é `text` + `CHECK` (não é ENUM físico), logo a evolução é
reversível: converter `CONDITIONAL` e reinstalar o CHECK anterior.

## 3. Evidências de validação (staging)

| Gate | Resultado |
|---|---|
| Microrganismos ativos | 27 |
| BAC-27 (resíduo de harness) | inativo |
| Perfis fiscais ativos DRAFT | 27 |
| Dossiês DRAFT | 27 |
| Checklists PENDING | 324 |
| Apresentações 1 L | 27 |
| Candidatos PROPOSED | 28 |
| Confiança do lote | HIGH 4 · MEDIUM 16 · CONDITIONAL 8 (7 primários + 1 alternativo do B. subtilis) |
| Candidatos aprovados | 0 |
| Validações contábeis / dossiês publicados | 0 |
| Ledger de proveniência | 20 registros (`regulatory_category`) |
| Idempotência (2ª execução) | checksum idêntico `8cce7ed0…` — PASS |
| Rollback com alteração humana posterior | preservada (1); lote 100% revertido; ledger consumido — PASS |
| RLS runtime `anon` / `authenticated` sem uid | 0 linhas — PASS |
| `fn_regulatory_confidence_normalize` | `conditional → CONDITIONAL`, `XX → NULL` (fail-closed) |
| Constraint | `mnc_conditional_not_approved_chk`: candidato CONDITIONAL nunca aprovado |

Faturamento real permanece bloqueado: nenhum perfil validado contabilmente, nenhum dossiê publicado,
`company_fiscal_settings` intocada, gates F1–F4 preservados.

## 4. Regressão

`tsgo --noEmit` limpo · build PASS · Vitest 2768 PASS.

## 5. Rollback

```bash
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction \
  -f restoration/matriz-fiscal-microrganismos/90-rollback.sql
```

Reversão lógica do domínio (opcional, após o rollback do lote):

```sql
UPDATE public.microorganism_ncm_candidates SET confidence = 'LOW' WHERE confidence = 'CONDITIONAL';
ALTER TABLE public.microorganism_ncm_candidates DROP CONSTRAINT mnc_conditional_not_approved_chk;
ALTER TABLE public.microorganism_ncm_candidates DROP CONSTRAINT mnc_conf_chk;
ALTER TABLE public.microorganism_ncm_candidates ADD CONSTRAINT mnc_conf_chk
  CHECK (confidence = ANY (ARRAY['LOW','MEDIUM','HIGH']));
```

## 6. Ressalva 3 — encerrada

O arquivo oficial está versionado no histórico do repositório:

- `supabase/migrations/20260824000000_matriz_fiscal_mestre_v1_microrganismos.sql`
- Byte a byte idêntico ao artefato canônico `restoration/matriz-fiscal-microrganismos/00-migration-20260824000000_matriz_fiscal_mestre_v1_microrganismos.sql`
- SHA-256 (ambos): `c1d21afd3336e4e2679ebcc233520d3376513b995dd21f17b697e15e58a2a3f2`
- Sem duplicidade de conteúdo e sem conflito de timestamp (`20260824000000` é único; o anterior é `20260823000000`).

A cópia foi feita por edição normal do repositório: nenhum tooling gerenciado foi ativado, nenhum
backend provisionado e nenhuma alteração em `.env`, `client.ts`, `config.toml`, `types.ts` ou vínculo
Supabase. A carga não foi reaplicada; o staging `ikaauvsflpmamgxmkhoq` permanece como validado.

A migration abre com a **PARTE 0 — trava de ambiente fail-closed**: aborta em produção
`navfzbwgwzruipouyfnk`, aborta se `public._fiscal_staging_marker` não existir e aborta se o marcador
`STAGING`/`ikaauvsflpmamgxmkhoq` não estiver presente (ausência de prova = recusa).

