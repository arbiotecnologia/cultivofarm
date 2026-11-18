# Perfil Financeiro B2B externo (`parceiro_b2b_financeiro`) — incidente de cadastro (18/11/2026)

## Incidente ativo: criação direta não coberta pelo QA anterior
Root confirmou violação de `c2_receipt_roles_shape` em produção às 01:07:07Z, sem Auth/profile/recibo criado. A validação HML por aplicador→transição não cobriu esse CHECK omitido no pacote/fixture. Correção incremental revisável e testes em `receipt-shape/`; sem aplicação pelo agente. A varredura também encontrou o mapeamento legado de compensação sem Financeiro, documentado separadamente; não declarar recuperação completa homologada.

Usuário EXTERNO da equipe do parceiro, somente leitura das obrigações do próprio parceiro perante o fornecedor.
## Estado atual (18/11/2026)
- Produção `swzpzcwiasxmjutrmvkm`: root aplicou 02a+02b+02c (commit 7f8a55a), todos success; 03-post POST_PASS. Nenhum dado criado em produção.
- Edges implantadas pelo agente: `create-user` (patch revisado, base sha256 931ba9fa…ca095 conferida; canônico == candidato sem cabeçalho) e `tenant-user-admin` (handler revisado do pacote user-edit + `_shared/user-admin/verify-actor.ts`). Verificação live pelo root.
- `B2B_FINANCE_ROLE_INSTALLED=true`. Frontend NÃO publicado: publicação pelo root após verificação.
- As seções abaixo são histórico das revisões; pendências antigas foram resolvidas (ver "Resolvido").

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

## Resolvido (histórico rev.1 — pendências originais, todas fechadas nas rev.2/3 e no QA HML real)
- Crédito (limite/utilização/saldo): exige leitor de crédito separado que não dependa de `c2_order_actor_scope`, com revisão própria.
- Edição/transição de tipo para/desde Financeiro no painel de refinamento (`scripts/user-edit-access-email-links-20261117`) não atualiza `partner_users.papel`; manter fechada (o helper nega papel/vínculo divergente). Revogação/inativação funcionam pelos caminhos existentes.
- Monitor de época do AuthProvider não inclui o papel; revogação é percebida pela reconsulta da capacidade (30 s / foco) e por toda RPC.
- Documentos/anexos financeiros continuam fechados (mesma regra do leitor C2).

## Rev.2 (crédito e contadores)
- Crédito: `b2b_finance_credit_v1` (INVOKER) → `b2b_finance_credit_core` (DEFINER, ator derivado do servidor) → `b2b_credit_exposure_core` (corpo LIVE de `fn_b2b_credit_exposure` sem a linha de ator; sem EXECUTE a clientes). `fn_b2b_credit_exposure` mantém assinatura/ACL e a mesma checagem `b2b_integration_actor` antes de delegar. Projeção sem parâmetros de política.
- `rpc_partner_message_counters`: financeiro negado (`permission_denied`).
- Bateria local: 105/105 (seams de crédito declaradas em fixture.sql; não são corpos LIVE).

## Rev.3 (transição, monitor, crédito transitivo)
- Descoberta: `b2b_credit_balances` LIVE chama `b2b_integration_actor` (→ `c2_order_actor_scope`), o que negaria o financeiro mesmo com o núcleo de exposição. Corrigido: `b2b_credit_balances_core(p_partner,p_exclude,p_org)` gerado do corpo LIVE, org obrigatória = dona ativa do parceiro; wrapper pública mantém ACL `postgres` e a checagem canônica.
- `02c-install-access-transition.sql.review` (requer 02b e o pacote user-edit instalado, pins LIVE do núcleo/exec): alvo `b2b_finance`, CAS de vínculo, leitor `tenant_admin_partner_link_v1`. Reversão `04c`.
- Edge `tenant-user-admin` (pacote user-edit): allowlist + `partner_id`/`expected_link_version`; 20/20 Deno.
- Ordem: 01-pre → 02a → 02b → 03-post → 02c → Edge `create-user` (patch) e `tenant-user-admin` → postflight hospedado → só então `B2B_FINANCE_ROLE_INSTALLED=true`.
- Baterias locais: `test_local_pg.py` 113/113 (balanços/config reais; seams declaradas em fixture.sql), `test_access_transition_pg.py` 42/42 (28 gatilhos de produção verbatim + núcleo/exec LIVE).

## Provas — HML real versus local
- HML REAL (`vrlcdwmlytukrjezrrnf`, executado pelo root): 72/72 com JWTs password Auth de 5 contas descartáveis/3 parceiros (A/B mesma org, C outra); 6 forjas cross-partner 403; writes/RLS negados; crédito A 5000/1000/4000, B 7000/1000/6000, C 9000/1000/8000; histórico cancelado; browser desktop e mobile 390px sem overflow; CSV 3 linhas somente A; revogação canônica negou JWT antigo e AuthProvider retirou dados/CSV. Limpeza: 127 registros + 5 Auth via Admin API, QA_VERIFY todos zero, schema QA removido.
- LOCAL (PostgreSQL descartável/auth sintética, Vitest, Deno): não prova ambiente hospedado; ver `VALIDATION.md`.
- Produção: apenas PRE/POST_PASS e instalação; sem massa fictícia (proibida). Verificação live das Edges pelo root.
