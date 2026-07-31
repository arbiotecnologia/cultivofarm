# Gate de promoção — Motor Comercial B2B

Documento **único e canônico** do gate. Substitui qualquer afirmação anterior de
"promoção liberada tecnicamente".

| Campo | Valor |
|---|---|
| Gate | **`BLOCKED`** — ensaio transacional **não executado com sucesso** (erro real em §4.1); asserções de estado 12/12 PASS não substituem o replay |
| `REHEARSAL_DONE` | **não emitido** |
| Execução em produção | **`PRODUCTION_NOT_EXECUTED`** |
| Autorização humana | recebida de forma ampla; **promoção continua bloqueada pelo gate técnico** |
| Destino | `navfzbwgwzruipouyfnk` (produção) — intocado neste ciclo |
| Origem certificada | `ikaauvsflpmamgxmkhoq` (staging) |
| Timestamp UTC | `2026-07-30T21:54:00Z` (correções pós-4ª tentativa: manifest canônico restrito a 35 artefatos permanentes, marcador fail-closed, baseline comparável) |
| Commit base | `0469a34138181ac227328cc1b562b2372cec05c9` |
| Responsável | Renato S. Cunha |
| Artefato | `restoration/promocao-b2b/` (28 passos + preflight + postflight + rollback + manifest) |

---

## 1. Escopo executado neste ciclo

- Auditoria do pacote anterior (`restoration/promocao-b2b/README.md`) e das 19
  migrations normalizadas.
- **Contradição confirmada e corrigida:** o pacote anterior declarava promoção
  liberada, mas as migrations históricas contêm
  `RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado'` — o replay
  em produção **falharia por construção**. Além disso, tolerar marker ausente
  enfraquecia a prova de ambiente.
- **Correção:** migrations históricas preservadas como registro; criado artefato
  de promoção separado, forward-only, com verificação de destino **fail-closed**
  centralizada (executor + parâmetro efêmero de sessão).

## 2. Arquivos criados/alterados

```
restoration/promocao-b2b/000_preflight.sql                (novo)
restoration/promocao-b2b/090_postflight.sql               (novo)
restoration/promocao-b2b/099_rollback_forward_safe.sql    (novo)
restoration/promocao-b2b/rehearsal-staging.sh             (novo)
restoration/promocao-b2b/run-rehearsal-from-secret.sh    (novo, via temporária de uso único)
restoration/promocao-b2b/cleanup-rehearsal-executor.sh   (novo, via temporária de uso único)
restoration/promocao-b2b/apply-production.sh.BLOCKED      (novo, bloqueado)
restoration/promocao-b2b/manifest.json                    (novo, com hashes, 35 artefatos permanentes)
restoration/promocao-b2b/steps/*.sql                      (28 passos, novos)
restoration/promocao-b2b/README.md                        (reescrito)
docs/motor-b2b-fase7-certificacao-final.md                (veredito corrigido)
docs/motor-b2b-promocao-gate.md                           (este documento)
```

Hashes `sha256` de **todos** os arquivos do pacote: `restoration/promocao-b2b/manifest.json`
(campo `files[]`), com `source_sha256` de cada migration histórica de origem em `steps[]`.

## 3. Evidências executadas (staging `ikaauvsflpmamgxmkhoq`, somente leitura)

Consulta com o conteúdo exato das 12 asserções do postflight:

| # | Verificação | Obtido | Esperado | Resultado |
|---|---|---|---|---|
| 1 | `create_partner_order_secure/9` existe e contém `reqfp_v2` | `true` / `true` | `true` | ✅ |
| 2 | overloads de `create_partner_order_secure` | `1` | `1` | ✅ |
| 3 | `fn_b2b_cart_hash` com prefixo `v2\|` | `true` | `true` | ✅ |
| 4 | trigger `trg_b2b_block_receivable_before_approval` | `true` | presente | ✅ |
| 5 | `fn_b2b_credit_exposure` — `comprometido_nao_faturado`, `receivable_generated`, `'aprovado'` presentes; `'pendente'` ausente | `true,true,true,false` | idem | ✅ |
| 6 | `commercial_payment_plans` legível por `authenticated` | `false` | `false` | ✅ |
| 7 | `partner_order_idempotency.request_fingerprint` | `true` | presente | ✅ |
| 8 | funções B2B executáveis por `anon`/`PUBLIC` | `0` | `0` | ✅ |
| 9 | tabelas do motor B2B sem RLS | `0` | `0` | ✅ |
| 10 | triggers desabilitados em `public` | `0` | `0` | ✅ |
| 11 | `_motor_b2b_fase7_proofs` ausente | `true` | ausente | ✅ |
| 12 | `fn_b2b_status_is_operational` / `_is_approved_or_later` | `true` | presentes | ✅ |
| — | `pgcrypto` instalada | `1` | `1` | ✅ |
| — | `server_version_num` | `170006` | `≥ 150000` | ✅ |

Higiene estática do pacote (busca no diff):
- refs de produção/staging em SQL executável: **0** (apenas comentários e as
  comparações intencionais do preflight/executor).
- `_fiscal_staging_marker` / `STAGING_GUARD` nos passos: **0**.
- `ALTER TABLE ... DISABLE TRIGGER`: **0**.
- fixtures `GATE-RUNTIME` / `FASE7` / UUIDs de teste: **0** (o único literal UUID
  é o sentinela `00000000-0000-0000-0000-000000000000`).
- secrets/tokens: **0**; `SUPABASE_SECRET_KEY` não foi lido, exibido ou usado.
- `TRUNCATE`/`DELETE` de dados de negócio fora de corpo de função: **0**.

Validações do repositório: `tsc --noEmit` **PASS**, `vitest run` **PASS**,
`vite build` **PASS** (ver §6).

## 4. Pendências (bloqueiam o 100% APTO)

### 4.1 Ensaio transacional — tentado neste ciclo, `BLOCKED`

Tentativa: chamada única `BEGIN; SET LOCAL promo.*; 000_preflight; 28 steps;
090_postflight; 2ª passagem (28 steps + postflight); ROLLBACK;` montada inline a
partir do conteúdo real do pacote (652.104 bytes, 28 passos, sem `\i`), via o
conector Supabase vinculado (`supabase--read_query`). Nenhuma migration de
harness foi criada; nada foi persistido.

Prova de capacidade do conector (bloco mínimo, mesmo envelope transacional):

```sql
BEGIN; CREATE TEMP TABLE _rehearsal_probe(a int); ... ROLLBACK;
```

Erro real retornado:

```
ERROR: 25006: cannot execute CREATE TABLE in a read-only transaction
```

Confirmado por `SELECT current_setting('transaction_read_only')` → `on`. O
conector executa **toda** consulta em transação somente-leitura, portanto não
suporta o DDL/DML do delta nem em `BEGIN … ROLLBACK`. O sandbox tem binário
`psql`, mas **não** possui DSN de staging (`PGHOST` ausente), e o escopo proíbe
`supabase--migration` / persistência. Logo o ensaio **não é executável por
nenhum canal disponível** — registrado como `BLOCKED`, sem PASS parcial.

Fragmentar o delta entre chamadas foi descartado: destruiria a atomicidade e a
prova de dupla passagem.

**Reexecução (2ª tentativa, `2026-07-30T04:42:13Z`) — mesmo resultado `BLOCKED`.**
Repetida com o conteúdo real do passo 010 do pacote, no mesmo envelope
transacional e com os quatro `SET LOCAL promo.*`:

```sql
BEGIN; SET LOCAL promo.mode='rehearsal'; SET LOCAL promo.target_ref='ikaauvsflpmamgxmkhoq';
SET LOCAL promo.pitr_confirmed='yes'; SET LOCAL promo.human_authorization='REHEARSAL-ONLY …';
DROP POLICY IF EXISTS popt_select ON public.partner_order_payment_terms; ROLLBACK;
```

```
ERROR: 25006: cannot execute DROP POLICY in a read-only transaction
```

Inventário de credenciais do sandbox nesta tentativa: apenas `SUPABASE_URL`,
`SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`/`VITE_*` e a sessão de browser
— **nenhum** DSN, `PGHOST` ou service role. Nenhum canal capaz de DDL existe
sem persistir (proibido pelo escopo). Gate permanece `BLOCKED`.

Pós-2ª tentativa (somente leitura, via `information_schema.tables` — inclui
views): `transaction_read_only=on`, 209 relações, 719 funções, política `popt_select` **presente** (o `DROP` não teve efeito),
0 triggers desabilitados, 0 resíduo em `partner_orders`.

**Caminho de desbloqueio — via backend temporária preparada (3ª tentativa,
`2026-07-30T04:52:00Z`): preparação concluída, execução `BLOCKED` por secret
ausente.**

Foi criado o executor de uso único `restoration/promocao-b2b/run-rehearsal-from-secret.sh`,
que lê a conexão **exclusivamente** do secret de runtime `STAGING_DSN` (nunca
`VITE_*`, nunca em código, log, diff ou relatório) e:

1. recusa qualquer DSN contendo `navfzbwgwzruipouyfnk` e qualquer destino que não
   contenha `ikaauvsflpmamgxmkhoq`; valida o esquema `postgresql://`;
2. reconfirma o destino já conectado (identificador não sensível) e checa o
   marcador de staging;
3. confere os 35 hashes do `manifest.json`;
4. monta a ordem canônica do manifest e executa **uma única transação**:
   `BEGIN → statement_timeout → preflight → 28 steps → postflight → 2ª passagem
   (28 steps + postflight) → ROLLBACK`, com `timeout` total e `trap ... EXIT`;
5. verifica pós-ensaio: contagem de tabelas/funções, `triggers_disabled=0`,
    tabela de provas ausente, resíduo zero;
6. imprime `REHEARSAL_DONE` somente em sucesso integral.

Cleanup: `restoration/promocao-b2b/cleanup-rehearsal-executor.sh` remove o
executor e a si mesmo, e lembra a remoção do secret lógico.

Estado na 3ª tentativa: `STAGING_DSN` **não existia** no runtime
(`fetch_secrets` retornava apenas `INTERNAL_FUNCTION_SECRET` e `LOVABLE_API_KEY`).
Nenhuma credencial foi inventada e nenhum SQL foi executado.

---

**Execução da 4ª tentativa (`2026-07-30T14:49:42Z`): secret cadastrado, autenticação falhou.**

Após o usuário autorizar o cadastro, `STAGING_DSN` foi adicionado via
`secrets--add_secret` (formulário seguro, valor nunca no chat). O executor
`run-rehearsal-from-secret.sh` foi acionado. O destino foi validado com sucesso
(`ikaauvsflpmamgxmkhoq` presente, `navfzbwgwzruipouyfnk` ausente), mas a conexão
com o PostgreSQL foi rejeitada antes de qualquer SQL ser executado:

```
psql: error: connection to server at "db.ikaauvsflpmamgxmkhoq.supabase.co" ...,
port 5432 failed: FATAL:  password authentication failed for user "postgres"
REHEARSAL_BLOCKED (exit=2) — nada persistido (transação em ROLLBACK).
```

Causa provável: senha do DSN incorreta ou formato de pooler/IPv4 não aceito.
Nenhum SQL foi executado; nada foi persistido em staging.

Durante a preparação desta tentativa, foi corrigido no executor um bug de
referência de coluna: a verificação de resíduo em `public.partner_orders` usava
`notes`, mas a coluna real chama-se `observacoes`.

**Correções aplicadas após a 4ª tentativa (`2026-07-30T21:54:00Z`):**

1. **Manifesto.** `run-rehearsal-from-secret.sh` e `cleanup-rehearsal-executor.sh`
   são artefatos **temporários** (o cleanup os remove) e foram **retirados** de
   `files[]`; incluí-los invalidaria o pacote após o ensaio. O manifest canônico
   volta a cobrir exatamente **35 artefatos permanentes**, todos com hash
   íntegro. Hashes dos scripts temporários, apenas como evidência deste ciclo e
   fora do manifest:
   - `run-rehearsal-from-secret.sh` → `d0c317b75d9a3a13eff6c2b9d5d722180123fbe9f17c3ac76175b7136af9f3e8`
   - `cleanup-rehearsal-executor.sh` → `7dfb2b013bfeec5f078bdf5a856df2d9a3070d1ddd6468181d933edc8dae98cf`
2. **Marcador fail-closed.** O executor não aceita mais "aviso e prosseguir" com
   base apenas no texto do DSN. Contrato real validado em
   `public._fiscal_staging_marker` (colunas `marker`, `project_ref`,
   `created_at`): exige **exatamente uma linha**, `marker = 'STAGING'` e
   `project_ref = 'ikaauvsflpmamgxmkhoq'`. Ausente, ambíguo, divergente ou
   apontando `navfzbwgwzruipouyfnk` ⇒ `MARKER_ABORT` antes de qualquer DDL.
3. **Baseline comparável.** Uma única consulta (`BASELINE_SQL`) captura base
   tables (`pg_class.relkind='r'`), views/matviews, funções, policies, triggers
   desabilitados e resíduos, executada **imediatamente antes** do ensaio e
   novamente **após o ROLLBACK**; divergência aborta com exit 5. Métricas de
   fontes diferentes nunca são comparadas entre si.
4. **Robustez.** `ON_ERROR_STOP` no script e na sessão propaga falha de qualquer
   statement, inclusive dentro de `\i`; o `trap` só declara estado após rodar a
   pós-verificação read-only (ou informa `POST_VERIFICATION_UNAVAILABLE`).
   DSN/senha nunca são impressos.
5. **Escopo.** `.lovable/plan.md` restaurado conforme `c41ba285`.

Acionamento após corrigir o secret (Project Settings → Secrets, nome exato
`STAGING_DSN`, conexão direta ou pooler IPv4 do Supabase, **nunca** no chat):

```bash
restoration/promocao-b2b/run-rehearsal-from-secret.sh   # esperado: REHEARSAL_DONE
restoration/promocao-b2b/cleanup-rehearsal-executor.sh  # remoção da via temporária
```


---

**Execução da 5ª tentativa (`2026-07-31T01:10:00Z`): `BLOCKED` — autenticação recusada.**

Comando executado (sem secrets, valor lido apenas do runtime):

```bash
bash -n restoration/promocao-b2b/run-rehearsal-from-secret.sh
bash    restoration/promocao-b2b/run-rehearsal-from-secret.sh
```

Resultado dos gates, na ordem do executor:

| Gate | Resultado |
|---|---|
| Secret `STAGING_DSN` presente | PASS |
| DSN contém `navfzbwgwzruipouyfnk` (produção) | **recusa ativa — ausente** |
| DSN contém `ikaauvsflpmamgxmkhoq` (staging) | PASS |
| Esquema `postgresql://` | PASS |
| `[1/6]` autenticação / destino conectado | **FAIL** |
| `[2/6]` marcador `_fiscal_staging_marker='STAGING'` | não alcançado |
| `[3/6]` manifest 35 arquivos (sha256 + bytes) | não alcançado |
| `[4/6]` baseline pré-ensaio | não alcançado |
| `[5/6]` transação única (2 passagens + `ROLLBACK`) | não alcançado |
| `[6/6]` comparação pós-`ROLLBACK` | não alcançado |

Erro sanitizado exato:

```
psql: error: connection to server at "db.ikaauvsflpmamgxmkhoq.supabase.co", port 5432
failed: FATAL:  password authentication failed for user "postgres"
REHEARSAL_BLOCKED (exit=2) — falha antes de qualquer conexao; nenhum SQL enviado.
```

Consequências verificadas:

- Nenhum SQL foi enviado ao staging; **não há baseline pré/pós a comparar** e não
  há resíduo possível por este ciclo. Nada foi persistido.
- O DSN cadastrado resolve para a **conexão direta** `db.<ref>.supabase.co:5432`,
  não para o **Session pooler**; a senha embutida foi rejeitada pelo servidor.
- `STAGING_REF` não é consumido por este executor (o destino é derivado e
  validado a partir do próprio DSN e do marcador no banco).
- `PRODUCTION_NOT_EXECUTED` — `navfzbwgwzruipouyfnk` intocado.

Não houve `PASS` parcial: o veredito único do ciclo é **`BLOCKED`**.

Para destravar, substituir `STAGING_DSN` (Project Settings → Secrets, formulário
seguro, nunca no chat) pela URI copiada em **Connect → Session pooler**, porta
**5432**, com a senha atual do banco e `sslmode=require`.

`STAGING_DSN` e `STAGING_REF` **permanecem cadastrados** neste ciclo. O cleanup
lógico (`cleanup-rehearsal-executor.sh` + remoção dos secrets) só pode ser feito
**após** um ciclo com `REHEARSAL_DONE` e auditoria independente do pacote.


**Retry controlado (6ª tentativa, `2026-07-31T01:12:00Z`): `STAGING_SECRET_CACHE_STALE`
— parado antes de conectar, nenhum SQL enviado.**

Pré-validação sanitizada do secret relido do cofre (sem imprimir DSN nem senha):

| Condição exigida | Resultado |
|---|---|
| `STAGING_DSN` presente no runtime | PASS |
| Ausência de `navfzbwgwzruipouyfnk` no DSN | PASS |
| Porta `5432` | PASS |
| Host termina em `pooler.supabase.com` | **FAIL** (host permanece `db.<ref>.supabase.co`) |
| Usuário contém `postgres.ikaauvsflpmamgxmkhoq` | **FAIL** (usuário continua `postgres`) |
| `STAGING_REF=ikaauvsflpmamgxmkhoq` | **FAIL** (variável ausente no runtime, comprimento 0) |

Como três condições obrigatórias falharam, o executor
`run-rehearsal-from-secret.sh` **não foi invocado**: nenhuma conexão, nenhum
`psql`, nenhuma transação, nenhuma baseline. O valor do cofre ainda é o da
conexão direta da 5ª tentativa (secret não propagado / não substituído).

- Veredito do ciclo: **`STAGING_SECRET_CACHE_STALE`** (equivale a `BLOCKED` para
  o gate).
- `PRODUCTION_NOT_EXECUTED` — `navfzbwgwzruipouyfnk` intocado.
- Ação para destravar: substituir `STAGING_DSN` pela URI de **Connect → Session
  pooler** (`postgresql://postgres.ikaauvsflpmamgxmkhoq:<senha>@aws-<n>-<região>.pooler.supabase.com:5432/postgres?sslmode=require`)
  e cadastrar `STAGING_REF=ikaauvsflpmamgxmkhoq`.

**Execução da 7ª tentativa (`2026-07-31T01:20:00Z`): `BLOCKED` — preflight fail-closed
por jobs `pg_cron` ativos. Primeira tentativa em que a conexão e os gates locais passaram.**

Pré-validação sanitizada do secret (sem imprimir DSN/senha): host termina em
`pooler.supabase.com` PASS · porta `5432` PASS · usuário
`postgres.ikaauvsflpmamgxmkhoq` PASS · `STAGING_REF=ikaauvsflpmamgxmkhoq` PASS ·
ausência de `navfzbwgwzruipouyfnk` PASS.

Resultado dos gates do executor:

| Gate | Resultado |
|---|---|
| `[1/6]` autenticação / destino conectado (Session pooler) | **PASS** |
| `[2/6]` marcador `_fiscal_staging_marker='STAGING'` fail-closed | **PASS** (`MARKER_OK`) |
| `[3/6]` manifest 35 arquivos (sha256 + bytes) | **PASS** (35/35 íntegros) |
| `[4/6]` baseline pré-ensaio | **PASS** (`base_tables=192`, `views=19`, `functions=719`, `policies=499`, `triggers_disabled=0`, `proofs_table=false`, resíduos=0) |
| `[5/6]` transação única (`BEGIN` + preflight + 2 passagens + postflight + `ROLLBACK`) | **FAIL** — abortou em `000_preflight.sql` |
| `[6/6]` comparação pós-`ROLLBACK` | executada — `POST_STATE_IDENTICAL_TO_BASELINE` |

Erro sanitizado exato:

```
psql:/dev-server/restoration/promocao-b2b/000_preflight.sql:156: ERROR:  PREFLIGHT_ABORT:
2 job(s) pg_cron ativo(s) tocam o motor B2B — desative na janela
CONTEXT:  PL/pgSQL function inline_code_block line 112 at RAISE
REHEARSAL_BLOCKED (exit=3)
```

Causa: a regra **P5** do preflight exige zero jobs `cron.job` ativos cujo
`command` case `%partner_order%`, `%b2b%` ou `%commercial_%`. Em staging há 5
jobs ativos, dos quais **2** casam a regra (entre eles
`check-partner-order-sla`, `*/30 * * * *`). O gate é **fail-closed por
projeto** e comportou-se corretamente: nenhum passo do delta foi aplicado.

Estado pós-`ROLLBACK` (read-only, mesma consulta da baseline):
`base_tables=192`, `views=19`, `functions=719`, `policies=499`,
`triggers_disabled=0`, `proofs_table_present=false`, `residuo_orders=0`,
`residuo_idem=0` → **idêntico à baseline pré**. Zero resíduos, zero triggers
desabilitados, nenhuma tabela de provas. Nada persistido.

- `REHEARSAL_DONE` **não emitido**; `STAGING_REHEARSAL_PASS` **não emitido**.
- `PRODUCTION_NOT_EXECUTED` — `navfzbwgwzruipouyfnk` intocado.
- Desbloqueio requer autorização humana explícita para **desativar
  temporariamente os 2 jobs `pg_cron` do motor B2B em staging durante a janela
  do ensaio** e reativá-los ao final (é a mesma condição operacional exigida na
  janela de produção). Sem essa autorização o ciclo permanece **`BLOCKED`**.

**Execução da 8ª tentativa (`2026-07-31T01:30:00Z`) — janela controlada com pausa
temporária de `pg_cron`: `BLOCKED` por defeito real do pacote no passo 190.**

Janela operacional (autorizada, apenas staging):

| Item | Registro sanitizado |
|---|---|
| Job alvo 1 | `jobid=2` · `check-partner-order-sla` · `*/30 * * * *` · `active=true` · `cmd_sha256=fcd31eec…d358d14` |
| Job alvo 2 | `jobid=5` · `prune-old-audit-logs` · `15 3 * * *` · `active=true` · `cmd_sha256=000652cd…8428911` |
| Pertencem à produção? | **Não** — lidos via DSN de staging (`postgres.ikaauvsflpmamgxmkhoq`, Session pooler); `navfzbwgwzruipouyfnk` nunca acessado |
| Pausa | `cron.alter_job(job_id, active := false)` apenas; `schedule` e `command` intocados; nenhum job excluído |
| Restauração | `trap EXIT INT TERM` independente → `active := true` executado e confirmado |

Gates do executor nesta janela: `[1/6]` conexão **PASS** · `[2/6]` marcador
`MARKER_OK` **PASS** · `[3/6]` manifest **35/35 PASS** (sha256 + bytes) ·
`[4/6]` baseline pré **PASS** · `[5/6]` preflight **`PREFLIGHT_OK`
(mode=rehearsal target_ref=ikaauvsflpmamgxmkhoq)** e delta aplicando em
transação única até o passo 190, onde abortou · `[6/6]` pós-`ROLLBACK`
**`POST_STATE_IDENTICAL_TO_BASELINE`**.

Erro sanitizado exato:

```
psql:/dev-server/restoration/promocao-b2b/steps/190_2f7835f8_3e7c_4331_a0c9_24348bf1ed0f.sql:104:
ERROR:  cannot change return type of existing function
DETAIL:  Row type defined by OUT parameters is different.
HINT:  Use DROP FUNCTION rpc_b2b_list_selectable_payment_plans() first.
REHEARSAL_BLOCKED (exit=3)
```

Diagnóstico: o passo 190 usa `CREATE OR REPLACE FUNCTION
public.rpc_b2b_list_selectable_payment_plans()` com uma lista de colunas
`RETURNS TABLE` diferente da função já existente no destino. `CREATE OR
REPLACE` não pode alterar o tipo de retorno — a correção é um `DROP FUNCTION IF
EXISTS public.rpc_b2b_list_selectable_payment_plans();` imediatamente antes do
`CREATE`, seguido do bloco `REVOKE`/`GRANT` já presente. **O mesmo erro
ocorreria em produção**, portanto o achado é um defeito real do pacote,
capturado exatamente pelo propósito do ensaio.

Provas pós-janela (somente leitura):

- Baseline pós idêntica: `base_tables=192`, `views=19`, `functions=719`,
  `policies=499`, `triggers_disabled=0`, `proofs_table_present=false`,
  `residuo_orders=0`, `residuo_idem=0` → **zero resíduos, zero triggers
  desabilitados, nenhuma tabela de provas**.
- `cron.job` após a janela: `1:true`, `2:true`, `5:true`, `8:true`, `9:true` —
  os 2 jobs alvo **restaurados a `active=true`**, `schedule` e
  `cmd_sha256` inalterados (`2`→`fcd31eec…`, `5`→`000652cd…`); **nenhum outro
  job foi tocado** (1, 8 e 9 permaneceram `true` em todo o ciclo).
- `REHEARSAL_DONE` e `STAGING_REHEARSAL_PASS` **não emitidos**.
- **`PRODUCTION_NOT_EXECUTED`** — `navfzbwgwzruipouyfnk` não acessado; nenhuma
  migration persistente aplicada; nada publicado.

### 4.2 Verificação pós-tentativa (somente leitura, staging)

| Item | Obtido | Esperado |
|---|---|---|
| `transaction_read_only` | `on` | `on` |
| `server_version_num` | `170006` | ≥ 150000 |
| Base tables em `public` (`pg_class.relkind='r'`) | `192` | inalterado |
| Funções em `public` | `719` | inalterado |
| `partner_order_idempotency.request_fingerprint` | presente | presente |
| Pedidos resíduo (`GATE-RUNTIME%`/`FASE7-PROOF%`/`%REHEARSAL%`) | `0` | `0` |
| Idempotência resíduo | `0` | `0` |
| Triggers de usuário desabilitados | `0` | `0` |
| `_motor_b2b_fase7_proofs` | ausente | ausente |

Schema íntegro, zero resíduo, zero efeito colateral **para as métricas medidas
com a mesma consulta**. A divergência `192 vs 209` registrada anteriormente
**não** decorre de tabelas temporárias: `192` veio de `pg_tables` (apenas base
tables) e `209` de `information_schema.tables` (inclui views e outros tipos de
relação). Comparar as duas era inválido e a afirmação de "baseline inalterado"
baseada nelas fica **retirada**. O baseline autoritativo passa a ser o par
pre/post produzido pela consulta única do executor, capturado imediatamente
antes do rehearsal e após o `ROLLBACK`.

### 4.3 Demais pendências

1. **Autorização humana** para produção — texto exato em §7 (autorização ampla
   recebida, mas o gate técnico §4.1 precede a execução).
2. **Backup/PITR** de produção confirmado por checklist na janela (validado no
   preflight) e auditoria independente do pacote.

Enquanto §4.1 não emitir `REHEARSAL_DONE`, o gate permanece **`BLOCKED`** e a
promoção **não** pode ser executada.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Produção com baseline divergente do staging | P3 do preflight aborta antes de qualquer escrita |
| Passo não idempotente em replay | apply em transação única + dupla passagem no ensaio |
| Falha parcial deixando schema inconsistente | `--single-transaction`: rollback total |
| Perda de dados | fora do escopo do pacote; só PITR |
| Execução acidental em produção | dupla verificação (executor + sessão) + script `.BLOCKED` sem bit de execução |
| Divergência entre pacote e migrations históricas futuras | `manifest.json` fixa `source_sha256` de cada origem |

## 6. Comandos de ensaio

```bash
# 1) integridade + ordem + preflight/delta/postflight/idempotência, tudo revertido
STAGING_DSN='postgresql://…ikaauvsflpmamgxmkhoq…' \
STAGING_REF=ikaauvsflpmamgxmkhoq \
  restoration/promocao-b2b/rehearsal-staging.sh
# esperado: "REHEARSAL_DONE"

# 2) validações do repositório
npx tsgo --noEmit
npx vitest run
npm run build
```

## 7. Texto exato da autorização humana a ser solicitada

> **AUTORIZAÇÃO DE PROMOÇÃO — MOTOR COMERCIAL B2B**
> Eu, Renato S. Cunha, responsável pelo projeto AR Bio Manager, autorizo
> expressamente a execução do pacote `restoration/promocao-b2b/` versão `1.0.0`,
> manifest `manifest.json` com os hashes `sha256` nele registrados, no banco de
> **PRODUÇÃO** Supabase `navfzbwgwzruipouyfnk`, em janela acordada.
> Declaro que: (a) o backup/PITR de produção foi confirmado imediatamente antes
> da execução; (b) o ensaio `rehearsal-staging.sh` foi executado em
> `ikaauvsflpmamgxmkhoq` com resultado `REHEARSAL_DONE`; (c) nenhum job agendado
> ou integração de escrita estará ativo na janela; (d) estou ciente de que a
> reversão de dados depende exclusivamente do PITR.
> Data/hora (UTC): ____________  Assinatura/registro: ____________

Sem esse texto preenchido e registrado em `manifest.json`
(`human_authorization.text` / `granted_by` / `granted_at_utc`), o comando de
produção permanece **bloqueado**.
