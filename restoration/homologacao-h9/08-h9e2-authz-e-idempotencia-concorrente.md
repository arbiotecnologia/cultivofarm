# H9-E2 — Convergência de autorização e idempotência concorrente das RPCs de visita

**Ambiente único:** homologação Supabase `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk` e sandbox `yzszlzjpovmcteuxjznj`:** não acessados, não consultados, não comparados, não promovidos.
**Ledger:** 678 → **679** (forward `20261023000000`, ocorrência única).
**Migrations anteriores:** `20261022000000` e antecessoras não foram editadas nem reexecutadas.

---

## 1. Por que o GO da H9-E1R não fechava a fase

A revisão do corpo remoto real confirmou três defeitos:

| # | Assinatura | Defeito comprovado |
|---|---|---|
| D1 | `finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)` | A busca idempotente por `client_uuid` ocorria **antes** do `SELECT ... FOR UPDATE`; após o lock, o `status` era avaliado **antes** de repetir a busca. Duas sessões simultâneas sem linha prévia: a segunda recebia `22023 visit_not_in_progress`. O handler de `unique_violation` não era alcançado. |
| D2 | `rpc_realizar_checkout_visita(...)` | `SELECT` em `visitas_checkin` por `client_uuid` **antes** do gate `_visita_scope_ok` → oráculo (`idempotency_conflict` vs `forbidden_visita_nao_atribuido`). |
| D3 | `rpc_realizar_checkin_visita(...)` | Mesmo oráculo de D2, e sem lock por registro. |
| D4 | as três | Comentário “H9-D-L6: autorização de escopo ANTES de qualquer leitura” posicionado abaixo do lookup — não descrevia o corpo efetivo. |

## 2. Baselines remotos (pré-correção)

| Função | OID | md5(`pg_get_functiondef`) | md5(`prosrc`) |
|---|---|---|---|
| `finish_technical_visit_secure` | 24597 | `20515c14cf017e68bebc8f99ba3cd00a` | `e7e8720effb4341d8960d865503aedb8` |
| `rpc_realizar_checkin_visita` | 24798 | `3aa7f5ef96de3e4c4e3b1d5aa73ca16c` | `d049e983b610f0c7423b12247cdffaf7` |
| `rpc_realizar_checkout_visita` | 24800 | `2b2cc2d7d51a37a515ef79823c28f690` | `a68dc37ed14aadd2349415e5a52f2f4a` |

Todas: owner `postgres`, `SECURITY DEFINER`, `search_path=public`, ACL `postgres=X,authenticated=X,service_role=X` (sem `PUBLIC`, sem `anon`).

## 3. Fingerprints pós-correção

| Função | OID | md5(`pg_get_functiondef`) | md5(`prosrc`) |
|---|---|---|---|
| `finish_technical_visit_secure` | 24597 | `b007454aa21a70aa545ee0a5a100e22f` | `73092465905ea0f90e109a842fc79a2c` |
| `rpc_realizar_checkin_visita` | 24798 | `d929e5dc354f3a802b8ab2d41c3b466e` | `de35efbc9a76fa372920b4449694efde` |
| `rpc_realizar_checkout_visita` | 24800 | `735ebbfad7106dac1f5e77218ed21f70` | `82174081102440415f9c221e45fdccdd` |

OIDs, owner, ACL, `SECURITY DEFINER`, `search_path`, assinaturas e contratos de retorno preservados.

## 4. Ordem canônica aplicada às três funções

```text
auth.uid() + validacoes sintaticas/nulas
  -> gate fail-closed public._visita_scope_ok  (antes de QUALQUER leitura sensivel)
  -> derivacoes de papel (can_manage / is_participant)
  -> lock por registro (SELECT/PERFORM ... FOR UPDATE)   [sem lock global]
  -> busca idempotente por client_uuid (POS-lock)
  -> validacoes de estado/ciclo
  -> escrita + handler de unique_violation (convergencia fail-closed)
```

`p_client_uuid` permanece obrigatório nas RPCs canônicas. Em
`finish_technical_visit_secure` continua opcional por compatibilidade; nesse
caso **não há chave de idempotência** e a chamada não é idempotente —
limitação documentada, sem identificador artificial silencioso.

## 5. Provas executadas

### 5.1 Concorrência real em duas conexões independentes
Harness `h9e-provas/h9e2-prova-concorrencia-multisessao.py` — dois processos
`psql` distintos (não `Promise.all` no mesmo cliente), sessão A retém o lock
antes do COMMIT, sessão B inicia durante a retenção e é observada bloqueada.

| Cenário | Pré-correção | Pós-correção |
|---|---|---|
| `finish` — B após COMMIT de A | `22023 visit_not_in_progress:finalizado` | mesmo `checkout_id` de A |
| `checkout` — B após COMMIT de A | `22023 checkout_duplicado` | mesmo `id` de A |
| `checkin` — B após COMMIT de A | mesmo `id` (já convergia) | mesmo `id` de A |
| Exatamente um `visitas_checkin` por cenário | sim | sim |
| Resíduo após limpeza | 0 | 0 |

Totais: **pré 13 verificações / 2 falhas reproduzidas**; **pós 13/13 PASS**.

Fixture determinística (UUIDs registrados para recuperação manual):
`9e200001-0000-4000-8000-00000000000{1,2,3}` (registros) e
`9e2c0001-0000-4000-8000-00000000000{1,2,3}` (client_uuid).
Tag `H9E2-CONCORRENCIA`. Limpeza em `finally`, delimitada por esses UUIDs e
pela tag, executada com claims de administrador — **nenhum trigger, RLS ou
auditoria foi desabilitado**, nem em caráter temporário. A FK
`visitas_checkin -> registros_consultor` é `ON DELETE SET NULL`, por isso a
limpeza remove os check-ins **antes** do registro e também por `client_uuid`,
evitando órfãos.

### 5.2 Autorização sem oráculo
`h9e-provas/h9e2-prova-authz-sem-oraculo.sql`, em transação integralmente
revertida: **18/18 PASS**.

- `anon`/`auth.uid()` nulo → `unauthenticated` nas três RPCs.
- Sem escopo, 4 combinações por RPC — (registro inexistente | registro alheio real) × (`client_uuid` existente | aleatório) — **superfície única**:
  `42501 not_visit_owner` (finish) e `42501 forbidden_visita_nao_atribuido` (canônicas).
- Participante/responsável/criador e administrador legítimos continuam operando.
- Idempotência sequencial com o mesmo `client_uuid` nas três RPCs (mesmo id).
- Conflito por tipo, por registro e por ator → `22023 idempotency_conflict`.
- Estado incompatível → `22023 visit_not_in_progress`.
- GPS/justificativa obrigatórios; `client_uuid` obrigatório nas canônicas.
- Encerramento grava exatamente um `tipo_checkin='checkout'`.

## 6. Rollback

`h9e-rollbacks/20261023000000_..._rollback.sql` restaura byte-a-byte as três
definições anteriores (mais `REVOKE`/`GRANT` idênticos). **Não executado.**
Executá-lo reintroduz D1–D3; linhas já gravadas sob o forward permanecem
válidas e não são revertidas (`visitas_checkin` é append-only).

## 7. Situação e limites

- H9-E2: **GO em homologação**.
- **Promoção para produção: NO-GO.** Permanecem fora desta fase o drift
  recorrente de binding (`.env`/`types.ts` regenerados para o sandbox pela
  plataforma e restaurados a cada acesso) e as 59 migrations repo-only em
  quarentena.
- Os agregados H9-D não mudam: 376 = 84 herdadas + 292 profundas; 256 AUTH,
  32 corrigidas, 4 N/A, 0 pendentes. As três assinaturas já estavam na
  categoria corrigida; registra-se que a correção anterior era **parcial**.
