# RELATÓRIO F3.1 / F3.1-R1 — Prontidão e cálculo NF-e 55

## Ambiente

- Alvo: **staging** `ikaa****hoq` (project_ref validado a partir do `STAGING_DSN` secreto, sem impressão da URI).
- Produção `navf****fnk`: **não conectada, não consultada, não alterada**. Nenhuma NF-e transmitida.
- Secrets: `STAGING_DSN` disponível; nenhum valor ecoado.

## Ledger

| Momento | Versões |
|---|---|
| Antes desta execução | 639 (`20260818000000` já aplicada) |
| Após `20260819000000` (gate de ambiente) | 640 |
| Após `20260820000000` (revogação de anon) | **641** |

Como `20260818000000` **já constava no ledger remoto**, ela não foi editada. As correções auditadas foram entregues como migrations incrementais posteriores.

## Migrations aplicadas

| Versão | Arquivo | SHA-256 |
|---|---|---|
| 20260818000000 | `fase_f3_1_correcao_final.sql` | `9159196fd5caf4d23743805f47a7d8258e257a98933921cb5e0a08081e70f0ac` |
| 20260819000000 | `fase_f3_1_r1_gate_ambiente.sql` | `0d50182385210cdbb81897902eb35961dc1f1c592b45712d2151f9bba5f6eadc` |
| 20260820000000 | `fase_f3_1_r1_revoga_anon_rpcs_fiscais.sql` | `658da1cd1f48a9dbd0cdb9ea79b21497f2558d4e29f394f74c3170dde1fdaf01` |

Paridade canônica: `restoration/fase-f3-1-r1/migration.sql` é byte a byte idêntico a `20260819000000` (mesmo SHA-256). `migration-2-revoga-anon.sql` é idêntico a `20260820000000`.

## Bloqueios da auditoria e tratamento

1. **RLS não comprovada (T30/T31 antigos)** — o harness agora usa `pg_temp.probe()`, que executa `SET LOCAL ROLE authenticated`/`anon` e registra `current_user`, `row_security` e `rolbypassrls`. Todas as leituras de prova ocorreram com `current_user=authenticated` (ou `anon`), `row_security=on` e `bypassrls=false`. O executor privilegiado (`postgres`) é usado apenas para preparar/limpar fixtures e registrar resultados.
2. **SKIP tratado como PASS** — eliminado. Ausência de identidade, de emitente ativo, de produto ou de fixture agora gera `FAIL` + `RAISE EXCEPTION`. Descoberta relevante: o harness anterior procurava o papel `produtor`, inexistente (`cliente_produtor`), e por isso pulava silenciosamente a prova.
3. **Códigos genéricos `FISCAL_%`** — os casos de ambiente exigem literalmente `FISCAL_PRODUCTION_BLOCKED:`; os de devedor exigem `FISCAL_DEBTOR_RECIPIENT_MISMATCH:`.
4. **Rollback não executável** — `restoration/fase-f3-1-r1/rollback.sql` agora contém as definições anteriores verbatim (capturadas via `pg_get_functiondef`), restaura os grants de `anon` revogados e remove as duas versões do ledger; roda com `ON_ERROR_STOP` em transação única, sem apagar dados.
5. **"35 casos autenticados"** — corrigido: são **55 gates**, dos quais 13 são provas de sessão sob papel não privilegiado; os demais são estruturais/funcionais.

## Correções de fundo aplicadas

- **Gate de ambiente determinístico e fail-closed** (`fn_fiscal_assert_environment_homologation`), avaliado antes de qualquer leitura/efeito em `rpc_fiscal_calculate_invoice_v1` e `rpc_fiscal_reserve_nfe_number_v1`. `SECURITY DEFINER`, `search_path` fixo, sem `EXECUTE` para `PUBLIC`/`anon`.
- **Achado novo do harness (T54)**: cinco RPCs fiscais (`rpc_fiscal_company_settings_init`, `rpc_fiscal_draft_save`, `rpc_fiscal_draft_validate_homologation`, `rpc_fiscal_certificate_register_os`, `rpc_fiscal_certificate_revoke`) ainda eram executáveis por `anon`. Revogado em `20260820000000`, mantendo `authenticated`.

## Gates

- **Postcheck estrutural**: **52 / 52 PASS**.
- **Runtime harness** (transação sempre revertida): **55 / 55 PASS**, sem nenhum SKIP.

Evidência das provas de RLS (amostra registrada pelo próprio harness, sem dados sensíveis):

| Papel | Esperado | Evidência |
|---|---|---|
| administrador / gestor / financeiro | lê `fiscal_tax_rules` | `current_user=authenticated row_security=on bypassrls=false n=1` |
| tecnico_agronomo / parceiro_b2b / cliente_produtor | não lê | `current_user=authenticated row_security=on bypassrls=false n=0` |
| tecnico_agronomo / parceiro_b2b / cliente_produtor | não lê `fiscal_number_reservations` | `n=0` |
| tecnico_agronomo | não lê `fiscal_calculation_runs` | `n=0` |
| anon | não lê | `current_user=anon` → `permission denied for table fiscal_tax_rules` |

A fixture de `fiscal_tax_rules` é criada dentro da transação e comprovadamente visível (`n=1`) aos perfis internos, de modo que contagem zero nunca é confundida com sucesso. Inventário de policies (T45/T46) confirma uma única policy permissiva de leitura por tabela interna, sempre ancorada em `fn_fiscal_can_read_internal()` — nenhuma alternativa concede acesso por `OR`.

## Rollback exercitado

Executado em transação controlada e revertida:

| Objeto | Antes | Depois do rollback |
|---|---|---|
| `rpc_fiscal_calculate_invoice_v1` | `5c03479c1db1fd7d314da7e66f496a20` | `f9cfe023dbc0a82f8695a3ab20f17d4b` |
| `rpc_fiscal_reserve_nfe_number_v1` | `7fcf2dcab61fc7f3351633e91d44ec9b` | `f75ce36ab892a612848c5112be1db6e9` |
| `fn_fiscal_assert_environment_homologation` | presente | ausente |
| Ledger | 641 | 639 |

Após o `ROLLBACK`, o estado corrigido foi reconfirmado: ledger **641**, gate presente, `anon` sem `EXECUTE` nas cinco RPCs.

## Limpeza e integridade

- Resíduos de fixture: `clientes 'HARNESS F31R1%'` = 0, `fiscal_tax_rules 'HARNESS_F31R1%'` = 0.
- Triggers desabilitados no banco: 0.
- Nenhum snapshot, reserva, documento ou histórico foi removido.

## Regressão

- `tsgo --noEmit`: PASS.
- `vitest run`: **2744 passed**, 4 skipped, 167 arquivos.
- `vite build`: PASS.

## Status final

**APTO PARA F4 (staging)** — 52/52 postcheck, 55/55 runtime sem SKIP, rollback executável comprovado, produção não acessada.

---

# ADENDO F3.1-R2 — Gate de ambiente fail-closed e superfície mínima

## Ambiente

- Alvo: **staging** `ikaa****hoq` (validado pelo `STAGING_DSN` secreto **e** pelo marker oficial `public._fiscal_staging_marker`, sem impressão da URI).
- Produção `navf****fnk`: **PRODUCTION_NOT_ACCESSED** — não conectada, não consultada, não alterada; nenhuma NF-e transmitida.
- Nenhum secret, DSN, senha ou JWT foi impresso ou registrado.

## Ledger

| Momento | Versões | Última |
|---|---|---|
| Antes | 641 | `20260820000000` |
| Depois | **642** | `20260821000000` |

Como `20260818000000`, `20260819000000` e `20260820000000` já constavam no ledger, **nenhuma migration aplicada foi editada**. A correção foi entregue como **uma** migration incremental posterior.

## Migration aplicada

| Versão | Arquivo canônico | SHA-256 |
|---|---|---|
| 20260821000000 | `supabase/migrations/20260821000000_fase_f3_1_r2_gate_ambiente_failclosed.sql` | `9432f917fde7cac27ece991c9572ba5be3aeb7c44f74e8c458439f00a35aca09` |

Paridade canônica: `restoration/fase-f3-1-r2/migration.sql` é byte a byte idêntico (mesmo SHA-256).

## Achados tratados

1. **Gate não era fail-closed (A1).** `fn_fiscal_assert_environment_homologation` usava `coalesce(...,'2')` e retornava sem erro quando não havia emitente ativo. Agora:
   - 0 emitentes ativos → `FISCAL_EMITTER_NOT_CONFIGURED`;
   - >1 emitentes ativos → `FISCAL_EMITTER_AMBIGUOUS`;
   - `tpAmb` NULL ou fora de `{1,2}` → `FISCAL_ENVIRONMENT_INVALID`;
   - `tpAmb=1` → `FISCAL_PRODUCTION_BLOCKED`;
   - somente `tpAmb=2` prossegue.
2. **Superfície ampliada (A2).** O helper é interno (chamado pelas RPCs `SECURITY DEFINER`). `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated` e `service_role`; ACL final `postgres=X/postgres`.
3. **Funções de trigger fiscais (A3).** `REVOKE ALL ... FROM PUBLIC, anon, authenticated` em todas as `tg_fiscal%` retornando `trigger`.
4. **T54 ambíguo (A5).** A prova de ACL passou a usar `pg_proc.proacl` + `aclexplode` (tratando `proacl IS NULL` como **FAIL**, pois equivale a `EXECUTE` default para `PUBLIC`) e, de forma independente, `information_schema.routine_privileges`.
5. **Rollback incompleto (A3/A4 da auditoria).** Dois artefatos distintos, ver abaixo.

## Postcheck comportamental — 18 / 18 PASS

Executado em transação **revertida** (`restoration/fase-f3-1-r2/postcheck.sql`), sem alterar dados reais:

| Gate | Resultado |
|---|---|
| R2-01 helper presente | PASS |
| R2-02 `SECURITY DEFINER` + `search_path` fixo | PASS |
| R2-03 ACL explícita (não default) | PASS |
| R2-04 sem EXECUTE para anon/authenticated | PASS |
| R2-05 sem EXECUTE para PUBLIC (`grantee=0`) | PASS |
| R2-06 ausência de emitente → `FISCAL_EMITTER_NOT_CONFIGURED` | PASS |
| R2-07a índice singleton de emitente ativo presente | PASS |
| R2-07b ramo `FISCAL_EMITTER_AMBIGUOUS` no helper | PASS |
| R2-07c todos os códigos fail-closed presentes | PASS |
| R2-08a `tpAmb` NULL → `FISCAL_ENVIRONMENT_INVALID` | PASS |
| R2-08b domínio `tpAmb` protegido por CHECK | PASS |
| R2-09 `tpAmb=1` → `FISCAL_PRODUCTION_BLOCKED` | PASS |
| R2-10 `tpAmb=2` é o único caso aceito | PASS |
| R2-11 nenhuma `rpc_fiscal*` com EXECUTE para PUBLIC (`proacl`) | PASS |
| R2-12 nenhuma `rpc_fiscal*` com EXECUTE para `anon` | PASS |
| R2-13 `routine_privileges` sem PUBLIC/anon | PASS |
| R2-14 `tg_fiscal%` sem PUBLIC/anon | PASS |
| R2-15 nenhum trigger desabilitado | PASS |

Observações honestas sobre dois casos:
- **Multiplicidade (R2-07)** não pôde ser reproduzida por dados porque o índice único `ux_company_fiscal_settings_active_singleton` impede dois emitentes ativos. Provou-se a barreira física **e** a existência do ramo fail-closed no código do helper — não se afirma execução do ramo.
- **`tpAmb` fora do domínio (R2-08b)** é rejeitado pela constraint `cfs_nfe_environment_code_domain` antes de chegar ao helper; o helper cobre o caso NULL, comprovado em execução.

## Runtime harness — 57 / 57 PASS, sem SKIP

`restoration/fase-f3-1-correcao-final/runtime-harness.sql`, transação sempre revertida. T54 reescrito por catálogo; novos T55 (`information_schema`) e T56 (ACL do helper: `postgres=X/postgres`). Provas de RLS mantidas sob `SET LOCAL ROLE` com evidência `current_user=authenticated|anon`, `row_security=on`, `bypassrls=false`.

## Rollback — dois caminhos distintos, ambos exercitados

### 1. `restoration/fase-f3-1-r2/rollback-safe.sql` (padrão)

Restaura verbatim a definição anterior do helper e remove `20260821000000` do ledger, **sem reabrir** grants para PUBLIC/anon/authenticated.

| Fase | md5 do helper | Ledger | anon EXEC | authenticated EXEC |
|---|---|---|---|---|
| Antes | `8477985a61d21d647b23da3513c05c12` | 642 | f | f |
| Após rollback-safe | `c2aa575a933e360682b413126af54002` | 641 | f | f |
| Após ROLLBACK externo | `8477985a61d21d647b23da3513c05c12` | 642 | f | f |

O md5 `c2aa575a933e360682b413126af54002` corresponde exatamente à captura `pg_get_functiondef` feita antes da aplicação de R2.

### 2. `restoration/fase-f3-1-r2/restore-historical-exact.sql` (bloqueado por padrão)

Sem a variável, o script aborta: `BLOQUEADO: defina -v ALLOW_INSECURE_HISTORICAL_ROLLBACK=YES para prosseguir.` (verificado). Com a flag, restaura **toda** a cadeia `20260818000000 + 20260819000000 + 20260820000000 + 20260821000000`: funções, triggers, policies, grants, comments e URLs, por replay cronológico das migrations canônicas anteriores (SHA-256 registrados no próprio script) mais a remoção dos objetos introduzidos por F3.1.

Exercitado em transação controlada e revertida:

| Objeto | Estado corrigido | Após restauração histórica |
|---|---|---|
| `rpc_fiscal_calculate_invoice_v1` | `5c03479c1db1fd7d314da7e66f496a20` | `2cf10e35ffd7e03b4af221a23f4d6b46` |
| `rpc_fiscal_reserve_nfe_number_v1` | `7fcf2dcab61fc7f3351633e91d44ec9b` | `6e3e840e3c72b15953c6bdcddd90bf56` |
| `fn_fiscal_scenario_coverage` | `ffe68f12ea584bf53c56bc85a2ed4fa8` | `17a1a454c9f9e0f3f91bfa4d79e8ac22` |
| `rpc_fiscal_nfe_readiness_v1` | `8e7a1815e6a2d38249cdd2554f512f20` | `f43466248273b3a083a160642c864e61` |
| `fn_fiscal_emitter_pendencies_row` | `eafb0bbe0af9be113f5e780971a54111` | `8c26efc59dd9541cf09273a3ebedafb0` |
| `tg_fiscal_emitter_refresh_readiness` | `ea8480028819be1c2a0a3b581153e106` | `c890ae497c332392fe3a3b9fc8b185b2` |
| `fn_fiscal_assert_environment_homologation` | presente | ausente |
| `trg_fiscal_homologation_evidence_guard` | presente | ausente |
| `rpc_fiscal_*` com EXECUTE para `anon` | 0 | 5 (vulnerabilidade histórica reintroduzida) |
| Ledger | 642 | 638 |

Após o `ROLLBACK` externo, o staging voltou ao estado corrigido: ledger **642**, gate e guard presentes, **0** RPCs com `anon`.

## Limpeza e integridade

- `clientes 'HARNESS%'` = 0; `fiscal_tax_rules rule_key 'HARNESS%'` = 0.
- Triggers desabilitados no banco: **0**.
- Nenhuma reserva, snapshot, documento, regra ou trilha de auditoria foi removida.

## Regressão

- `tsgo --noEmit`: **PASS**.
- `vitest run`: **2744 passed**, 4 skipped, 167 arquivos.
- `vite build`: **PASS**.

## Status final

**APTO PARA F4 (staging)** — 18/18 postcheck comportamental, 57/57 runtime sem SKIP, dois rollbacks distintos exercitados com checksums, ledger 642, `PRODUCTION_NOT_ACCESSED`.
