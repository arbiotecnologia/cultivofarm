# Contratos recebidos em 2026-10-17 12:49 UTC

Fonte: catálogo canônico `swzpzcwiasxmjutrmvkm` fornecido pelo auditor no pedido; não é nova coleta HTTP/browser nem execução local. 13 funções, 55 triggers públicos nas 14 tabelas, 287 colunas. Índices/constraints serão fornecidos no próximo delta. Nenhum contrato abaixo foi substituído por stub.

| Assinatura | MD5 informado | Volatilidade |
|---|---|---|
| public.is_platform_superadmin(uuid) | 3dfe79d976821244d9b7a7f893d765f2 | s |
| cf_user_guards_v1.require_admin() | ec8e7077521cdee212be924bfb400e8a | v |
| public.guard_profile_sensitive_fields() | 1c2ad8d0ef38ea66866f8b85d3acb109 | v |
| public.guard_profile_senha_provisoria() | e38505f726490b064e61d9aa4e3be5a7 | v |
| public.guard_profile_senha_ticket() | bb9ea2f95f8f151ebd4b97c2a2e747b7 | v |
| public.guard_profile_tenant_fields() | bd6d513d936f5c5fb0490b5d1d2f9f1d | v |
| public.h15_profile_organization_guard() | 43be4da16aae664a48fa4c73315b4420 | v |
| public.guard_superadmin_role_assignment() | 4a59f48e25096848a79be6de9d959cef | v |
| public.enforce_cliente_id_for_produtor() | ecad56badcb2120f7048fad7519f76f4 | v |
| public.update_updated_at_column() | b1930ed5bca3be839f783c6202ab8147 | v |
| platform_private.has_ticket(text,uuid) | 29adae3347e8a5ff23327fa86fceb54b | s |
| storage.allow_only_operation(text) | e2f7d55adc027df69ec4b42c6c08f50f | s |
| storage.allow_any_operation(text[]) | ccefb34283c346cc88e224d075bd5312 | s |

## Consequências dos corpos fornecidos

- `has_ticket` consulta `platform_private.authz_tickets` por `txid_current()`, scope e target; não é o stub `SELECT false` do fixture reduzido. DDL/constraints/índices desse recurso privado também são necessários antes de harness fiel.
- `is_platform_superadmin` prova role `superadmin`, não prova perfil ativo por si só. Preservar a verificação de atividade dos resolvers canônicos.
- Identidade: `a00_cf_user_gate` BEFORE STATEMENT tgtype 30 em profiles/user_roles/user_clientes/partner_users adquire singleton antes do DML; `z90_cf_touch_profile` AFTER ROW tgtype 29 nos três vínculos; `z99_cf_profile_stamp` BEFORE ROW tgtype 19. Corpo `advance_stamp` monotônico por perfil, não por dependência comercial.
- Invites: BEFORE STATEMENT `acquire_invitation_gate` toma singleton `FOR UPDATE NOWAIT` antes de incrementar; touch OLD/NEW ordena UUIDs e faz UPDATE profiles. NOWAIT evita espera nesse ponto, não comprova ausência de inversão nos callers.
- Principal: `sync_user_cliente_principal()` hash `1d053564ccd5fa672a10ec87d5cb0baa`; três AFTER STATEMENT tgtype 4/8/16 com transition tables. Coleta OLD+NEW sem ordenar `v_users`; pode executar UPDATE user_clientes aninhado e profiles.cliente_id. Não alterar esse corpo nem prometer ordenação entre usuários/transações.
- Partner: recálculo AFTER UPDATE desconto_padrao escreve partner_product_prices; audit escreve partner_audit_logs; default financeiro AFTER INSERT escreve partner_financial_settings. Clientes audit escreve clientes_audit_log; assinatura audit escreve organization_subscription_history. FKs/índices/guards dessas tabelas-filhas ainda não fechados.
- Guard de tenant usa `h15_actor_organization()`, registro comercial usa também `has_role(uuid,app_role)` e SELECT clientes/profiles. Esses leitores e seus efeitos reais devem integrar a closure, sem ampliar Auth gerenciado.
- Planos/overrides: guards usam tickets e SELECT de versões; `saas_plan_version_no_mutation` permite encerramento de effective_to no publish sucessor. Não inferir imutabilidade absoluta de vigência. now() nos resolvers/sync é tempo transacional; expiry sem DML não incrementa stamp.
- Storage helpers normalizam prefixo `storage.`; comparação exata, contexto ausente nega. allow_any é STABLE INVOKER, owner supabase_storage_admin, proconfig/proacl NULL. `storage.operation()` e manifest policies/buckets/ACL efetiva continuam pendentes.

## Decisão

Não há SQL novo de ledger/rollback executável: falta ordem dos callers, FKs/índices e prova concorrente/temporal. Gate global existente não é removido nem bypassado. A candidata Storage continua fail-closed: hash helper conhecido, hash do manifest desconhecido. RLS não contém service_role/BYPASSRLS; emissores Edge precisam contenção própria antes de T0.