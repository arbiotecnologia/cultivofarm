# PRÉ-F1.3 — Reconciliação de guards em homolog — Relatório de revisão — 2026-10-18

Ref canônico: `swzpzcwiasxmjutrmvkm` (produção, **intocada**). Homolog: `vrlcdwmlytukrjezrrnf`.
**Nenhum SQL executado por este agente. Nada publicado.**
Entrega: `docs/auditorias/vinculos-b2b-pref1-3-migracao-homolog-20261018.sql` (somente aditiva, para revisão e aplicação pelo auditor externo).

## 1. Fatos VERIFICADOS em produção (read-only, 2026-10-18)

### Funções `cf_user_guards_v1` (7, owner `postgres`, `search_path=''`)

| Função | Segurança | Papel |
|---|---|---|
| `acquire_gate()` | DEFINER | Gate STATEMENT; valida TG_RELID ∈ {profiles, user_roles, user_clientes, partner_users, auth.users}; exige `auth.uid()` para anon/authenticated; incrementa `state.revision` |
| `acquire_invitation_gate()` | DEFINER | Idem para `platform_org_admin_invites`, com `FOR UPDATE NOWAIT` |
| `block_truncate()` | INVOKER | Bloqueia TRUNCATE (PT409) |
| `touch_related_profiles()` | DEFINER | AFTER ROW; toca `profiles.updated_at` (user_roles, user_clientes, partner_users) |
| `touch_invitation_profiles()` | DEFINER | Idem para invites |
| `advance_stamp()` | INVOKER | BEFORE UPDATE em profiles; `updated_at` monotônico |
| `require_admin()` | DEFINER | AFTER STATEMENT em profiles/user_roles; bloqueia remover o último admin ativo (PT409) |

**Grants verificados:** somente `postgres` tem EXECUTE em todas as 7; `anon`, `authenticated` e `service_role` **não** executam. `state(singleton bool NOT NULL, revision bigint NOT NULL)`.

### Triggers de guard em produção (pg_trigger, não internos)

| Tabela | Triggers cf_user_guards_v1 |
|---|---|
| `profiles` | `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `z99_cf_profile_stamp`, `z99_cf_require_admin` |
| `user_roles` | `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `z90_cf_touch_profile`, `z99_cf_require_admin` |
| `user_clientes` | `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `z90_cf_touch_profile` |
| `platform_org_admin_invites` | `a00_cf_invitation_gate`, `a00_cf_invitation_no_truncate`, `z90_cf_invitation_profile_stamp` |
| `partner_users` | 3 triggers — **já replicados em homolog pela PRÉ-F1.2** |

Produção tem ainda guards de aplicação fora do schema cf (`guard_profile_senha_*`, `guard_profile_sensitive_fields`, `h15_profile_organization_guard`, `guard_profile_tenant_fields`, `enforce_cliente_id_for_produtor`, `sync_user_cliente_principal`, `guard_superadmin_role_assignment`, `update_updated_at_column`). **Não verificado se existem em homolog** — ver seção 3 (achado A2).

## 2. Conteúdo da migration PRÉ-F1.3 (preparada, NÃO executada)

- **P0 preflight fail-closed:** exige PRÉ-F1.2 presente (schema/state/3 funções com flags corretas), 4 tabelas alvo existentes, `auth.uid()` disponível, e **aborta** se qualquer trigger/função a criar já existir (sem duplicidade, sem conflito).
- **P1:** cria as 4 funções ausentes (`acquire_invitation_gate`, `advance_stamp`, `require_admin`, `touch_invitation_profiles`) com corpos **verbatim** de produção, mesma segurança (DEFINER/INVOKER, `search_path=''`), REVOKE de PUBLIC/anon/authenticated/service_role (REVOKEs condicionados à existência das roles — correção já validada na PRÉ-F1.2).
- **P2:** cria os 14 triggers com nomes/timing/eventos idênticos à produção.
- **P3:** validação pós-criação na mesma transação (17 triggers cf no total, incluindo os 3 de `partner_users`).
- **Smokes S1–S5** transacionais documentados no rodapé; **rollback completo** sem CASCADE, preservando PRÉ-F1.2/F1 e dados.

## 3. Achados e blockers

- **A1 (informativo):** escopo coberto — as 4 tabelas recebem exatamente os guards cf de produção. `partner_users` já está coberta.
- **A2 (BLOCKER para RLS A/B, não para a migration):** os guards de aplicação fora do schema cf (listados na seção 1) **não foram verificados em homolog** — este agente não tem acesso ao homolog. Se estiverem ausentes, a paridade de segurança continua incompleta mesmo após PRÉ-F1.3. **Ação:** auditor externo deve rodar em homolog a consulta de `pg_trigger` da seção 1 e comparar; diferenças viram PRÉ-F1.4.
- **A3 (limitação declarada):** smokes S1–S5 rodam com role privilegiada. Proteção **cross-tenant** e invalidação de **cache de autorização** (lease 15s) **não são reproduzíveis** via SQL privilegiado — exigem sessões reais anon/authenticated (Admin A/B). **Nenhum PASS de login real é afirmado.** Esse teste segue como pré-requisito de F2 (plano F2, itens B3/B5).
- **A4 (concorrência):** `acquire_invitation_gate` usa `FOR UPDATE NOWAIT` — sob concorrência pode falhar com `55P03`; comportamento idêntico ao de produção (verbatim), registrado para os testes de concorrência da F2.
- **A5 (pendência conhecida, inalterada):** produção tem 1 vínculo com parceiro sem tenant (P1) e homolog tem 279 vs 286 tabelas — paridade total não atestada; F2 permanece **BLOQUEADA**.

## 3.1 Validação local executada nesta rodada (Postgres 17.9 descartável, stub de homolog pós-PRÉ-F1.2)

- **Aplicação:** migration executa até COMMIT com P0–P3 PASS. ✅
- **Idempotência por recusa:** reexecução aborta em `PREF13_CONFLICT` (P0.4/P0.5), sem efeitos. ✅
- **Smoke S1 (gate/revision):** UPDATE em `profiles` incrementa `state.revision` (3→4) com fixture de admin ativo. ✅ — **achado de semântica:** com zero admins ativos, `require_admin` bloqueia até INSERT em `profiles` (comportamento verbatim de produção; a fixture exigiu desabilitar o trigger só na preparação). Documentar para o auditor: em homolog real há admins, mas o primeiro bootstrap de admin em base vazia exige janela controlada.
- **Smoke S2 (TRUNCATE):** bloqueado com `user_bulk_truncate_forbidden` (PT409). ✅
- **Smoke S3 (último admin):** DELETE do único admin bloqueado com `user_last_active_admin` (PT409). ✅
- **Rollback:** os 14 triggers + 4 funções removidos sem CASCADE; restam exatamente os 3 triggers da PRÉ-F1.2. ✅
- **Limitação do stub:** `auth.users` precisou ser criado no stub (gate referencia o regclass); homolog real já o possui. S4 (cross-tenant/cache) **não testado** — exige sessões reais, sem PASS declarado.
- **Correções feitas durante a validação:** checagem de `search_path` no preflight (proconfig armazena `search_path=""`); contagem P3 corrigida para 17 (14 novos + 3 PRÉ-F1.2).

## 4. Critérios de aceite da PRÉ-F1.3 (para o auditor externo)

1. P0 aborta limpo se executado fora de ordem ou em base divergente (testar reexecução — deve falhar em P0.4/P0.5, provando idempotência por recusa).
2. Aplicação única em homolog → P3 PASS (17 triggers).
3. Smokes S1–S3 e S5 sem exception + ROLLBACK; 0 linhas persistidas.
4. Comparativo `pg_trigger` pós-aplicação: homolog = produção para as 5 tabelas (schema cf).
5. Verificar achado A2; se houver guards de aplicação faltantes, abrir PRÉ-F1.4 **antes** de qualquer teste A/B.

## 6. NO-GO CONFIRMADO — 0 admins ativos em homolog (2026-10-18, auditor externo)

**Fato verificado pelo auditor externo em homolog `vrlcdwmlytukrjezrrnf`:** `SELECT count(*) FROM profiles p JOIN user_roles r ON r.user_id = p.user_id WHERE p.ativo AND r.role = 'administrador'` → **0**. Consequência direta: o guard `require_admin` (AFTER STATEMENT em `profiles`/`user_roles`) **impediria o bootstrap do primeiro admin** — qualquer INSERT/UPDATE que criasse o primeiro administrador ativo seria bloqueado, pois a checagem "não remover o último admin ativo" falha também quando a base termina sem nenhum admin ativo. **PRÉ-F1.3 NÃO foi aplicada e está NO-GO até existir ≥1 admin ativo válido em homolog.** Isso confirma a ressalva de bootstrap já registrada na seção 3.1 (smoke S1 exigiu desabilitar o trigger na fixture local).

### 6.1 Limitação de acesso deste agente (declarada)

As consultas `supabase--read_query` deste agente atingem **somente o ref canônico de produção** `swzpzcwiasxmjutrmvkm`. Não foi possível inspecionar homolog diretamente; toda evidência de homolog nesta seção vem do auditor externo. Em produção (read-only, sem PII), o inventário de prontidão do fluxo canônico é:

- `organizations`: 5; `profiles`: 14; `auth.users`: 14; `user_roles`: 14; administradores ativos: 3; **superadmin ativo: 1**; `platform_org_admin_invites`: 3.
- RPCs canônicas de provisionamento existentes (produção): `platform_claim_org_admin_provisioning` (4 overloads, INVOKER/DEFINER), `platform_find_org_admin_provisioning_auth_user`, `platform_finalize_org_admin_provisioning`, `platform_fail_org_admin_provisioning`, `platform_conclude_provisional_password(_server)`, `admin_provision_user_profile_v1` (INVOKER), `org_onboarding_state/save/complete` (DEFINER).
- `platform_org_admin_invites` possui colunas de ciclo completo: `status`, `request_id`, `lease_token/lease_expires_at`, `email_*` (entrega/idempotência), `access_operation_*`. **Não verificado se homolog possui essas RPCs/colunas** — pré-condição do plano abaixo (consulta read-only pelo auditor).

### 6.2 Plano de remediação — BOOTSTRAP SEGURO do primeiro admin em homolog (fases, sem bypass)

**Princípios:** usar exclusivamente o fluxo existente de convite/provisionamento de admin de organização; tenant de homolog distinto; nunca inventar senha, nunca inserir `user_roles`/`profiles` por SQL direto, nunca desabilitar guards em produção, nunca copiar usuários/auth de produção.

- **B0 — Readiness read-only em homolog (auditor externo):** confirmar existência em homolog de `organizations` (≥1 tenant de homolog válido), `platform_org_admin_invites` com as colunas acima, RPCs `platform_claim_org_admin_provisioning` e finalizadoras, e a Edge de provisionamento correspondente. Se qualquer dependência faltar → **NO-GO do bootstrap**; registrar e não improvisar.
- **B1 — Convite via fluxo canônico:** um **superadmin de homolog** (se existir; verificar — produção tem 1, homolog não confirmado) executa `platform_claim_org_admin_provisioning` para um e-mail de teste controlado do auditor, no tenant de homolog. Se homolog não tiver superadmin ativo, o bootstrap do superadmin segue o fluxo de plataforma já existente (convite de plataforma) — **nunca** INSERT manual.
- **B2 — Aceite e definição de senha pelo convidado:** o convidado conclui pelo link canônico de primeiro acesso (`/reset-password` no host de homolog), definindo a própria senha. Nenhuma senha é gerada, conhecida ou registrada pelo agente/auditor.
- **B3 — Verificação pós-bootstrap:** `profiles.ativo = true` + `user_roles.role = 'administrador'` presentes; login/logout real no ambiente de homolog; contagem de admins ativos ≥ 1.
- **B4 — Só então PRÉ-F1.3:** aplicar a migration já preparada; smokes S1–S3/S5 transacionais; validar que `require_admin` agora **bloqueia** a remoção/desativação do único admin (comportamento esperado pós-guard).
- **B5 — Gate seguinte:** permanecem os blockers A2 (guards de aplicação fora do schema cf não verificados em homolog), 279 vs 286 tabelas, P1 (vínculo sem tenant em produção) e o teste A/B de RLS com sessões reais. **F2 continua BLOQUEADA.**

### 6.3 Critérios de aceite do bootstrap

1. Primeiro admin existe **validamente** (via RPC/convite canônico, com auditoria em `platform_org_admin_invites`) antes da PRÉ-F1.3.
2. Após PRÉ-F1.3, tentativa transacional de remover/desativar o último admin falha com `user_last_active_admin` (PT409) + ROLLBACK, 0 linhas persistidas.
3. Logout/login real do admin bootstrapado em homolog comprovado pelo auditor (fora do escopo deste agente).
4. Nenhuma equivalência com produção é presumida: contagens, RPCs e colunas de homolog devem ser verificadas item a item (B0).

**Próximo gate:** B0 (readiness read-only em homolog pelo auditor externo) → B1–B3 → PRÉ-F1.3 → A2 → teste A/B. Nenhum DDL/DML executado neste turno; nada publicado.

## 7. B0 corrigido — homolog está VAZIO de identidades (2026-10-18, auditor externo)

**Fatos verificados pelo auditor em homolog `vrlcdwmlytukrjezrrnf`:** `organizations=1`, `profiles=0`, `user_roles=0`, `platform_org_admin_invites=0`, `auth.users=0`. RPCs `platform_claim_org_admin_provisioning` (4 overloads) e `platform_finalize_org_admin_provisioning` existem e a tabela de invites tem estrutura.

**Consequência:** o plano B1 anterior (convite por superadmin de homolog) **não é executável** — não existe nenhum usuário autenticado em homolog. A Edge `platform-invite-org-admin` exige JWT de **superadmin** verificado server-side via `is_platform_superadmin` (verificado no código-fonte, linha 93-98) e **nunca concede** o papel `superadmin` — apenas `administrador` da empresa. Ou seja: o fluxo canônico de convite pressupõe um superadmin preexistente, e **não há RPC/Edge de bootstrap inaugural** no codebase (verificado: nenhuma função `setup`/`signup`/`seed` de primeiro superadmin; as migrations apenas adicionam o valor `superadmin` ao enum — o primeiro superadmin de produção foi criado fora de migration, por procedimento operacional não versionado).

### 7.1 Opções avaliadas para o primeiro superadmin de homolog

| Opção | Avaliação |
|---|---|
| Convite canônico por superadmin | **Inviável** — exige superadmin que não existe em homolog. |
| RPC/Edge de bootstrap inaugural | **Inexistente** no codebase; **não será inventada** (seria bypass de segurança). |
| Copiar identidade/sessão de produção | **Proibido** — viola isolamento e a regra de não reutilizar identidade de produção. |
| Provisionamento privilegiado supervisionado (Dashboard Supabase de homolog) | **Único caminho viável**, executado pelo proprietário/auditor com acesso de owner ao projeto homolog — fora do alcance deste agente. |

### 7.2 Plano B0 corrigido — bootstrap inaugural supervisionado (executado pelo proprietário/auditor, nunca pelo agente)

- **C0 — Criação do usuário inaugural (painel Supabase de homolog):** o proprietário cria **manualmente no Dashboard do projeto homolog** (Authentication → Users → Add user) um usuário com e-mail controlado do auditor, com confirmação de e-mail. Nenhuma senha trafega em chat; a senha inicial é definida pelo próprio convidado via fluxo de recuperação/primeiro acesso, ou temporária gerada pelo painel e trocada no primeiro login.
- **C1 — Concessão do papel superadmin (única escrita privilegiada autorizada):** via SQL Editor do painel de homolog, em transação única e auditada em ata: garantir `profiles` do usuário (ativo) e `INSERT INTO public.user_roles (user_id, role) VALUES (<uuid>, 'superadmin')`. **Estado anterior a guards:** como PRÉ-F1.3 ainda não foi aplicada, `require_admin` não existe em homolog — este INSERT não será bloqueado. Registrar em ata: quem executou, quando, uuid mascarado, motivo (bootstrap de homologação).
- **C2 — Verificação:** login/logout real do superadmin inaugural em homolog; `is_platform_superadmin(<uuid>)` retorna true; contagens passam a profiles=1, user_roles=1.
- **C3 — Daqui em diante, somente fluxo canônico:** o superadmin inaugural usa `platform-invite-org-admin` para criar o **administrador do tenant de homolog** (organizations=1 já existe) com e-mail de teste do auditor; o convidado define a própria senha pelo link de primeiro acesso. Verificar `platform_org_admin_invites` com auditoria do convite.
- **C4 — Só então PRÉ-F1.3:** aplicar a migration preparada; smoke de `require_admin` bloqueando remoção do último admin ativo (transacional, ROLLBACK, 0 linhas persistidas).
- **C5 — Gates seguintes (inalterados):** A2 (guards de aplicação fora do schema cf), 279 vs 286 tabelas, P1, teste A/B de RLS com sessões reais. **F2 BLOQUEADA.**

### 7.3 O que o usuário/proprietário precisa fornecer ou realizar

1. Acesso de owner ao **Dashboard do projeto homolog** `vrlcdwmlytukrjezrrnf` (este agente não tem e não deve receber essa credencial).
2. Executar C0/C1 pessoalmente ou delegar ao auditor externo sob supervisão, registrando ata.
3. Um e-mail de teste controlado para o superadmin inaugural e outro para o admin de tenant (não reutilizar e-mails de produção).
4. MFA: recomendado ativar MFA no usuário inaugural após o primeiro login (configuração de conta do próprio usuário); o primeiro acesso segue o fluxo canônico de definição de senha — nenhuma senha em chat ou relatório.
5. Comprovação: prints/consultas de contagem (sem PII) antes/depois, resultado de `is_platform_superadmin`, e registro do convite em `platform_org_admin_invites`.

**Nota de segurança:** C1 é a única escrita direta autorizada e só é segura **porque** os guards ainda não existem em homolog; após PRÉ-F1.3, esse caminho fica bloqueado por `require_admin`/`guard_superadmin_role_assignment` — o que é o comportamento desejado. Nenhuma equivalência com produção é presumida.

## 5. Recomendações

1. Aplicar PRÉ-F1.3 em homolog somente após revisão deste relatório.
2. Resolver A2 (inventário dos guards de aplicação em homolog) na sequência — sem isso, o teste A/B de RLS não é representativo.
3. Manter F2 bloqueada até: PRÉ-F1.3 + A2 + teste A/B com sessões reais + P1 (parceiro sem tenant) + gate de tenant do plano F2.
4. Nenhuma execução em produção neste checkpoint.
