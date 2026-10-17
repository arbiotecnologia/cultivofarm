# v6 — fechamento dos contratos, NO-GO

Contratos/hash fornecidos pelo auditor arquivados em `v6-contracts-supplied.json`.
Fonte é o texto do pedido, não leitura hospedada desta rodada; hashes não foram
recalculados a partir de reformatação. O catálogo read-only adicional está em
`v6-missing-contracts-readonly.sql`, não executado.

## O que os novos corpos fecham

Resolver Cliente VOLATILE, Produtor/B2B STABLE preservados. Closure de leitura
agora prova profiles.cliente_id, user_clientes principal/vigência/revogação,
roles e org/parceiro ativos; B2B usa owner, papel exato e catalogo_precos.
Entitlements depende de seleção da assinatura por started_at/id, versão
PUBLISHED e effective_from/to, trial_ends_at/cancel_at, overrides starts/ends/
ended_at e created_at/id, features/module ativos. Readiness depende também de
platform_org_admin_invites.access_operation_status/access_valid_after e JWT iat.
Esses contratos estavam ausentes na rodada anterior, não são mais listados
como faltantes. Preferências de portal influenciam seleção visual, não inventam
autorização externa; não incluir consultor ou reimplementar seleção de contexto.

## Contratos exatos ainda faltantes

- `public.is_platform_superadmin(uuid)` chamado por
  `platform_private.b2b_phase1_partner_visible(uuid,boolean)`; closure live/hash/ACL.
- Instalação/ACL/hash atuais de todos os triggers nas 14 tabelas listadas no
  read-only, especialmente invites/subscriptions/overrides/planos/clientes/partner.
- `cf_user_guards_v1.require_admin()`, `public.guard_profile_sensitive_fields()`,
  `public.guard_profile_senha_provisoria()`, `public.guard_profile_senha_ticket()`,
  `public.guard_profile_tenant_fields()`, `public.h15_profile_organization_guard()`,
  `public.guard_superadmin_role_assignment()`, `public.enforce_cliente_id_for_produtor()`,
  `public.update_updated_at_column()` e dependências reais de ticket. O arquivo
  local contém `platform_private.has_ticket(text,uuid)` stub `SELECT false`:
  **não substituir contrato real por esse stub nem alegar harness fiel completo**.
- DDL/index/FKs/nullable das 14 tabelas do read-only (notadamente profiles,
  platform_org_admin_invites, assinaturas, overrides e version_features).
- Corpos live e assinatura completa dos writers efetivamente instalados que
  tocam essas tabelas: admin_edit_user_profile_v1 e seu core, writers de
  subscription/status/profile/plan publish/overrides/invites e partners/clientes.
  As assinaturas sobrecarregadas devem ser enumeradas por catálogo antes de
  escolher uma versão; nomes conhecidos não comprovam tipos/overloads atuais.
  Guards retornados por catálogo devem ser incluídos recursivamente. Não inventar
  lista fechada a partir de migrations históricas ou pg_depend/dynamic SQL.

## Ordem de locks não fechada

Os três guards fornecidos provam singleton → identidade → touch perfis OLD/NEW
e reentrada singleton. Não provam ordem dos writers comerciais/invites/tickets.
Ledger por entidade AFTER STATEMENT pode criar ciclo se writer que segura
revisão de org passa a obter row de partner que outro writer segura antes de
obter revisão de org. Sorted keys dentro de um statement não resolve transações
multi-statement/nested/cascades. Sem corpos de writers não há prova de ordem
compatível, mesmo sem profiles/fanout. Não produzir instalação v6 fingindo isso.
Não tocar auth.users/gates gerenciados nem expandir escopo Auth para fechar teste.

## Snapshot/tempo não fechados para gate

VOLATILE deve comparar conjunto/revisões antes/depois de chamadas canônicas,
incluindo invites, JWT-contexto e dependências dinâmicas. Helpers STABLE usam
snapshots da chamada; testes concorrentes precisam commits nos intervalos reais.
`now()` é estável na transação, não clock de chegada: transação antiga pode
ler vigência já expirada no relógio real. Seleção futura/expiry deve produzir
fronteira conservadora e negar se consulta atravessar fronteira; lease cliente
no máximo min(15s desde início, fronteira server comprovada). Não mudar os
resolvers para satisfazer o cache. Prova de tempo ainda pendente.

Portanto v6 por entidade permanece **desenho**, sem SQL de instalação/rollback
executável ou harness completo declarados. Harness anterior é reprodução de
defeito com guards capturados, não aprovação universal. Próxima implementação
depende exatamente dos contratos/ordem/tempo acima; gates false.