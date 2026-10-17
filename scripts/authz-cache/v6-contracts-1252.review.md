# Complemento 12:52 — contratos fornecidos, NO-GO

Fonte: dados read-only do auditor, ref `swzpzcwiasxmjutrmvkm`; 144 constraints relacionadas, 33 índices selecionados, manifest 33 policies/11 buckets e seis funções com corpos. Reconciliados nesta revisão, não recapturados nem ensaiados como DML/HTTP/browser. Nenhuma nova migration/Edge/bucket.

## Constraints/índices recebidos: efeito concreto

- `partner_users UNIQUE(user_id)` e `profiles UNIQUE(user_id)`; preservar, sem assumir múltiplos parceiros nem novas flags.
- `user_clientes UNIQUE(user_id,cliente_id)` e `uq_user_clientes_principal UNIQUE(user_id) WHERE principal=true`: conflito imediato precede AFTER STATEMENT sync; não testar fixture sem índice.
- `uq_org_subscriptions_one_current` cobre TRIAL/ACTIVE/PAST_DUE/SUSPENDED; `ofo_one_open_per_feature` cobre organization_id+feature_id WHERE ended_at IS NULL; unicidades parciais de idempotência dos overrides recebidas.
- Subscription/history/version features usam FKs RESTRICT; ordem org → assinatura → versão → ticket → UPDATE → histórico deve considerar locks FK e unicidades, não apenas statements explícitos.
- **Cascade indireta para identidade:** DELETE clientes pode executar user_clientes CASCADE e profiles.cliente_id SET NULL; DELETE partner_accounts pode executar partner_users CASCADE, organizations.partner_account_id SET NULL e outras filhas; DELETE organizations pode executar profiles.organization_id SET NULL. Esses DML acionam os gates já existentes. Logo nem “ledger não faz UPDATE profiles” garante ausência de singleton em cascades reais; não remover/bypassar gates.
- FK `clientes_audit_log.changed_by → profiles(user_id)` e filhas financeiras/auditorias adicionam locks. Pacote recebido lista FKs relacionadas; não contém todos triggers/colunas/índices dessas filhas nem DDL/ACL de `platform_private.authz_tickets`. Ainda insuficiente para fixture fiel completo.
- Índices recebidos focam sete tabelas; não comprovam indexação do futuro ledger, toda closure ou ausência de scans/fanout. Não re-pedir os 144/33 já recebidos.

## Seis corpos agora recebidos (não mais faltantes)

| Assinatura | MD5 informado |
|---|---|
| platform_private.issue_saas_plan_version_ticket(text,uuid) | 116f010bf91daae67ba3587aac3212a6 |
| platform_private.issue_ticket(text,uuid) | c32ad23a9db8574af85da8fcfc45af43 |
| platform_private.transition_subscription_core(uuid,text,text,uuid,uuid) | e7e3b57debf67673a82e3f4f7c2daa48 |
| public.admin_edit_user_profile_v1(uuid,timestamp with time zone,jsonb,app_role[],uuid[],uuid,uuid) | a65e2174baa6996b5bfe64eb7a434524 |
| platform_private.is_tenant_admin_for_user(uuid) | 6f548278ad7a8fc39e83cad7c0101de2 |
| platform_private.user_edit_f2_common(uuid,timestamp with time zone,jsonb,app_role[],uuid[],uuid,uuid) | d5e006ba09bfe53004971d512fc6cd49 |

- subscription core: ator/role/atividade → organização FOR UPDATE → assinatura FOR UPDATE → versão FOR SHARE → issue_ticket → assinatura DML → audit. `clock_timestamp()` após lock org; replay lê histórico após lock. Não executar nem repetir ativação ACTIVE.
- Admin interno: authorize → profile FOR UPDATE → INSERT/DELETE user_roles (BEFORE STATEMENT singleton) → UPDATE profiles. **Row profile → singleton** difere de DML direto **singleton → row profile**. Possível ciclo concorrente; não declarar deadlock observado sem duas conexões/DDL real. Este achado fica documentado, sem correção lateral de identidade.
- Common: preauthorize/gate → singleton NOWAIT → gate FOR SHARE → profiles ORDER BY user_id FOR UPDATE → roles/links ordenados FOR UPDATE → clientes/partners ordenados FOR SHARE → authorize/version/replay → profile UPDATE → audit. NOWAIT no singleton contém espera reversa ali; não prova todos callers/cascades. Introduzir ledger em resource row hold seguido profile lock pode conflitar com essa ordem.
- `issue_ticket` faz INSERT ON CONFLICT em tickets txid/scope/target, sem autorização própria no corpo; preservar boundary/ACL privada. `issue_saas_plan_version_ticket` verifica role/scope/alvo e também INSERT; não comprova perfil ativo por si só. Não ampliar grants.
- `is_tenant_admin_for_user` chama `is_same_tenant_user(uuid)`; common chama `platform_actor_access_ready(uuid)`, `user_edit_f2_authorize(uuid)` e `user_edit_f2_version(uuid)`. Necessários os corpos live/hash/ACL restantes dessas assinaturas e catálogos gate/audit/tickets, sem stubs. A leitura canônica anterior confirmou assinaturas dos demais writers em v6-writers-catalog.review.md; ainda faltam corpos de publicação/drafts/overrides/invites/partners/provisioning e filhas.

## Snapshot/tempo

Nenhuma dessas constraints produz revisão de expiração sem DML; A→B→A comercial ainda precisa stamp por recurso/tombstone e coleção OLD/NEW comprovados. `now()` do resolver canônico e sync principal continua tempo transacional, distinto do clock após lock de subscription. Precisa teste de transação antiga, commit entre chamadas VOLATILE antes/depois e fronteira de vigência/lease conservadora. Não alterar resolvers para mascarar isso.

**Decisão:** não produzir SQL de ledger instalável/reversível sem ordem/closure/tempo. Candidata Storage/rollback continuam fechadas e não instaláveis pelo manifest incompleto para os destinos esperados; novo manifest confirma buckets ausentes. Preservar dados, gates false, troca bloqueada, Auth/SMTP/ACTIVE. T0 indefinido.