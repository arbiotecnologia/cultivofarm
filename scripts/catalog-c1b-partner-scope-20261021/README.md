# C1B-SCOPE v2 — resolução do parceiro pelo vínculo autorizado (candidata, não aplicada)

Data: 21/10/2026. Status: **candidata revisável v2; nenhum DDL/DML hosted executado, nada promovido/publicado.**

## Revisão independente SHA72c9b82 (v1 NÃO aplicada)

A v1 (`COALESCE(valid.pid)`) foi rejeitada: `is_valid_b2b_partner_user` só confere
`pu.tenant_id = pa.commercial_owner`, sem exigir `profiles.organization_id = pu.tenant_id`,
sem `valid_from` e sem owner ativo — um perfil movido para outra organização com vínculo
antigo poderia obter o parceiro anterior. A v2 endurece o caminho fornecedor com a cadeia
completa (ver candidate.sql.review). Evidências reais citadas aqui foram produzidas pelo
auditor independente, não pelo proprietário.

## Evidência (auditor independente)

- Login real teste4 (uid `beb25695-3957-48b0-aff8-6316520ea189`): `get_partner_catalog_secure(uuid)`, `(uuid,boolean)` e `get_partner_catalog_tecnico_secure(boolean)` retornam **403 forbidden_partner**.
- Sessão B2B existe; o bloqueio é de contrato, não de sessão.

## Inventário read-only no ref canônico (21/10/2026)

- `platform_private.b2b_actor_scope(uuid)` (md5 live `09b184da91c59f8b1f9be72217f8c37e`): `org_partner` vem de `organizations.partner_account_id`; `user_partner` exige `is_valid_b2b_partner_user`.
- `public.is_valid_b2b_partner_user(uuid,uuid)` (md5 live `93520101987e599280460d3dadcf3a9f`): vínculo único não revogado, `pu.tenant_id = pa.commercial_owner_organization_id`, parceiro ativo, `count(user_roles)=1`, papel↔role B2B exclusivos.
- RPCs de catálogo exigem `s.org_partner = p_partner_id` **e** `s.user_partner = p_partner_id`.
- Fato estrutural: **0 de 5** organizações têm `partner_account_id`; o único `partner_users` (teste4, gestor, ativo) tem `profile_org = pu.tenant = 007bb519-cba0-4704-be2c-cb93ad010048` = `commercial_owner` do parceiro `7e52de9a-4bed-4d1e-8200-3255a805465c`.

## Consumidores de b2b_actor_scope (impacto além do catálogo)

Diretos (inventário live por prosrc): `platform_private.assert_b2b_partner_scope(uuid,uuid)`,
`platform_private.b2b_phase1_partner_visible(uuid,boolean)`, `public.get_partner_catalog_secure(uuid)`,
`public.get_partner_catalog_tecnico_secure()` e `public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)`.
Ou seja: a correção afeta também visibilidade fase-1 e resolução de preços comerciais/financeiro —
não só o catálogo. Nenhuma policy de RLS referencia a função diretamente. Os testes negativos
cobrem a negação no nível do escopo que esses consumidores usam (org_partner/user_partner/mismatch).

## Incompatibilidade preexistente (dois modelos canônicos)

- **Modelo A** (b2b_actor_scope/RPCs): a organização do perfil é a *organização parceira*. Nenhuma existe em produção.
- **Modelo B** (is_valid_b2b_partner_user/provisionamento): usuário no *tenant fornecedor* + vínculo `partner_users`. Único modelo populado.

Resultado: `org_partner` sempre NULL para usuários B2B reais → `forbidden_partner` estrutural. Backfill ou mover organização foi **expressamente proibido** e não é necessário.

## Correção mínima proposta (candidate.sql.review, v2)

`CREATE OR REPLACE platform_private.b2b_actor_scope(uuid)` — mesma assinatura, OID/grants preservados:

- `org_partner` := `COALESCE(partner_account_id da organização, vínculo validado)`.
  - Organização com parceiro explícito **prevalece**; divergência do vínculo nega por mismatch nos consumidores.
  - Sem parceiro na organização, o vínculo só resolve com a **cadeia completa**: perfil ativo, organização do perfil ativa/`status='ativa'`, `profiles.organization_id = pu.tenant_id = pa.commercial_owner_organization_id`, `valid_from IS NULL OR <= now()`, `revoked_at IS NULL`, parceiro ativo/não deletado, owner comercial ativo/`status='ativa'`, e `is_valid_b2b_partner_user`.
- `partner_valid`: caminho explícito inalterado; caminho fornecedor deriva da cadeia validada.
- Tenant fornecedor e organização parceira **não são substituídos** um pelo outro.
- `is_valid_b2b_partner_user` **não é tocada** (guard transacional + md5 no postflight).
- Guard transacional: `SET LOCAL lock_timeout='5s'` + bloco `DO` que aborta se os md5 de baseline
  (`09b184da…` e `93520101…`) divergirem antes do replace.

## Impedimentos registrados (não corrigidos nesta candidata)

1. **Multipapel**: `count(user_roles)=1` e papel exclusivo em `is_valid_b2b_partner_user` — incompatível com papéis cumulativos planejados. Registrado para a fase de contratos funcionais; **não** se abre papéis aqui.
2. **Entitlement**: `has_catalog` depende de `entitlements_for_user` conter `catalogo_precos`. Postflight verifica; se ausente, é impedimento concreto separado.
3. Homologação positiva não vazia pendente de sessão B2B real após aplicação pelo auditor.

## Arquivos

- `preflight.sql` — baseline somente leitura (md5, contagens, vínculos ativos, grants).
- `candidate.sql.review` — correção mínima v2 (revisar; aplicar só com autorização do auditor).
- `postflight.sql` — md5 do validador inalterado, assinatura/grants preservados, escopo teste4, entitlement e verificação de rollback.
- `rollback.sql.review` — restaura byte-a-byte a definição live (md5 `09b184da…`); reabre exatamente o comportamento em produção, nada mais fraco que o baseline.
- `live-snapshot.json` — definições e md5 live das duas funções.
- `test_sql.py` — harness PostgreSQL local descartável (sintético; não equivale a JWT/RLS real).

## Testes (harness sintético local)

17 verificações: baseline md5 das duas funções, negação live do padrão teste4, validador
intocado, e casos positivos/negativos — padrão teste4, modelo A, revogado, dois vínculos,
multipapel, parceiro inativo, tenant divergente, mismatch org explícita, papel↔role
divergentes, perfil inativo, **perfilB+vínculoA**, **vínculo futuro**, **owner inativo**,
papel técnico (escopo sem finanças) e cross-parceiro nos dois sentidos.

## Limites

- Testes sintéticos/locais; a prova real cabe ao auditor com a sessão B2B já disponível.
- Nenhuma mudança de RLS, roles, sessões, dados, Storage ou frontend.
