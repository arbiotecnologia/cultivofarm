# Pacote de promoção — Motor Comercial B2B (delta forward-only)

**Origem certificada:** staging `ikaauvsflpmamgxmkhoq`
**Destino:** produção `navfzbwgwzruipouyfnk` — **NÃO EXECUTADO**. Requer autorização humana externa.
**Status:** `STAGING_REHEARSAL_PASS (parcial — ver limitação em §6)` · `PRODUCTION_NOT_EXECUTED` · `HUMAN_AUTHORIZATION_PENDING`

> Correção em relação à versão anterior deste README: a afirmação de
> *"promoção liberada tecnicamente"* foi **removida**. Ela era incorreta porque
> (a) as migrations históricas normalizadas **recusam explicitamente** o
> `project_ref` de produção, o que torna o replay direto impossível, e (b) a
> guarda tolerava marker ausente, enfraquecendo a prova de ambiente.

---

## 1. O que este pacote é

Um artefato **separado das migrations históricas**, forward-only, determinístico
e revisável, contendo **apenas o delta operacional** necessário para levar
produção ao estado certificado do Motor Comercial B2B.

As 486 migrations do repositório **não foram reescritas** neste ciclo; elas
permanecem como registro histórico do que foi aplicado em staging. Cada passo
deste pacote declara sua origem e o `sha256` do arquivo histórico.

### O que foi removido de cada passo
Apenas o bloco `DO $guard$ ... STAGING_GUARD ... $guard$;`. Nenhuma linha de
semântica fiscal, de negócio, de RLS ou de grants foi alterada. A verificação de
ambiente passou a ser **centralizada e fail-closed** em `000_preflight.sql`.

### O que este pacote NÃO contém
Harnesses, fixtures, UUIDs de teste, usuários efêmeros, tabelas de evidência,
`ALTER TABLE ... DISABLE TRIGGER`, `TRUNCATE` ou `DELETE` de dados de negócio.
Os únicos `DROP TABLE IF EXISTS` presentes removem **tabelas de evidência de
teste** (`_motor_b2b_fase0_2_evidence`, `_motor_b2b_fase1_*_evidence`,
`_motor_b2b_fase7_proofs`) e são **no-op em produção**, onde nunca existiram.

Migrations históricas **excluídas** do pacote (com motivo em `manifest.json`):
`20260729004013` (drill com substituição textual), `20260729004107` (tabela de
evidência), `20260730032921` (patch textual `pg_get_functiondef` + `replace`,
superseded pelo passo `260`, que traz a definição explícita e completa de
`create_partner_order_secure` com `reqfp_v2`).

---

## 2. Ordem exata

```
000_preflight.sql
steps/010 … steps/270      (28 passos, ordem cronológica de origem)
090_postflight.sql
```

A ordem canônica é a do campo `order` em `manifest.json` — os scripts leem dali,
nunca de `ls`.

Execução em **uma única transação** (`psql --single-transaction`): qualquer
falha em qualquer passo reverte tudo, sem efeito colateral.

---

## 3. Pré-flight fail-closed

`000_preflight.sql` aborta (sem escrever nada) se qualquer item falhar:

| # | Verificação |
|---|-------------|
| P0 | `promo.mode`, `promo.target_ref`, `promo.pitr_confirmed=yes`, `promo.human_authorization` presentes |
| P1 | coerência modo × destino (`production` ⇒ `navfzbwgwzruipouyfnk`; `rehearsal` ⇒ só `ikaauvsflpmamgxmkhoq`) |
| P2 | `server_version_num ≥ 150000` e extensão `pgcrypto` |
| P3 | baseline de schema: 14 tabelas + `has_role(uuid, app_role)` |
| P4 | nenhuma transação > 60 s em curso; nenhum lock exclusivo nas tabelas do delta |
| P5 | nenhum job `pg_cron` ativo tocando `partner_order%` / `b2b` / `commercial_%` |
| P6 | destino declarado como produção não pode conter marker de staging |

### Como o destino é realmente provado

O PostgreSQL **não conhece** o `project_ref` do Supabase de forma confiável, e
qualquer tentativa de descobri-lo dentro do SQL (ler secrets, inferir hostname,
consultar tabela de marcação) é insegura ou falsificável.

1. **Verificação primária — no executor, antes da conexão.**
   `apply-production.sh.BLOCKED` compara `PROD_REF_DECLARED` e o DSN com
   `navfzbwgwzruipouyfnk`, e recusa qualquer DSN que contenha o ref de staging.
   O mesmo, invertido, em `rehearsal-staging.sh`.
2. **Segunda confirmação — no SQL, por parâmetro efêmero de sessão.**
   `SET LOCAL promo.target_ref = ...`, declarado pelo operador. Nada é
   persistido; nenhum secret trafega por esses parâmetros.

Divergência entre (1) e (2) ⇒ aborto.

---

## 4. Pós-flight

`090_postflight.sql` roda 12 verificações na mesma transação (falha ⇒ rollback total):

| # | Verificação | Esperado |
|---|-------------|----------|
| 1 | `create_partner_order_secure/9` contém `reqfp_v2` | sim |
| 2 | overloads de `create_partner_order_secure` | exatamente 1 |
| 3 | `fn_b2b_cart_hash` com prefixo `v2\|` | sim |
| 4 | trigger `trg_b2b_block_receivable_before_approval` | presente |
| 5 | `fn_b2b_credit_exposure`: comprometimento canônico, sem contar `pendente` | sim |
| 6 | `commercial_payment_plans` legível por `authenticated` | não |
| 7 | `partner_order_idempotency.request_fingerprint` | presente |
| 8 | funções B2B executáveis por `anon`/`PUBLIC` | 0 |
| 9 | tabelas do motor B2B sem RLS | 0 |
| 10 | triggers desabilitados em `public` | 0 |
| 11 | tabela de provas `_motor_b2b_fase7_proofs` | ausente |
| 12 | `fn_b2b_status_is_operational` / `_is_approved_or_later` | presentes |

---

## 5. Ensaio (dry-run) — somente staging

```bash
STAGING_DSN='postgresql://…ikaauvsflpmamgxmkhoq…' \
STAGING_REF=ikaauvsflpmamgxmkhoq \
  restoration/promocao-b2b/rehearsal-staging.sh
```

O script: (a) confere os `sha256` de todos os arquivos contra `manifest.json`;
(b) monta a ordem a partir do manifest; (c) executa
`BEGIN → preflight → delta → postflight → delta de novo (prova de idempotência)
→ postflight → ROLLBACK`. **Nunca faz COMMIT** e **nunca desabilita triggers**.

---

## 6. Evidências desta rodada e limitação declarada

Executado em `ikaauvsflpmamgxmkhoq` (somente leitura, via API de consulta do
projeto), com o conteúdo exato das 12 asserções do postflight: **12/12 PASS**
(ver `docs/motor-b2b-promocao-gate.md`, §Evidências).

**Limitação honesta:** o ambiente deste ciclo **não possui client `psql` nem DSN
de staging**, portanto o ensaio transacional completo (`BEGIN … ROLLBACK` com
replay dos 28 passos e a segunda passagem de idempotência) **não foi executado
por mim**. Ele está roteirizado e pronto em `rehearsal-staging.sh` e é
**pré-requisito obrigatório** antes de qualquer promoção. Por isso o gate está
registrado como `STAGING_REHEARSAL_PASS (parcial)` — asserções de estado
aprovadas, replay transacional pendente.

---

## 7. Rollback / contingência

- Falha **durante** o apply ⇒ nada a fazer: `--single-transaction` reverte tudo.
- Falha **após** o commit ⇒ `099_rollback_forward_safe.sql` (não apaga dados, não
  reabre permissões, não desabilita triggers; aborta se tentaria fazê-lo).
- Perda/corrupção de dados ⇒ **somente PITR**, confirmado no preflight.

---

## 8. Comando de produção — documentado e bloqueado

`apply-production.sh.BLOCKED` está sem bit de execução e com extensão que impede
execução acidental. Só um humano autorizado pode renomeá-lo e executá-lo, com
`--i-have-human-authorization` e as variáveis `PROD_DSN`, `PROD_REF_DECLARED`,
`HUMAN_AUTHORIZATION`, `PITR_CONFIRMED=yes`.

**Nenhum agente automatizado deve executá-lo.**
