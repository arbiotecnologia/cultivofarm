# Defeito RLS separado: `entrega_termos` sem isolamento de tenant para staff (ABERTO)

Registro, **não correção**. A Edge candidata não fecha esta exposição: a tabela continua legível pela REST
(PostgREST) com o token do usuário.

## Evidência somente leitura (produção `swzpzcwiasxmjutrmvkm`, 19/10/2026 ~23:45 UTC)
- Política única: `entrega_termos_select`, PERMISSIVE, SELECT, `TO authenticated`:
  `is_delivery_staff(uid) OR is_financial_staff(uid) OR EXISTS(entregas e WHERE e.id = entrega_id AND e.cliente_id = ANY(get_cliente_ids_for_user(uid)))`.
- `is_delivery_staff` (SECURITY DEFINER) = `fn_authz_uid_scope_ok(uid)` + papel (administrador/gestor/administrativo/
  producao/operador_onfarm/aplicador). **Não compara a organização do termo/entrega.** A revisão independente
  relata o mesmo para `is_financial_staff`.
- Privilégios: `authenticated` tem SELECT (e INSERT/UPDATE de tabela, sem policy para essas operações → negadas pela
  RLS); `anon` não tem nada.
- Consequência: staff do tenant A pode ler linhas de `entrega_termos` do tenant B via REST (snapshot, recebedor,
  hashes, `pdf_path`). Nenhum dado foi lido entre tenants para confirmar isso; a conclusão vem da definição da policy.

## Correção posterior proposta (migração mínima revisável; NÃO criada nem aplicada)
- Adicionar uma policy **RESTRICTIVE** de SELECT `TO authenticated` exigindo
  `EXISTS (entregas e WHERE e.id = entrega_termos.entrega_id AND e.organization_id = public.h15_actor_organization())`,
  preservando a policy permissiva atual (forward-fix, sem DROP).
- Preflight: hash/definição das policies e helpers, ACL e contagem de linhas com `organization_id` nulo em `entregas`
  ligadas a termos (essas ficariam invisíveis: decidir antes, sem backfill implícito).
- Rollback: `DROP POLICY` só da nova restritiva. Smoke A/B com JWT real: A lê A, A não lê B, cliente/produtor sem
  regressão.
- Auditar, na mesma revisão, as tabelas irmãs que usam `is_delivery_staff`/`is_financial_staff` sem tenant
  (`entregas`, `entrega_*`). Não ampliar o escopo sem autorização.
