# 25 — P1 CONCLUÍDA: CONVERGÊNCIA + AUTORIZAÇÕES EM PRODUÇÃO

**Data do relato:** 2026-09-10 (UTC-3)
**Alvo:** produção Supabase `navfzbwgwzruipouyfnk`
**Executor:** operador, execução manual autenticada na própria máquina (pooler de
sessão IPv4). O ambiente Lovable **não** executou SQL, não conectou a banco algum
e não observou o ledger nesta etapa.
**Veredito:** onda **P1 CONCLUÍDA**. **P2 permanece NO-GO** até autorização
explícita e revisão própria.

---

## 1. Natureza da evidência

Todos os números desta página são **evidência declarada pelo operador** após
execução manual. Não houve verificação independente por este ambiente.
Reconciliação independente exige reexecutar os blocos somente-leitura de
`03-prechecks.sql` e `04-postchecks.sql` e arquivar a saída em `evidencias/`.

## 2. Prechecks observados antes da execução

| Item | Valor confirmado |
|---|---|
| `current_database()` | `postgres` |
| `current_user` | `postgres` |
| Versão | PostgreSQL 17.6 |
| Guarda de alvo | `promocao.target_ref = 'navfzbwgwzruipouyfnk'` |
| Alvo apontou para sandbox/staging? | **não** |
| Ledger antes | **490** linhas, latest `20260723000000` |

## 3. Unidades executadas

| # | version | conteúdo | estado |
|---|---|---|---|
| 1 | `20261006000000` | `fn_run_recurring_generation` — authz | **aplicada + pós-checada** |
| 2 | `20261015000000` | `rpc_converter_visita_em_os` — authz sem oráculo | **aplicada + pós-checada** |
| 3 | `20261101000000` | convergência / estrutura de ledger de promoção | **aplicada + pós-checada** |
| 4 | views `security_invoker` | hardening das 3 views | **efeito aplicado em execução manual anterior; sem version no ledger — permanece assim, deliberadamente** |

### Arquivos usados na execução manual e seus hashes

| Arquivo | SHA-256 |
|---|---|
| `promotion-sql/p1-convergencia-ledger-manual-run.sql` | `89ebfac705ab6c2982f5c2adf23cba8e4f8954b61406dde468d2155a3899d75a` |
| `promotion-sql/p1-authz-migrations-manual-run.sql` | `1d32b7dc2b609c002f1cd49abc6a6c1f9865dae941579a2603900ed75d25b7df` |

Artefatos canônicos de origem, para diferenciação linha a linha:
`promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql`
(SHA-256 `65de029be6e90ea2bd76008df22273d8323cbd3272f3589a601025f5d50d7137`) e
`promotion-sql/20261102000000_p0d_security_invoker_views_v1.sql`
(SHA-256 `de9c450fff121a0ae78b62049c4703ae400a58a43c3f4e64c39a416542518f8b`).

## 4. Pós-checks declarados

| Verificação | Resultado |
|---|---|
| Ledger depois | **493** linhas, latest `20261101000000` |
| Entradas novas no ledger | **3** (`20261006000000`, `20261015000000`, `20261101000000`) |
| `public.promocao_execucao_registro` | **3** registros, todos `APLICADA` / onda `P1` |
| RLS em `promocao_execucao_registro` e `promocao_rollback_baseline` | habilitada |
| Policies nas duas tabelas | **zero** (deny-by-default) |
| `anon` / `authenticated` com SELECT | **não** |
| Tabelas de convergência com dados operacionais | vazias |
| `promocao_rollback_baseline` | **zero** baselines |
| Views com `security_invoker=true` | 3/3 (execução manual anterior) |
| Frontend publicado / Edge Functions / integrações externas | inalterados |

## 5. Separação explícita das views e do ledger

O hardening `security_invoker` das três views (`vw_esteira_laboratorio`,
`vw_fluxo_visita_tecnica`, `_src_vw_esteira_laboratorio`) foi aplicado por script
local equivalente, **antes** da convergência. Ele **não** está registrado no
ledger e **não** deve ser registrado retroativamente: nenhuma version fictícia
foi criada e `20261102000000` **não** foi marcada como aplicada. O efeito é real
e verificado; a rastreabilidade dele vive neste dossiê, não no ledger.

Consequência conhecida e aceita: como `promocao_rollback_baseline` está vazia, o
rollback `rollback-sql/20261102000000_..._rollback.sql` continua recusando por
desenho (`ROLLBACK_RECUSADO: baseline ... nao foi capturado`). Reverter as views
exigiria `ALTER VIEW ... RESET (security_invoker)` manual — operação que
reintroduz a vulnerabilidade e exige autorização humana explícita — ou PITR /
backup local pré-P1 (`AR-BIO_BACKUP_2026-09-10`).

## 6. Pendências de rastreabilidade

1. Arquivar em `restoration/promocao-producao-h9/evidencias/`, com SHA-256:
   `p1-security-invoker-production.sql` e as saídas brutas de pre/post-check das
   três unidades executadas.
2. Registrar no dossiê a saída literal do Security Advisor de produção pós-P1
   (a última leitura arquivada é 0 errors / 304 warnings / 21 suggestions,
   anterior à convergência).
3. Manter homologação `ikaauvsflpmamgxmkhoq` convergida com o mesmo par de
   versions, para que os dois ledgers avancem juntos.

## 7. Gate

- **Onda P1:** **GO — concluída.**
- **Onda P2:** **NO-GO / bloqueada** até autorização explícita, revisão de
  artefatos e arquivamento das evidências acima.
- Nenhum SQL foi executado por este ambiente nesta etapa; nenhum frontend
  publicado, nenhuma Edge Function implantada, nenhuma integração ativada.
