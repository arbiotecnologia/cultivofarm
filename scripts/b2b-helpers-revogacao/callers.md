# Mapa de chamadores — 3 helpers B2B (revogação)

Mapeamento lexical em `src/`, `supabase/migrations/` e `scripts/` (2026-10-18).
Nenhum chamador no frontend (`src/`) fora dos arquivos de tipos gerados.

## public.get_b2b_user_role_for_partner(uuid, uuid)
- `supabase/migrations/20260702145433_...sql:200` — trigger de validação de
  `partner_users` (preenche `NEW.user_role` na inserção do vínculo).
- `supabase/migrations/20260930010000_h7o_p2_revogacoes_helpers_v1.sql` —
  inventário/guarda de revogação (lista a assinatura; REVOKE de PUBLIC/anon).
- Impacto da correção: vínculo revogado deixa de receber papel no trigger —
  endurecimento, sem expansão.

## public.is_valid_b2b_partner_user(uuid, uuid)
- `supabase/migrations/20260702145433_...sql:204` — mesmo trigger: rejeita
  vínculo inválido na inserção.
- `supabase/migrations/20260930010000_h7o_p2_revogacoes_helpers_v1.sql` —
  inventário/guarda.
- Impacto: vínculo revogado ou parceiro deletado passa a ser inválido —
  endurecimento, sem expansão.

## platform_private.b2b_actor_scope(uuid)
- `supabase/migrations/20261006191816_...sql:65,142` — funções
  platform_private que consomem o escopo (incl. cadeia
  `b2b_phase1_partner_visible` -> `b2b_actor_scope`).
- `supabase/migrations/20261006203913_...sql:19,68,73`
- `supabase/migrations/20261007133803_...sql:9`
- `supabase/migrations/20261008150531_...sql:20`
- ACL: somente `postgres` e `service_role` (sem EXECUTE para authenticated).
- NÃO chama `b2b_commercial_context` de volta (sem recursão): o context chama
  `b2b_phase1_partner_visible` -> `b2b_actor_scope`, portanto o scope permanece
  folha na cadeia.
- Impacto: `user_partner_count` passa a contar apenas vínculos NÃO revogados e
  `user_partner` só é preenchido com vínculo único elegível (parceiro ativo,
  não deletado, owner não nulo, tenant = owner). Consumidores que exigem
  count=1 + partner não nulo falham fechado para revogado/inelegível —
  endurecimento, sem expansão. `profile_ok`, `org_partner` e `has_catalog`
  preservados (acesso interno/legacy intacto).
