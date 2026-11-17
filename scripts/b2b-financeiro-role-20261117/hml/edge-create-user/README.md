# create-user HML rev.1 — correção mínima do 403 falso (somente HML vrlcdwmlytukrjezrrnf)

Causa: a base LIVE v2 (bundle `63825024…`) checa `has_role` com o cliente service_role; `has_role`/`platform_actor_access_ready`
dependem do contexto/ACL do chamador, e o RPC devolve `null` (erro ignorado) → 403 antes do Auth.
Correção (diff `create-user-hml.patch.review`, base `base.index.ts` sha256 `c67e5414…`, candidato `candidate.index.ts` sha256 `a6226cdf…`):
1. `has_role` via cliente do CHAMADOR (JWT); erro ou ≠ true → 403 (falha fechada).
2. Tenant: `h15_actor_organization()` do chamador deve ser igual ao `profiles.organization_id` ativo lido pelo serviço → senão `tenant_scope_required`.
3. Handler exportado para teste; `Deno.serve` só em `import.meta.main`. Nada mais muda: papéis só internos, superadmin reservado, vínculos/parceiros negados, `email_confirm` sem envio, compensação deleteUser.
Não transpõe provisionamento de produção, não cria papel B2B, não altera SQL.

Provas locais: `deno test --allow-env --allow-net handler_test.ts` 15/15 (clientes falsos); `test_profile_writes_pg.py` 14/14
(UPDATE profiles + INSERT user_roles como service_role sob gatilhos verbatim com md5 = C7 HML; perfil inicial do Auth simulado). Não provam Auth/PostgREST hospedado.

Root, nesta ordem: (a) conferir que o `index.ts` LIVE baixado tem sha256 `c67e5414…` (senão parar: base divergiu);
(b) `00-precheck.sql.readonly` → `auth_exec=true` nas duas funções públicas; (c) implantar `candidate.index.ts` como `create-user` SOMENTE no HML, `verify_jwt=false` inalterado;
(d) smoke: não-admin → 403; admin A papel `parceiro_b2b` → 403 `tenant_role_unavailable`; admin A `aplicador` → 200 e conta `QA-FIN-*`; (e) seguir `../qa/provision_fixtures.py`.
Reversão: reimplantar `base.index.ts`. Produção: não aplicar (código de produção é outro).
