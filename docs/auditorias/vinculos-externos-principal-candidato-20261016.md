# Cliente principal — candidato de consistência v2 (revisável)

**Data:** 16/10/2026. **Base:** `bfce1cc6` + revisão independente de `29d50c73` (v1 NÃO aprovado). **Estado:** CANDIDATO v2 REVISÁVEL — nenhum SQL hospedado aplicado, nenhuma publicação, nenhuma alteração de contas/vínculos reais, gate de associação fechado. Common F2 e V0 instalados preservados.

## 1. Correções dos cinco pontos da revisão

**(1) Preflight:** trocado `<>` por `IS DISTINCT FROM` (NULL de função ausente agora falha); assinatura conferida via `pg_get_function_identity_arguments`; trigger conferido por `tgenabled='O'`, `tgtype=29` e `pg_get_triggerdef` exato; UNIQUE conferida por `pg_get_constraintdef`='UNIQUE (user_id, cliente_id)' com `contype='u'`, não só por nome.

**(2) UPDATE de user_id:** o candidato v2 reconcilia **todos** os usuários afetados (NEW e OLD) via transition tables; o usuário antigo e o novo são recalculados no mesmo comando, sem reatribuir dados. Caso de teste 6 prova ambos os lados.

**(3) Perigo multirow do AFTER ROW:** confirmado o risco de "tuple to be updated was already modified by an operation triggered by the current command". **Escolha: AFTER STATEMENT com transition tables.** Postgres não aceita transition tables em trigger multi-evento, então são três triggers (`_ins`/`_upd`/`_del`), cada um referenciando apenas suas tabelas; a função seleciona o branch por `TG_OP` (plpgsql planeja cada statement só na primeira execução, então branches sem transition table nunca são planejados). O estado final é computado uma vez por comando; os UPDATEs internos re-disparam o trigger e `pg_trigger_depth()>1` encerra a segunda passagem (estado final idempotente). Lock order preservada: `a00_cf_user_gate` (BEFORE STATEMENT) continua adquirindo o singleton antes de qualquer linha; ordem user_clientes→profiles mantida; guards e provisionamento intactos. Provas: teste 3 (revogar principal e eleger outra linha no mesmo comando), teste 4 (`UPDATE principal=true` em duas linhas num só comando), teste 5 (INSERT multirow), teste 11 (duas conexões em loop de troca, sem erro de tupla nem deadlock, estado final coerente).

**(4) Harness com guards reais:** instaladas as definições live de `acquire_gate`, `require_admin`, `touch_related_profiles`, `advance_stamp`, `guard_profile_sensitive_fields`, `guard_profile_tenant_fields`, `h15_profile_organization_guard`, `enforce_cliente_id_for_produtor` e o conjunto completo de triggers em profiles/user_roles/user_clientes, com `user_roles` populadas (Admin/Produtor/Consultor). **Achado de integridade:** o wrapper live `admin_edit_user_profile_v1` proíbe escopo de links (`user_edit_unscoped_links_forbidden`) e `guard_profile_tenant_fields` nega mudança de `cliente_id` para qualquer `auth.uid()` não nulo — ou seja, escritas de vínculo no live ocorrem em contexto service/provisionamento (uid NULL / service_role). O harness espelha isso: escritas de vínculo como `service_role`; negativos autenticados provam que a contenção existente é preservada (teste 8: autenticado não-admin negado pelo guard de tenant; teste 9: anon negado pelo gate; teste 10: `require_admin` impede remover último admin). **UNVERIFIED:** ensaio hosted BEGIN/ROLLBACK, RLS/policies completas, schema fiscal integral, `guard_superadmin_role_assignment`.

**(5) Rollback seguro:** `rollback.sql.review` agora carrega pré-condição explícita — **somente com gate de associação fechado** (estado atual), pois restaura a falha conhecida. Com gate aberto, a contenção segura é o próprio candidato v2 (não o rollback).

## 2. Análise live (captura própria, somente leitura, ref canônico validado)

| Objeto | Estado live | MD5 definição |
|---|---|---|
| `public.sync_user_cliente_principal()` | AFTER ROW; elege principal **sem filtrar** vigência; desempate só `created_at` | `50392a57c5908c67c709c4e84f0e932e` |
| `public.enforce_cliente_id_for_produtor()` | Conta **todos** os links na checagem de role; branch `user_clientes` sem trigger instalado | `ecad56badcb2120f7048fad7519f76f4` |
| `get_cliente_ids_for_user` | Correto: vigência + fallback protegido | `c80d5900692d960f649d0a9f7850fe2c` |
| `has_active_user_cliente_access` | V0 instalado com `revoked_at IS NULL` | `e099f51d128620e5a68cc3e9001dd976` |
| `admin_edit_user_profile_v1` | Proíbe links (`user_edit_unscoped_links_forbidden`); branch comum F2 delegada | `a65e2174baa6996b5bfe64eb7a434524` |

Triggers live em `user_clientes`: `a00_cf_user_gate` (BEFORE STATEMENT), `trg_user_clientes_sync` (AFTER ROW), `z90_cf_touch_profile` (AFTER ROW). Constraints: `UNIQUE(user_id,cliente_id)`; `profiles.cliente_id` FK `ON DELETE SET NULL`.

## 3. Candidato v2 (`scripts/user-links-principal/candidate.sql.review`)

Fora da pasta de migrations. Escopo: `sync_user_cliente_principal` + substituição do trigger ROW por três STATEMENT. Assinatura, `SECURITY DEFINER`, `search_path` e ACL preservados; nenhum GRANT/REVOKE novo.

- Vigência canônica idêntica ao resolver live.
- Rebaixa principais não vigentes; honra `principal` marcado apenas se vigente (desempate determinístico `created_at,id`); garante exatamente um principal vigente; `profiles.cliente_id` só vigente ou NULL — nunca histórico.
- `pg_trigger_depth()>1` garante término; convergência provada, não inferida.
- `enforce_cliente_id_for_produtor` **não alterado** (análise separada em `scripts/user-links-v0/principal-analysis.md`); nenhuma proibição nova sobre writers/provisionamento legados.

## 4. Testes (`scripts/user-links-principal/test-local.py`)

PostgreSQL descartável em `/tmp` (socket, porta 55498, nunca hosted). **21/21 checks PASS**, incluindo guards reais, roles, fluxos service/negativos, multirow (3 casos), reconciliação de user_id antigo/novo, concorrência com duas conexões (20 trocas cada, sem erro de tupla), rollback transacional e consultor intacto. UNVERIFIED listados na seção 1(4).

## 5. Pendências (não deste recorte)

- Ensaio hosted BEGIN/ROLLBACK e concorrência real: pelo auditor, após revisão.
- Cache same-identity e anexos/signed URLs: próximo trabalho, não misturado aqui.
- Gestão de associações (troca mesmo tipo): gates fechados.
- `enforce_cliente_id_for_produtor`: análise separada, não instalada.

---

# Adendo v3 — revisão de `00e4613c` (v2 NÃO aprovado para aplicar)

**Data:** 16/10/2026. **Estado:** CANDIDATO v3 REVISÁVEL — sem SQL hospedado, sem publicação, sem alteração de contas/vínculos, gates de associação fechados. Common F2 e V0 instalados preservados.

## Correções dos pontos da revisão v2

**(1) Supressão genérica removida:** `pg_trigger_depth()>1` foi eliminado. A recursão agora termina por **idempotência com detecção de trabalho**: cada UPDATE interno só é executado quando um `EXISTS` prévio comprova linha a mudar; a segunda passagem encontra zero trabalho, não emite UPDATE e não dispara novo trigger. Nenhum GUC setável é usado. Consequência: um **writer aninhado externo** (trigger de provisionamento que insere `user_clientes` durante a reconciliação) **não é suprimido** — a passagem extra executa seus próprios `EXISTS` e reconcilia o novo estado. Prova: teste 15 (trigger `z95_prov_nested` insere 2º vínculo durante o INSERT do 1º; estado final: 2 vínculos, 1 principal, profile coerente).

**(2) FK cascade:** `user_clientes.cliente_id` é `ON DELETE CASCADE` e `profiles.cliente_id` é `ON DELETE SET NULL` (ambos conferidos no live e no preflight). Teste 14: `DELETE FROM clientes` cascateia os vínculos, dispara o trigger DELETE statement e reelege o principal vigente remanescente; profile fica coerente em qualquer ordem dos triggers RI (o SET NULL só toca linhas ainda apontando para o cliente removido).

**(3) Fluxo "Admin" corrigido no relato:** escritas de vínculo no live ocorrem em contexto **service/provisionamento** (uid NULL), porque `guard_profile_tenant_fields` nega mudança de `cliente_id` para qualquer `auth.uid()` não nulo. Harness: teste 8b prova que **Admin autenticado também é negado** na escrita de vínculo (negação existente, preservada e agora documentada corretamente — não é fluxo Admin real).

**(4) Casos multirow/temporais acrescentados:** teste 3 reescrito como `UPDATE` multirow `CASE` (C1 principal revogado e C2 vigente explicitamente no mesmo comando); teste 16 `DELETE` multirow (remove principal e outra linha, remanescente eleito); teste 17 empate `created_at` com desempate determinístico por `id` (comparado contra a ordenação canônica, sem valor fixo); teste 18 expiração temporal **sem DML** — nenhum trigger dispara com a passagem do tempo (por desenho); o predicado de vigência exclui o expirado e o próximo DML reconcilia (leituras sempre filtradas pelo resolver canônico).

**(5) `valid_from` NOT NULL:** live confirmado `valid_from timestamptz NOT NULL DEFAULT now()`; harness v3 espelha a constraint e os predicados de vigência do candidato não têm mais ramo `IS NULL`. Preflight v3 verifica também: triggers auxiliares (`a00_cf_user_gate` tgtype=30, `a00_cf_user_no_truncate` tgtype=34, `z90_cf_touch_profile` tgtype=29), FK cascade de cliente, NOT NULL de `valid_from`/`principal`/`is_active` com default de `valid_from`, e `profiles.cliente_id` anulável.

## Testes v3

`python3 scripts/user-links-principal/test-local.py` — **36/36 checks PASS** em PostgreSQL descartável (socket /tmp, nunca hosted): guards reais, roles, multirow (CASE/UPDATE/INSERT/DELETE), reconciliação de user_id antigo/novo, FK cascade, writer aninhado de provisionamento, empate determinístico, expiração temporal, negativos autenticados (produtor e Admin), anon, `require_admin`, concorrência com duas conexões (20 trocas cada, sem erro de tupla nem deadlock) e rollback transacional. UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, RLS/policies completas, schema fiscal integral, `guard_superadmin_role_assignment`.

Hashes v3 em `scripts/user-links-principal/SHA256SUMS`. Rollback atualizado para referenciar v3 (pré-condição inalterada: somente com gate de associação fechado).

## Reconciliação documental (mesma rodada, somente leitura)

Migration `20261016234052 client_access_overload_deny_revoked_links` (aplicada pelo auditor) arquivada byte a byte em `scripts/user-links-v0/installed/` com manifesto `20261016234052-ledger-match.json`. MD5 live confirmado pelo agente: `c610786fc9f6d6a44453b9e63c91e974` (baseline `c0acb1dcd7f0b183f9500f4c264c1fa1`); ACL preservada (anon false, authenticated true). Única adição: `AND uc.revoked_at IS NULL` no fallback do overload de dois argumentos. Fonte não encontrou policy direta de dois argumentos — vazamento **não** afirmado como comprovado. Não reaplicado.

## Correção (17/10/2026) — índice live uq_user_clientes_principal

O índice live `uq_user_clientes_principal UNIQUE(user_id) WHERE principal` NÃO
estava no harness quando o teste 4 (`UPDATE principal=true` em duas linhas num
só comando) foi declarado PASS. Com o índice espelhado, esse comando é NEGADO
com 23505: o índice verifica a unicidade antes do trigger AFTER STATEMENT
reconciliar. Harness corrigido (40/40 PASS): troca de principal ocorre via
revogação/vigência, nunca marcando segunda linha como principal. O índice faz
parte da regra live e não será retirado; o modo associação futuro precisa
resolver a troca de principal sem violá-lo e sem flags/GUC setáveis. Ver
docs/auditorias/authz-cache-foundation-20261017.md, seção 1.
