# Perfil Financeiro B2B externo (`parceiro_b2b_financeiro`) — candidato INATIVO

Usuário EXTERNO da equipe do parceiro, somente leitura das obrigações do próprio parceiro perante o fornecedor.
Nada deste pacote foi aplicado ao banco hospedado, implantado ou publicado.

## Captura LIVE (somente leitura, 17/11/2026, ref swzpzcwiasxmjutrmvkm comprovado por `supabase/config.toml` e cliente canônico)
- `app_role` sem o valor; `partner_users_papel_check` = gestor/tecnico; `partner_users.user_id` único.
- Leitor revisado `rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)` (INVOKER) → `platform_private.b2b_own_obligations` → guardião `b2b_own_obligations_owner` (exige `parceiro_b2b` + `is_valid_b2b_partner_user`). Instalado e com EXECUTE para authenticated.
- `is_valid_b2b_partner_user` exige papel gestor/técnico e proíbe qualquer papel fora de gestor/técnico/produtor → financeiro já é negado por todas as RPCs/RLS que o usam.
- Políticas sem papel baseadas em `partner_users`: `pofl_partner_select_own` (links pedido↔título) e `partner_accounts_self_select` → fechadas ao financeiro por políticas RESTRICTIVE novas. `production_planning` já tem guarda restritiva; `rpc_partner_message_counters` só devolve 4 contagens do próprio parceiro (residual documentado, não chamado pela UI).
- Crédito: `rpc_b2b_partner_credit` → `assert_b2b_partner_scope` (nega papéis não gestor) e `fn_b2b_credit_exposure` → `b2b_integration_actor` → `c2_order_actor_scope` (autoridade dos writers de pedido). Por isso crédito fica BLOCKED.
- Provisionamento: `external_provisioning_scope`, `admin_provision_user_profile_v1`, `b2b_finish_provisioning` e Edge `create-user` só aceitam gestor/técnico/produtor (Edge LIVE responde `tenant_role_unavailable` ao novo papel — falha fechada).

## Conteúdo
| Arquivo | Papel |
|---|---|
| `captured/*.sql`, `pins.json` | Corpos LIVE verbatim + md5 |
| `build.py` | Gera 01-pre / 02b / 04-rollback com âncoras únicas |
| `01-pre.sql.readonly` | Ref + md5 dos 4 corpos alterados + CHECK atual |
| `02a-install-enum.sql.review` | `ADD VALUE` em transação própria |
| `02b-install.sql.review` | CHECK papel, helpers privados, capacidade, 2 políticas RESTRICTIVE, 4 deltas mínimos, ACL |
| `03-post.sql.readonly` | Pós-verificação |
| `04-rollback.sql.review` | Recusa com papel/vínculo ativo; restaura corpos verbatim; enum permanece |
| `edge/create-user.patch.review` | Delta da Edge (não aplicado; base sha256 em `create-user.base.sha256`) |
| `test_local_pg.py`, `fixture*.sql` | Bateria PostgreSQL 17 descartável (auth sintética) |

## Ordem de ativação (auditor)
1. `SET app.expected_ref='swzpzcwiasxmjutrmvkm'`; 01-pre → PRE_PASS. 2. 02a. 3. 02b. 4. 03-post → POST_PASS.
5. Aplicar `edge/create-user.patch.review` em `supabase/functions/create-user/index.ts` (implantação automática) somente após 02b.
6. Postflight REST/JWT real: financeiro A/B mesma empresa, outro tenant, revogado, inativo, técnico, gestor, sem entitlement; chamadas diretas às tabelas.
7. Só então `B2B_FINANCE_ROLE_INSTALLED=true` em `src/lib/comercial/b2bFinanceRole.ts` (oferece o perfil no cadastro).

## Pendências reais (não autorizadas por este pacote)
- Crédito (limite/utilização/saldo): exige leitor de crédito separado que não dependa de `c2_order_actor_scope`, com revisão própria.
- Edição/transição de tipo para/desde Financeiro no painel de refinamento (`scripts/user-edit-access-email-links-20261117`) não atualiza `partner_users.papel`; manter fechada (o helper nega papel/vínculo divergente). Revogação/inativação funcionam pelos caminhos existentes.
- Monitor de época do AuthProvider não inclui o papel; revogação é percebida pela reconsulta da capacidade (30 s / foco) e por toda RPC.
- Documentos/anexos financeiros continuam fechados (mesma regra do leitor C2).
