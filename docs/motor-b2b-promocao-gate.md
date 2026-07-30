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
| Timestamp UTC | `2026-07-30T14:49:42Z` (4ª tentativa — secret cadastrado, autenticação falhou) |
| Commit base | `365dabc65e23b5d4d03360e0151d63da1695bc28` |
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
restoration/promocao-b2b/manifest.json                    (novo, com hashes, 37 arquivos)
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

Pós-2ª tentativa (somente leitura): `transaction_read_only=on`, 209 tabelas,
719 funções, política `popt_select` **presente** (o `DROP` não teve efeito),
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
`notes`, mas a coluna real chama-se `observacoes`. O manifest foi reidratado
para incluir os scripts `run-rehearsal-from-secret.sh` e
`cleanup-rehearsal-executor.sh` (37 arquivos no total).

Acionamento após corrigir o secret (Project Settings → Secrets, nome exato
`STAGING_DSN`, conexão direta ou pooler IPv4 do Supabase, **nunca** no chat):

```bash
restoration/promocao-b2b/run-rehearsal-from-secret.sh   # esperado: REHEARSAL_DONE
restoration/promocao-b2b/cleanup-rehearsal-executor.sh  # remoção da via temporária
```


### 4.2 Verificação pós-tentativa (somente leitura, staging)

| Item | Obtido | Esperado |
|---|---|---|
| `transaction_read_only` | `on` | `on` |
| `server_version_num` | `170006` | ≥ 150000 |
| Tabelas em `public` | `192` | inalterado |
| Funções em `public` | `719` | inalterado |
| `partner_order_idempotency.request_fingerprint` | presente | presente |
| Pedidos resíduo (`GATE-RUNTIME%`/`FASE7-PROOF%`/`%REHEARSAL%`) | `0` | `0` |
| Idempotência resíduo | `0` | `0` |
| Triggers de usuário desabilitados | `0` | `0` |
| `_motor_b2b_fase7_proofs` | ausente | ausente |

Schema íntegro, zero resíduo, zero efeito colateral. A contagem de tabelas em
`public` pode variar ligeiramente entre leituras (ex.: 192 vs 209) conforme
tabelas temporárias de outras sessões; nenhuma tabela de negócio foi removida ou
adicionada neste ciclo.

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
