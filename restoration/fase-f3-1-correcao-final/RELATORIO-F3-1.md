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
