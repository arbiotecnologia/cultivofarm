# Fase PRÉ-F1.2 — Auditoria dos guards `cf_user_guards_v1` e reconciliação de homolog — 2026-10-18 (READ-ONLY, NADA APLICADO)

Produção: `swzpzcwiasxmjutrmvkm`. Homolog: `vrlcdwmlytukrjezrrnf`.
**Nenhum DDL/DML em bancos reais. Nada publicado.** Validação de sintaxe/lógica
feita em Postgres 17.9 local descartável do sandbox (evidências na seção 5).

## 1. Bloqueio confirmado pelo auditor externo (ACEITO)

Homolog tem **0 triggers** em `public.partner_users`, **0 schema**
`cf_user_guards_v1`, **0 tabela** `cf_user_guards_v1.state`. Produção tem 3
triggers + schema + state. O PRÉ-F1 v1 (só a coluna) é **insuficiente** para
paridade de segurança e para o teste T5.

## 2. Inventário read-only do schema `cf_user_guards_v1` em produção (VERIFICADO)

**Objetos** (dono de tudo: `postgres`):
- Tabela `state (singleton boolean NOT NULL PK, revision bigint NOT NULL)` — grants: apenas `postgres=arwdDxtm/postgres` (ninguém mais).
- Funções (6): `acquire_gate` (SECURITY DEFINER), `block_truncate` (INVOKER), `touch_related_profiles` (SECURITY DEFINER), `acquire_invitation_gate` (DEFINER), `touch_invitation_profiles` (DEFINER), `require_admin` (DEFINER), `advance_stamp` (INVOKER).
- Grants de EXECUTE das funções: **apenas `postgres=X/postgres`** — nenhum role de aplicação executa diretamente; são funções de trigger.
- Schema: owner `postgres`, ACL `postgres=UC/postgres` (fechado).

**Triggers em produção que usam o schema** (VERIFICADO — 4 tabelas públicas):
`profiles`, `user_roles`, `user_clientes`, `partner_users` (3 triggers cada:
gate statement + no_truncate + touch row) e `platform_org_admin_invites`
(3 triggers, variantes de convite). Snapshot `cf_audit_users_20260922` tem
cópia própria dos guards (schema separado, fora do escopo).

**Dependências dos corpos** (lidos na íntegra):
- `acquire_gate`: valida `TG_RELID ∈ {profiles, user_roles, user_clientes, partner_users, auth.users}`; chama `auth.uid()`; faz UPDATE em `state`.
- `touch_related_profiles`: UPDATE em `public.profiles` pelo `user_id`.
- `block_truncate`: sem dependências.
- Cadeia de objetos necessária em homolog: schema + tabela `state` (+ linha singleton) + 6 funções + triggers por tabela + existência de `auth.uid()` (Supabase provê) e `public.profiles`/`user_roles`/`user_clientes`/`platform_org_admin_invites`.

## 3. Proposta de reconciliação de homolog (SEM copiar auth/dados privados)

A cadeia é **replicável** — são 8 objetos de schema puro, sem dados privados
(a única linha de `state` é um contador, não dado pessoal). Script proposto em
passos isolados, cada um com checkpoint e rollback próprio:

| Passo | Conteúdo | Checkpoint | Rollback |
|---|---|---|---|
| P0 | Preflight: confirmar ausência do schema e presença de `auth.uid()`, `profiles`, `user_roles`, `user_clientes`, `platform_org_admin_invites` em homolog | NOTICE por item; ausência de tabela pública = abort | — |
| P1 | `CREATE SCHEMA cf_user_guards_v1` + tabela `state` + linha `INSERT (true, 0)` | SELECT retorna revision=0 | DROP SCHEMA CASCADE |
| P2 | 6 funções com corpos idênticos aos de produção (SECURITY DEFINER onde produção tem, `search_path=''`, EXECUTE só para o owner) | `pg_get_functiondef` confere assinatura | DROP FUNCTION ×6 |
| P3 | 3 triggers em `partner_users` (gate, no_truncate, touch) | `pg_trigger` lista 3 | DROP TRIGGER ×3 |
| P4 | Triggers nas demais 4 tabelas (profiles, user_roles, user_clientes, platform_org_admin_invites) — **somente se o objetivo for paridade de guards além da F1**; para a F1 bastam P1–P3 | contagem por tabela | DROP TRIGGER |
| P5 | Teste de fumaça transacional: INSERT/UPDATE/ROLLBACK em `partner_users` incrementa `state.revision`; TRUNCATE é bloqueado | NOTICE de PASS | ROLLBACK |

**Sem atalhos:** nenhum mock/stub de guard para fazer T5 passar — os corpos
são copiados verbatim de produção. **Sem dados:** nenhuma linha de
auth/users/profiles é copiada; fixtures de teste são transacionais.

**Backup antes de aplicar em homolog:** snapshot do banco homolog pelo painel
Supabase (Database → Backups) imediatamente antes de P1; como homolog não tem
dados reais, o rollback por DROP dos objetos criados é suficiente e documentado.

## 4. Blocker residual e alternativa

- **Blocker:** homolog diverge de produção além deste schema (279 vs 286
  tabelas, colunas `marca_*` ausentes, 0 vínculos). Mesmo após PRÉ-F1 +
  PRÉ-F1.2, homolog **não é espelho fiel** — serve para validar F1, não para
  atestar paridade geral.
- **Alternativa se se exigir fidelidade total:** provisionar homologação fiel
  por método aprovado (restore de backup de produção sanitizado ou Supabase
  branching a partir de migrations versionadas) — fora do escopo desta fase;
  documentado como opção, não executado.

## 5. Evidências de validação local (Postgres 17.9 descartável, sandbox)

Stub fiel montado com os corpos REAIS dos guards (copiados de produção),
`partner_users` com 5 colunas + UNIQUE(user_id) + 3 triggers reais:

| Verificação | Resultado |
|---|---|
| PRÉ-F1 (coluna predecessora) | **PASS** — `pref1 OK: commercial_owner_organization_id uuid NULL criada` |
| F1 migration completa | **PASS** — preflight OK, colunas/checks/triggers/índices criados, backfill 0 divergências, COMMIT |
| T1 derivação de tenant + defaults | **PASS** |
| T2 tenant divergente rejeitado | **PASS** — motivo conferido: `partner_users_tenant_mismatch` (não mascarado) |
| T3a/T3b/T3c checks de revogação | **PASS** — captura restrita a `check_violation` |
| T4 version incrementa | **PASS** |
| T5 acquire_gate incrementa revision | **PASS** (1 → 2) |
| T6 backfill idempotente | **PASS** |
| T7 read-only | executado (informativo) |
| **Teste negativo**: F1 sem PRÉ-F1 | **ABORTA corretamente** — `f1_preflight_abort: ...commercial_owner_organization_id ausente` |
| **Rollback F1** (bloco do rodapé) | **PASS** — DROPs + ALTER executam limpos, COMMIT |

**Defeito real encontrado e corrigido nesta rodada:** `REVOKE ... FROM PUBLIC,
anon, authenticated` falhava em ambiente sem esses roles → revogação agora é
tolerante (revoga de PUBLIC sempre; de anon/authenticated só se existirem).

**Exceções mascaradas:** revisado — T2 confere o motivo exato da rejeição
(`tenant_mismatch`) e falha se o erro for outro; T3 captura apenas
`check_violation`; demais testes não capturam exceção. Nenhum caminho de SKIP.

## 6. Estado e próximos passos (aguardando autorização)

1. Revisão independente de PRÉ-F1 + PRÉ-F1.2 (proposta da seção 3) + F1 + testes.
2. Aplicar em homolog na ordem: PRÉ-F1 → PRÉ-F1.2 (P0–P3, P5) → F1 → T1–T7,
   registrando saídas (prova hospedada).
3. F1 em produção somente com aprovação explícita; T7 read-only antes/depois.
4. PENDÊNCIA P1 (parceiro sem tenant) segue NO-GO do Cutover.
