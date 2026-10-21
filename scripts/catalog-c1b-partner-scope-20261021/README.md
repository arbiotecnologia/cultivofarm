# C1B-SCOPE — resolução do parceiro pelo vínculo autorizado (candidata, não aplicada)

Data: 21/10/2026. Status: **candidata revisável; nenhum DDL/DML hosted executado, nada promovido/publicado.**

## Evidência (produzida pelo auditor independente, não pelo proprietário)

- Login real teste4 (uid `beb25695-3957-48b0-aff8-6316520ea189`): `get_partner_catalog_secure(uuid)`, `(uuid,boolean)` e `get_partner_catalog_tecnico_secure(boolean)` retornam **403 forbidden_partner**.
- Sessão B2B existe; o bloqueio é de contrato, não de sessão.

## Inventário read-only no ref canônico (21/10/2026)

- `platform_private.b2b_actor_scope(uuid)` (md5 live `09b184da91c59f8b1f9be72217f8c37e`): `org_partner` vem de `organizations.partner_account_id` da organização do perfil; `user_partner` exige `is_valid_b2b_partner_user`.
- `public.is_valid_b2b_partner_user(uuid,uuid)` (md5 live `93520101987e599280460d3dadcf3a9f`): exige vínculo único não revogado, `pu.tenant_id = pa.commercial_owner_organization_id` (tenant fornecedor), parceiro ativo, `count(user_roles)=1` e papel↔papel B2B exclusivo.
- RPCs de catálogo exigem `s.org_partner = p_partner_id` **e** `s.user_partner = p_partner_id`.
- Fato estrutural: **0 de 5** organizações têm `partner_account_id` preenchido; o único `partner_users` (teste4, gestor, ativo) tem `profile_org = pu.tenant = 007bb519-cba0-4704-be2c-cb93ad010048` = `commercial_owner_organization_id` do parceiro `7e52de9a-4bed-4d1e-8200-3255a805465c`.

## Incompatibilidade preexistente (dois modelos canônicos)

- **Modelo A** (b2b_actor_scope/RPCs de catálogo): a organização do perfil é a *organização parceira* (`partner_account_id` preenchido). Nenhuma organização assim existe em produção — o cadastro canônico nunca a cria.
- **Modelo B** (is_valid_b2b_partner_user/provisionamento B2B): o usuário pertence ao *tenant fornecedor* e o vínculo `partner_users` carrega o parceiro. É o único modelo populado.

Resultado: `org_partner` é sempre NULL para qualquer usuário B2B real → `forbidden_partner` estrutural. Não é erro de dado pontual; corrigir por backfill ou mover a organização do usuário foi **expressamente proibido** e não é necessário.

## Correção mínima proposta (candidate.sql.review)

`CREATE OR REPLACE platform_private.b2b_actor_scope(uuid)` — mesma assinatura, OID/grants preservados, nenhum consumidor alterado:

- `org_partner` := `COALESCE(partner_account_id da organização, vínculo validado)`.
  - Organização com parceiro explícito **prevalece**; se divergir do vínculo, os consumidores negam por mismatch (negação cross-tenant preservada).
  - Sem parceiro na organização, resolve pelo vínculo `partner_users` **já validado** por `is_valid_b2b_partner_user` (vínculo único, não revogado, tenant=fornecedor, parceiro ativo/não deletado, papel↔role exclusivos).
- `partner_valid`: com parceiro na organização, checagem inalterada; sem ele, deriva da validação do vínculo (que já exige parceiro ativo).
- Tenant fornecedor e organização parceira **não são substituídos um pelo outro**: o tenant do vínculo continua sendo o fornecedor; o que se resolve é a identidade do parceiro autorizado.
- `is_valid_b2b_partner_user` **não é tocada** (md5 verificado no postflight).

## Impedimentos registrados (não corrigidos nesta candidata)

1. **Multipapel**: `is_valid_b2b_partner_user` exige `count(user_roles)=1` e papel B2B exclusivo — incompatível com os papéis cumulativos planejados (parceiro B2B+gestor+técnico+cliente). Registrado para a fase de contratos funcionais; **não** se abre papéis aqui.
2. **Entitlement**: `has_catalog` depende de `entitlements_for_user` conter `catalogo_precos` para o ator no tenant fornecedor. O postflight verifica; se ausente, é impedimento concreto separado — não se concede acesso por bypass.
3. Homologação positiva não vazia continua pendente de sessão B2B real após aplicação pelo auditor.

## Arquivos

- `preflight.sql` — baseline somente leitura (md5 das funções, contagem de organizações com parceiro, vínculos ativos).
- `candidate.sql.review` — a correção mínima (revisar; aplicar só com autorização do auditor).
- `postflight.sql` — verifica md5 de `is_valid_b2b_partner_user` inalterado, assinatura/grants preservados e resolução do escopo para o padrão teste4.
- `rollback.sql.review` — restaura byte-a-byte a definição live atual (md5 `09b184da…`); seguro porque reabre exatamente o comportamento hoje em produção, nada mais fraco que o baseline.
- `live-snapshot.json` — definições e md5 live das duas funções.
- `test_sql.py` — harness em PostgreSQL local descartável (sintético; não equivale a JWT/RLS real).

## Limites

- Testes são sintéticos/locais; a prova real cabe ao auditor com a sessão B2B já disponível.
- Nenhuma mudança de RLS, roles, sessões, dados, Storage ou frontend.
