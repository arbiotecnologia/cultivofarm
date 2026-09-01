# Manifesto de Promoção — Staging `ikaauvsflpmamgxmkhoq` → Produção `navfzbwgwzruipouyfnk`

Fase P0/P1 — **inventário, classificação e dry-run**. Nenhum DDL/DML foi executado em produção.
Nenhum acesso de escrita a produção existe neste ambiente de trabalho (não há `PROD_DSN`).

- Repositório: `supabase/migrations` com **702** arquivos.
- Ledger do staging (`supabase_migrations.schema_migrations`): **644** versões.
- Versões no ledger do staging sem arquivo no repositório: **0** (nenhuma migration órfã).
- Arquivos no repositório sem registro no ledger do staging: **58**.
- Baseline declarado de produção: `20260819020208`.
- Última migration canônica do staging: `20260928000000_h6c_fin_helpers_acl_v1.sql`.

## 1. Delta cronológico posterior ao baseline de produção (42 arquivos)

Todos foram escritos como incrementais idempotentes, com guarda de ambiente. Classificação:

| # | Migration | Classe | Observação |
|---|-----------|--------|------------|
| 1 | 20260820000000_fase_f3_1_r1_revoga_anon_rpcs_fiscais | PROMOTE | Revoga EXECUTE de `anon` em RPCs fiscais |
| 2 | 20260821000000_fase_f3_1_r2_gate_ambiente_failclosed | PROMOTE-ADAPT | Gate fail-closed depende do marcador de ambiente (ver §4) |
| 3 | 20260822000000_fase_f4_motor_xml_nfe | PROMOTE | Motor XML NF-e 4.00 |
| 4 | 20260823000000_fase_f4_1_xsd_oficial | PROMOTE | Registro do bundle XSD oficial |
| 5 | 20260824000000_matriz_fiscal_mestre_v1_microrganismos | PROMOTE-ADAPT | Contém asserts de marcador de staging |
| 6 | 20260825000000_b3_conditional_block_ledger_acl | PROMOTE-ADAPT | Idem |
| 7 | 20260827000000_envase_acao_canonica | PROMOTE-ADAPT | Idem |
| 8 | 20260828000000_os_e2e_entrega_lote_finalizacao | PROMOTE | Fluxo OS entrega/lote/finalização |
| 9 | 20260830000000_os_esteira_acl_hardening | PROMOTE-ADAPT | Depende de `20260829000000` (já no baseline) |
| 10 | 20260831000000_os_e2e_fase5_idempotencia | PROMOTE | |
| 11 | 20260831010000_cq_desempate_determinismo | PROMOTE-ADAPT | |
| 12 | 20260831020000_envase_cq_trigger_determinismo | PROMOTE-ADAPT | |
| 13 | 20260831030000_finalizar_os_replay_idempotente | PROMOTE-ADAPT | |
| 14 | 20260901000000_cq_ordem_canonica | PROMOTE-ADAPT | Remove desempate por `ctid` |
| 15 | 20260902000000_os_guard_marker_canonico | PROMOTE-ADAPT | 11 referências a marcador de ambiente |
| 16–20 | 20260903000000/010000/020000/030000/040000 — comprovante de entrega v1..2.4 | PROMOTE-ADAPT | Motor documental + snapshot imutável |
| 21 | 20260905000000_hardening_digest_schema_v1 | PROMOTE | Qualifica `extensions.digest` (1.637 linhas) |
| 22 | 20260908000000_h3_base_tecnica_catalogo_v1 | PROMOTE | |
| 23 | 20260909000000_h3b_preco_canonico_fichas_v1 | PROMOTE | |
| 24 | 20260910000000_h4b_credit_approval_failclosed | PROMOTE | |
| 25 | 20260911000000_h5_reserva_atomica_idempotente | PROMOTE-ADAPT | Rollback: `31-rollback-h5-reserva-atomica.sql` |
| 26 | 20260912000000_h5b_ctx_reserva_forcado | PROMOTE-ADAPT | |
| 27 | 20260913000000_h5b_concorrencia_cq_imutavel | PROMOTE-ADAPT | |
| 28 | 20260914000000_h5c_cq_autoria_servidor | PROMOTE-ADAPT | |
| 29 | 20260914010000_h5c_envase_material_imutavel | PROMOTE-ADAPT | |
| 30 | 20260916000000_h6b_financeiro_idempotencia_valor_canonico | PROMOTE | |
| 31 | 20260917000000_h6c_financeiro_snapshot_b2b_credito | PROMOTE | |
| 32 | 20260917010000_h6c_backfill_payment_terms_link | PROMOTE (DML) | Backfill idempotente; validar no-op em produção |
| 33 | 20260918000000_h6c2_guard_integral_canonico | PROMOTE | |
| 34 | 20260919000000_h7_fiscal_hardening_v1 | PROMOTE-ADAPT | |
| 35 | 20260919010000_h7_fiscal_preflight_marker_v1 | PROMOTE-ADAPT | Marcador de preflight |
| 36 | 20260920000000_h7b_fiscal_idempotencia_ambiente_v1 | PROMOTE-ADAPT | |
| 37 | 20260920010000_h7b_gate_xml_record_e_marcador_v1 | PROMOTE-ADAPT | |
| 38 | 20260921000000_h6d_financeiro_delete_guard_snapshot_v1 | PROMOTE | |
| 39 | 20260922000000_h6e_financeiro_trigger_acl_v1 | PROMOTE | |
| 40 | 20260926000000_h7g_transporte_evento_sefaz_v1 | PROMOTE-ADAPT | Transporte SEFAZ (homologação) |
| 41 | 20260927000000_h7h_matriz_status_guard_v1 | PROMOTE | Máquina de estados da matriz fiscal |
| 42 | 20260928000000_h6c_fin_helpers_acl_v1 | PROMOTE | Helpers financeiros restritos |

`PROMOTE-ADAPT` = promovível **somente** após decisão explícita sobre o marcador de ambiente
(§4). Nada aqui pode ser aplicado antes do gate humano da fase P2.

## 2. QUARENTENA — 20 arquivos com nome UUID de `20260812134101` a `20260812135640`

**Nunca promover.** São artefatos de restauração do backend sandbox acidental
(`yzszl…`), não registrados no ledger do staging. Exemplo comprovado:
`20260812134101_604206f7….sql` executa `CREATE TYPE public.app_role AS ENUM
('admin','moderator','user')` e recria `public.user_roles`. O enum canônico do staging
tem 13 rótulos (`administrador … parceiro_b2b_tecnico`). Aplicar esses arquivos em
produção destruiria papéis e acessos. Ação P2: mover para
`restoration/quarentena-sandbox/` (fora da cadeia de migrations).

## 3. Restante dos 58 arquivos sem registro no ledger

Os 38 restantes são exatamente as migrations do delta §1 aplicadas fora de banda pelos
runners de `restoration/` (o ledger só registra até `20260823000000`). Consequência:
o ledger do staging **não** é fonte de verdade para reproduzir produção; a fonte de
verdade é a lista ordenada de arquivos do §1. Ação P2: reconciliar o ledger do staging
(inserção de versões já aplicadas, sem reexecutar SQL) antes de qualquer promoção.

## 4. Objetos e guardas exclusivos de staging (não promover como estão)

| Objeto | Tipo | Decisão |
|---|---|---|
| `fiscal_environment_marker` (1 linha, `STAGING`, `prod_allowed=false`) | tabela | Recriar em produção com rótulo `PRODUCTION` **somente** na fase de ativação fiscal, fora deste pacote |
| `_fiscal_staging_marker` (1) | tabela | STAGING-ONLY |
| `_f42_harness_fixtures` (14) | tabela | STAGING-ONLY |
| `_motor_b2b_pre_phase1_snapshot` (17) | tabela | STAGING-ONLY |
| `estoque_movimentacoes_orfaos_backup` (4) | tabela | STAGING-ONLY |
| `fn_fiscal_assert_staging_marker`, `fn_os_assert_staging_exato`, `fn_cockpit_is_hml_environment` | função | Promover a função, **não** o dado do marcador; sem marcador válido o comportamento é fail-closed |
| `seed_cockpit_fixtures`, `_seed_cockpit_fixtures_impl`, `_entrega_seed_checklist`, `rpc_harness_purge_entregas_v1` | função | STAGING-ONLY |

## 5. Contrato estrutural do staging (`expected/`)

Gerado somente-leitura em staging e usado pelo diff:

| Arquivo | Linhas |
|---|---|
| `expected/tables.tsv` | 225 (todas com RLS ativa) |
| `expected/functions.tsv` | 954 (647 `SECURITY DEFINER`) |
| `expected/triggers.tsv` | 316 |
| `expected/indexes.tsv` | 888 |
| `expected/enums.tsv` | 57 |
| `expected/buckets.tsv` | 14 (13 privados; `logos` público) |
| `expected/staging-ledger.tsv` | 644 |

Outros números do staging: 543 políticas RLS, 384 FKs, 24 views, 2 matviews,
18 usuários Auth, 29 objetos em Storage, 8 extensões
(`btree_gist`, `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`,
`supabase_vault`, `uuid-ossp`).

## 6. Ferramentas do pacote

| Script | Efeito |
|---|---|
| `10-inventario-readonly.sh` | Inventário de catálogo com `default_transaction_read_only=on`; aceita staging **ou** produção; não escreve nada |
| `20-diff-expected.sh` | Compara inventário do alvo com `expected/`; não conecta a banco |
| `30-dry-run-staging.sh` | Ensaio do delta §1 no staging, sempre em `BEGIN … ROLLBACK`, com segunda passagem para provar idempotência |

## 7. Bloqueios para a fase P2 (aplicação)

1. **Sem acesso a produção neste ambiente** — o diff real produção×staging exige
   `PROD_DSN` fornecido por um humano autorizado e execução do `10-inventario-readonly.sh`.
2. **Backup/PITR de produção** não confirmado — pré-condição obrigatória.
3. **Ledger do staging desalinhado** (§3).
4. **20 arquivos de quarentena ainda dentro de `supabase/migrations`** (§2).
5. **Releases H7e/H7k** não implantadas pelo pipeline oficial.
