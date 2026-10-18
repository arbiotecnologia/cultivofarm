# Mapa de chamadores — 3 helpers B2B (revogação)

Mapeamento lexical em `src/`, `supabase/migrations/` e `scripts/` (2026-10-18,
corrigido após revisão). Nenhum chamador no frontend (`src/`) fora dos
arquivos de tipos gerados.

## public.get_b2b_user_role_for_partner(uuid, uuid)
- `supabase/migrations/20260702145433_a3b67258-4f0a-42d0-8521-55790aa9d3a7.sql:200`
  — função de trigger `public.validate_partner_user_client_fn`, disparada pelo
  trigger `trg_validate_puc` BEFORE INSERT OR UPDATE em
  **`public.partner_user_clients`** (linhas 223-225 da mesma migração) —
  NÃO é trigger de `partner_users`. Preenche `NEW.user_role` quando nulo.
- `supabase/migrations/20260930010000_h7o_p2_revogacoes_helpers_v1.sql` —
  inventário/guarda de revogação (lista a assinatura; REVOKE de PUBLIC/anon).
- Impacto da correção: vínculo revogado/inelegível deixa de receber papel no
  trigger — endurecimento, sem expansão.

## public.is_valid_b2b_partner_user(uuid, uuid)
- `supabase/migrations/20260702145433_a3b67258-4f0a-42d0-8521-55790aa9d3a7.sql:203`
  — mesma `validate_partner_user_client_fn` (trigger de
  `partner_user_clients`): rejeita vínculo inválido na inserção/atualização.
- `supabase/migrations/20260930010000_h7o_p2_revogacoes_helpers_v1.sql` —
  inventário/guarda.
- `platform_private.b2b_actor_scope` (candidata v2) — passa a chamar a folha
  para validar o vínculo externo único.
- `public.get_b2b_user_role_for_partner` (candidata v2) — reutiliza a folha
  (sem ciclo: a folha não chama get_role).
- Impacto: vínculo revogado, tenant divergente do owner, owner nulo, parceiro
  inativo/deletado, cardinalidade ≠ 1 ou papel inconsistente passam a ser
  inválidos — endurecimento, sem expansão.

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
- Impacto: `user_partner_count` conta apenas vínculos NÃO revogados e
  `user_partner` só é preenchido quando o vínculo único passa na folha
  is_valid. `partner_valid` (parceiro da ORGANIZAÇÃO do ator) mantém a
  semântica antiga (ativo + deleted_at IS NULL, sem exigir owner) — internos
  e legacy sem vínculo externo não são bloqueados. `profile_ok`,
  `org_partner` e `has_catalog` preservados.
