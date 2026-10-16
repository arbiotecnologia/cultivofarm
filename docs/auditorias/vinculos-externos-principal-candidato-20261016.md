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
