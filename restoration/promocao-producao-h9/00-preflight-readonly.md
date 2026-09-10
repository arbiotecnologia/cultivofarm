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

## 5. Artefatos STAGING_ONLY e prova de não dependência

Objetos exclusivos de homologação identificados na base:
`_f42_harness_fixtures`, `_fiscal_staging_marker`,
`_motor_b2b_pre_phase1_snapshot`, `estoque_movimentacoes_orfaos_backup`,
`fiscal_environment_marker`, `hml_fixture_registry`.

Migrations cujos statements tocam **exclusivamente** esses objetos (2):
`20260729004107_33189736-…`, `20260731162508_64dbda4c-…`.

Prova de não dependência do aplicativo: nenhuma referência a esses nomes existe
em `src/`, `supabase/functions/` ou nos tipos gerados — a busca textual retorna
somente arquivos de `restoration/`, `docs/` e `supabase/tests/`. A verificação é
reexecutável e está registrada no runbook (`06`, passo 2).

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

O manifesto, o plano de ondas, os prechecks/postchecks, o rollback por onda e o
runbook estão completos e revisáveis — mas a execução permanece **não
autorizada**.
