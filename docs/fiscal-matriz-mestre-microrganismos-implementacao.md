# Matriz Fiscal Mestre v1 — Microrganismos · Implementação e correção das ressalvas

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não acessada.
Nenhuma publicação, nenhuma transmissão SEFAZ, nenhum secret gravado.

## 1. Escopo

Correção das três ressalvas da auditoria independente do commit `1d14c53e`:

| # | Ressalva | Correção |
|---|---|---|
| 1 | `CONDITIONAL` degradado para `LOW` | Domínio `mnc_conf_chk` evoluído para `LOW/MEDIUM/HIGH/CONDITIONAL`; 7 candidatos primários + 1 alternativo reconciliados; RPC e UI cientes |
| 2 | Rollback sem proveniência | Novo `public.fiscal_matrix_load_ledger` (campo a campo); `90-rollback.sql` só reverte `regulatory_category` quando o valor atual foi escrito pelo lote |
| 3 | Sem histórico oficial de migration | Encerrada: `supabase/migrations/20260824000000_matriz_fiscal_mestre_v1_microrganismos.sql` versionado, idêntico ao canônico (ver item 6) |

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


---

## Remediação final dos 3 bloqueios da auditoria (staging `ikaauvsflpmamgxmkhoq`)

### B1 — Vínculo de ambiente
- `.env` realinhado ao staging (`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, chave publicável = anon do `client.ts`).
- `client.ts` e `supabase/config.toml` conferidos: staging.
- 0 referências ao backend acidental (`yzszl…`) e 0 à produção (`navfzbwgwzruipouyfnk`) nos arquivos de conexão.
- Guarda permanente: `src/test/config/connection-binding.static.test.ts` — falha a suíte se `.env`/`client.ts`/`config.toml` divergirem do staging, se a chave do `.env` não for a anon do client, ou se produção/backend acidental aparecerem.

### B2 — Contrato de tipos
- `src/integrations/supabase/types.ts` restaurado do contrato completo (21.8k linhas) e estendido com `fiscal_matrix_load_ledger`.
- O mesmo teste estático reprova qualquer regressão a stub (`> 5000` linhas + relações críticas obrigatórias).

### B3 — Bloqueio server-side de candidato NCM `CONDITIONAL`
Migration `supabase/migrations/20260825000000_b3_conditional_block_ledger_acl.sql`
(byte-idêntica a `restoration/matriz-fiscal-microrganismos/01-migration-20260825000000_b3_conditional_block_ledger_acl.sql`,
SHA-256 `22e03297148c6dafd6d5a89092c58ef2edc135055864ec43ff01d8508fe68c01`):

- **Parte 0** — trava fail-closed: aborta em produção, aborta sem `public._fiscal_staging_marker` = `STAGING/ikaauvsflpmamgxmkhoq`.
- **Parte 1** — `rpc_regulatory_ncm_candidate_decide` recusa aprovação de candidato `CONDITIONAL` com `REGULATORY_NCM_CONDITIONAL_BLOCKED` (`55006`). Assinatura, `SECURITY DEFINER`, `search_path`, locks e demais validações preservados; rejeição continua permitida.
- **Parte 2** — constraint `microorganism_ncm_candidates_conditional_not_approved` impede `APPROVED` + `CONDITIONAL` mesmo por UPDATE direto.
- **Parte 3** — ACL do `fiscal_matrix_load_ledger`: `anon` e `PUBLIC` revogados; `authenticated` apenas leitura (sob RLS); escrita só por `service_role`/SECURITY DEFINER.
- **Parte 4** — invariantes: aborta se algum candidato sair de `PROPOSED`, se algum dossiê sair de `DRAFT`, se houver validação contábil, se a guarda sumir da RPC ou se `anon` mantiver SELECT.

Rollback reversível: `restoration/matriz-fiscal-microrganismos/91-rollback-b3.sql` (mesma trava de ambiente; reverte RPC, constraint e ACL sem tocar em dados).

### Evidências pós-aplicação (staging)
| Verificação | Resultado |
| --- | --- |
| Guarda `CONDITIONAL` na RPC | presente |
| Constraint criada | 1 |
| `anon` SELECT no ledger | `false` |
| ACL do ledger | `authenticated=rm`, `service_role=arwdDxtm` |
| Candidatos NCM | 28 `PROPOSED` (nenhum promovido) |
| UPDATE direto `CONDITIONAL→APPROVED` | recusado pela constraint |

### Regressão
- `tsgo --noEmit`: PASS
- `vitest`: **2776 PASS / 0 FAIL** (4 skipped, 171 arquivos)
- `build`: PASS

Produção `navfzbwgwzruipouyfnk` não acessada; nada publicado; nenhuma transmissão SEFAZ.

**Status: APTO_PARA_AUDITORIA_FINAL.**
