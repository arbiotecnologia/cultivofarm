# P0 — Preflight de promoção H9 (somente leitura)

Data: 2026-09-10. Execução: **auditoria estática de arquivos apenas**.
Nenhuma migration aplicada, nenhum SQL executado, nenhum binding alterado,
nenhuma integração externa disparada.

## 0. Rastreabilidade

| Item | Valor |
|---|---|
| HEAD real do repositório nesta P0 | `bf9a39453d7afd028af5b8c5f26161f27cf2d9c6` |
| HEAD citado no prompt (auditoria H9-G/2G) | `da776d991457ee912733a7f6c384c69766ca52f4` |
| Ação sobre a divergência | **nenhuma** — sem `reset`, `revert` ou reescrita de histórico |
| Staging (homologação) | `ikaauvsflpmamgxmkhoq` |
| Produção | `navfzbwgwzruipouyfnk` — **não acessada** |
| Sandbox proibido | `yzszlzjpovmcteuxjznj` — **não acessado** |

O HEAD do prompt é um ancestral/estado anterior da mesma linha de trabalho; os
artefatos desta P0 são os únicos arquivos novos e não tocam código de aplicação.
Toda referência de conteúdo neste dossiê é ao HEAD real acima.

## 1. Base de comparação usada (sem acesso a banco)

A ferramenta SQL gerenciada disponível nesta sessão está vinculada ao sandbox
proibido. Portanto **nenhum ledger foi consultado nesta P0**. A reconstituição do
delta é determinística e verificável a partir de arquivos:

- `supabase/migrations/` contém **721** arquivos versionados.
- Exatamente **490** têm versão ≤ `20260723000000` — coincide, em contagem e em
  versão máxima, com a evidência do operador para produção (490 migrations,
  latest `20260723000000_fiscal_fase3_15_central_config`).
- **231** arquivos têm versão > `20260723000000`.
- **59** desses estão em quarentena permanente (`restoration/homologacao-h7/h7p-repo-only-manifest.json`),
  nenhum deles dentro da faixa de produção.
- **22** forwards H9 foram versionados fora de `supabase/migrations/`
  (`restoration/homologacao-h9/h9{c,d,e,g,gr}-forwards/`), dos quais 2
  (`20261025000000`, `20261026000000`) também existem em `supabase/migrations/`.

`(231 − 59) + 20 = 192` → o delta reconstruído bate **exatamente** com as 192
versões que o operador observou apenas em staging. Ainda assim, a confirmação
1:1 contra os dois ledgers reais é **pré-condição obrigatória da P1** (ver
`03-prechecks.sql`, bloco A).

## 2. Método de auditoria

Cada um dos 192 arquivos foi lido integralmente e submetido a detecção de:
guarda de ambiente, referência literal a project ref, DDL/DML destrutivo,
`session_replication_role`, desabilitação de trigger/RLS, acesso a
`auth.*`/`storage.*`, `CREATE EXTENSION`, `cron.*`, `pg_net`/HTTP,
`SECURITY DEFINER` sem `search_path`, `GRANT ... TO PUBLIC`, `GRANT ... TO anon`,
índices sem `CONCURRENTLY`, UUID literal (dado de homologação), material de
segredo/certificado e objetos de fixture/harness/marcador.

Resultado bruto: `01-manifesto-migrations.csv` (uma linha por versão, com
domínio, onda, classificação, motivo e flags).

## 3. Contagens por classificação

| Classificação | Qtde |
|---|---|
| PROMOVER | **71** |
| BLOQUEADA / REQUER_DECISÃO | **119** |
| STAGING_ONLY | **2** |
| SUBSTITUÍDA/SQUASHED | **0** (nenhuma comprovada estaticamente) |
| **Total** | **192** |

Motivos de bloqueio:

| Motivo | Qtde |
|---|---|
| Guarda fail-fast de staging (aborta fora de `ikaauvsflpmamgxmkhoq`) | 103 |
| DDL/DML destrutivo sem rollback provado (`DROP TABLE`, `TRUNCATE`, `DROP COLUMN`, `DELETE`) | 15 |
| Toca `auth.*` / RLS / replicação | 1 |

Flags relevantes no conjunto: `SECURITY DEFINER` em 137 arquivos;
`REF_STAGING_LITERAL` em 91; menção ao ref de produção em 48 (somente em
comentários/guardas, nunca como destino de execução); 37 com índice sem
`CONCURRENTLY`; 21 com bloco `STAGING_GUARD` explícito; 20 com `DELETE`;
10 com `TRUNCATE`; 5 com `DROP TABLE`; 3 com `SECURITY DEFINER` sem
`search_path`; 3 tocam `storage.*`; 3 tocam `cron.*`; 2 `CREATE EXTENSION`;
2 `DISABLE TRIGGER`; 1 toca `auth.*`.

**Zero** ocorrências de: referência ao sandbox, `GRANT ... TO PUBLIC`,
`session_replication_role`, `DISABLE ROW LEVEL SECURITY`, chave privada,
certificado ou senha embutidos.

## 4. Achado central da P0

**O pacote não é promovível como está.** 103 das 192 migrations abrem com uma
guarda fail-fast que aborta fora de `ikaauvsflpmamgxmkhoq`. Isso inclui os
forwards de segurança H9-C/H9-D e de visita H9-E/H9-GR — ou seja, justamente as
correções que a promoção precisa levar. Executá-las em produção falharia por
construção, que é o comportamento desejado hoje.

Consequência: antes da P1 é obrigatório produzir **cópias de promoção** dessas
migrations, com a guarda parametrizada (por exemplo, comparando
`current_setting('app.promotion_target', true)` contra o ref de destino
autorizado) em vez de fixada em staging, e sem qualquer UUID de fixture. Esse
trabalho de reescrita é uma fase própria (P0b), **não autorizada neste bloco**.

## 5. Artefatos STAGING_ONLY e dependências reais do código

Objetos exclusivos de homologação identificados na base:
`_f42_harness_fixtures`, `_fiscal_staging_marker`,
`_motor_b2b_pre_phase1_snapshot`, `estoque_movimentacoes_orfaos_backup`,
`fiscal_environment_marker`, `hml_fixture_registry`.

Migrations cujos statements tocam **exclusivamente** esses objetos (2):
`20260729004107_33189736-…`, `20260731162508_64dbda4c-…`. Nenhuma entra em onda.

**Correção de honestidade:** a busca textual reexecutável
(`rg` sobre `src/` e `supabase/functions/`) **encontra** referências. Elas foram
lidas uma a uma e classificadas:

| Origem | Objeto | Comportamento na ausência do objeto |
|---|---|---|
| `supabase/functions/fiscal-xml-engine/index.ts` | `_fiscal_staging_marker` | fail-closed benigno: sem o marcador a função devolve sempre a chave mestra normal; a via de teste é inalcançável |
| `supabase/functions/fiscal-binding-diagnostics/index.ts` | `fiscal_environment_marker` | diagnóstico: retorna `null` e segue |
| `supabase/functions/hml-b2b-runtime-harness/index.ts` | `_fiscal_staging_marker` | **lança `STAGING_GUARD`** — é harness de homologação |
| `src/test/fiscal/**` (guards, runners, testes estáticos) | `_fiscal_staging_marker` | somente teste; não vai para runtime de produção |

Conclusão: o aplicativo de produção **não depende** desses objetos, com **uma
exceção operacional**: a Edge Function `hml-b2b-runtime-harness` é de
homologação e **não pode ser deployada em produção** na onda P6. Registrado como
blocker 7 na §9. A verificação é reexecutável e está no runbook (`06`, passo 5).


## 6. Quarentena das 59 repo-only

Mantidas **BLOQUEADA_PERMANENTE**, fora do pacote. Nenhuma delas aparece no
manifesto (interseção = 0). Distribuição preservada: 36 refletidas
semanticamente, 3 superadas, 20 de backend estranho. Nenhum dossiê assinado que
autorize o contrário foi apresentado; portanto nada foi assumido.

## 7. Backup e ponto de restauração

A organização está no plano Free: há backup diário de plataforma, mas **não há
prova de restore point recente nem de teste de restauração**. Isto é um blocker
objetivo — nenhuma onda pode ser executada sem comprovação escrita e datada de
backup/PITR de produção.

## 8. Advisors — alvo da promoção

Produção hoje: 324 achados de segurança (incluindo **2 ERROR
`security_definer_view`**, 22 `anon SECURITY DEFINER`) e 1091 de performance
(383 `auth_rls_initplan`, 21 `no_primary_key`). A promoção deve **reduzir** os
2 ERROR e não pode aumentar o baseline aprovado da homologação (390 segurança /
503 performance).

## 9. Veredito P0

**NO-GO para execução controlada.** Blockers objetivos:

1. 103 migrations com guarda fixa de staging — precisam de cópias de promoção (P0b).
2. 15 migrations destrutivas sem rollback comprovado individualmente.
3. 1 migration tocando `auth.*` sem decisão registrada.
4. Backup/restore point de produção não comprovado.
5. Delta 192 ainda não confirmado contra os dois ledgers reais (sem acesso nesta P0).
6. 2 ERROR `security_definer_view` em produção sem correção mapeada no pacote.
7. Edge Function `hml-b2b-runtime-harness` é de homologação e deve ser excluída
   explicitamente do deploy da onda P6.

O manifesto, o plano de ondas, os prechecks/postchecks, o rollback por onda, o
runbook e o validador estático estão completos e revisáveis — mas a execução
permanece **não autorizada**.

## 10. Validação estática do pacote

`restoration/promocao-producao-h9/08-validacao-estatica.py` — resultado
`VALIDACAO_ESTATICA_OK`. Verifica: 192 linhas, 192 versões únicas, todas acima
de `20260723000000`, ordem cronológica, interseção zero com as 59 em quarentena,
existência de cada arquivo, ausência de referência ao sandbox, e — para toda
linha `PROMOVER` — ausência de guarda fixa de staging, de ref literal de
homologação, de UUID literal, de DDL destrutivo e de material de chave privada.
Confere também que todo `PROMOVER` tem onda, que nenhum não-promovível tem onda,
que os 8 artefatos da P0 existem e que os `.sql` desta fase não contêm nenhum
comando de escrita.


---

# ADENDO P0b — Resolução de blockers (somente arquivos, zero SQL)

Nenhum banco foi acessado. Nenhuma migration histórica foi editada. Nenhuma
Edge Function foi deployada. Nenhuma integração externa foi disparada.

## Artefatos criados nesta fase
`09-p0b-resolucao-guards.md`, `10-manifesto-artefatos-promocao.csv`,
`11-destrutivas-precheck-rollback.md`, `12-auth-schema-decision.md`,
`13-security-definer-views.md`, `14-edge-functions-manifest.csv`,
`15-cron-manifest.md`, `16-secrets-checklist.md`, `17-validacao-p0b.py`,
`gerar-promotion-sql.py` e 43 cópias derivadas em `promotion-sql/`.

## Blockers da P0 — situação
| # | Blocker P0 | Situação P0b |
|---|---|---|
| 1 | 103 guardas fixas de homologação | **RESOLVIDO em 100/103** — 54 comment-only promovem o histórico, 43 ganham artefato derivado com guarda canônica. 3 pendentes de reescrita manual. |
| 2 | 15 destrutivas sem rollback | **REDUZIDO a 3** — 9 são DELETE em corpo de função, 2 são só ACL, 1 é falso positivo. As 3 reais têm precheck de contagem, abort-on-nonzero e protocolo próprio. |
| 3 | migration auth/RLS | **RECLASSIFICADO** — não toca `auth`; o bloqueio real é a disponibilidade de Vault em produção. |
| 4 | 2 views security definer | **IDENTIFICADAS** — `vw_esteira_laboratorio` e `vw_fluxo_visita_tecnica`; correção já existe em `20260904130615`, alocada na onda P1. |
| 5 | 37 Edge Functions | **CLASSIFICADAS** — 9 preservar produção, 13 não deployar, 8 requerem segredo/config, 7 requerem decisão, 0 promovidas sem prova de authz. |
| 6 | Convergência de ledger | **ESTRATÉGIA DEFINIDA** — execução controlada + `migration repair` como registro + migration de convergência. A migration ainda não foi escrita. |
| 7 | Backup diário não comprovado | **ABERTO** — exige prova humana. |

## Blockers remanescentes (todos impedem P1)
1. reescrita manual revisada de `20260729004013`, `20260903182144`, `20261023000000`;
2. `20261003000000` (cron de auditoria) — aborta em produção por `md5(command)` divergente; exige leitura autorizada do baseline de produção;
3. disponibilidade e privilégio de `vault` em produção para `20260727161408`;
4. escrita da migration de convergência de ledger;
5. prova humana de backup/PITR.

## Validação
`python3 restoration/promocao-producao-h9/17-validacao-p0b.py` → **440 verificações OK, 0 falhas, `VALIDACAO_P0B_OK`**.
Gate de binding → **OK, homologação `ikaauvsflpmamgxmkhoq`**, sem conexão de banco.

## Veredito P0b
**NO-GO para a onda P1.** Cinco blockers permanecem, e nenhum deles é apenas a
prova humana de backup.


## Adendo P0c

Fechamento dos blockers técnicos em `18-p0c-fechamento-blockers.md`; validador
determinístico em `19-validacao-p0c.py`. Classificação final das 192 versões:
135 PROMOVER, 47 PROMOVIVEL_COM_ARTEFATO, 3 PROMOVIVEL_CONDICIONADO,
7 STAGING_ONLY, **0 BLOQUEADA**. Nenhum SQL executado, nenhum banco acessado,
nenhuma migration histórica editada. Veredito: NO-GO apenas pela prova humana
de backup/restore point.
