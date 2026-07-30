# Gate de promoção — Motor Comercial B2B

Documento **único e canônico** do gate. Substitui qualquer afirmação anterior de
"promoção liberada tecnicamente".

| Campo | Valor |
|---|---|
| Gate | **`STAGING_REHEARSAL_PASS (parcial)`** — asserções de estado 12/12 PASS; replay transacional pendente (§4) |
| Execução em produção | **`PRODUCTION_NOT_EXECUTED`** |
| Autorização humana | **`HUMAN_AUTHORIZATION_PENDING`** |
| Destino | `navfzbwgwzruipouyfnk` (produção) — intocado neste ciclo |
| Origem certificada | `ikaauvsflpmamgxmkhoq` (staging) |
| Timestamp UTC | `2026-07-30T04:30:40Z` |
| Commit base | `dacdc61f3674493d26cd1364fffc4d77e5047011` |
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
restoration/promocao-b2b/apply-production.sh.BLOCKED      (novo, bloqueado)
restoration/promocao-b2b/manifest.json                    (novo, com hashes)
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

1. **Ensaio transacional completo não executado por este ciclo.** O sandbox não
   possui client `psql` nem DSN de staging; a execução de DDL/DML de ensaio
   exigiria `BEGIN … ROLLBACK` real. O roteiro está pronto e é obrigatório:
   `restoration/promocao-b2b/rehearsal-staging.sh` (inclui **dupla passagem** do
   delta na mesma transação como prova de idempotência).
2. **Autorização humana** para produção — texto exato em §7.
3. **Backup/PITR** confirmado por checklist na janela (validado no preflight).

Enquanto (1) não for executado com `REHEARSAL_DONE`, o gate permanece
`STAGING_REHEARSAL_PASS (parcial)` e **não** `100% APTO`.

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
