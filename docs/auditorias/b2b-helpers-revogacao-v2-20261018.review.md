# Candidata v2 — Revogação nos 3 helpers B2B (pós-reprovação de f02cbcd8)

Data: 2026-10-18. Escopo: SOMENTE `public.get_b2b_user_role_for_partner(uuid,uuid)`,
`public.is_valid_b2b_partner_user(uuid,uuid)` e `platform_private.b2b_actor_scope(uuid)`.
Nada aplicado em hosted; nenhum DDL/DML de produção; gates e contratos fechados;
sem nova arquitetura/ledger. Aplicação exclusivamente pelo auditor via Supabase.

## 1. Correções exigidas pela revisão e como foram atendidas

### 1.1 Folha comum de elegibilidade/cardinalidade
- `is_valid_b2b_partner_user` é agora a FOLHA COMUM: conta TODOS os vínculos
  não revogados do usuário e exige exatamente 1 ANTES de validar o alvo;
  exige parceiro ativo, `deleted_at IS NULL`, owner
  (`commercial_owner_organization_id`) NÃO nulo e `pu.tenant_id = owner`;
  exige papel consistente com role B2B ÚNICA (`gestor`↔`parceiro_b2b`,
  `tecnico`↔`parceiro_b2b_tecnico`, com negação do outro papel).
- `get_b2b_user_role_for_partner` REUTILIZA `is_valid` (sem ciclo: a folha não
  chama get_role) e eliminou o `LIMIT 1` arbitrário — a cardinalidade 1
  garantida pela folha torna o subselect determinístico.
- `b2b_actor_scope` valida `user_partner` chamando a mesma folha sobre o
  vínculo único não revogado; `user_partner_count` conta TODOS os não
  revogados.
- `partner_valid` (parceiro da ORGANIZAÇÃO do ator) VOLTOU à semântica antiga
  (ativo + `deleted_at IS NULL`, SEM exigir owner) — o endurecimento fica
  restrito ao vínculo EXTERNO `user_partner`, sem bloquear interno/legacy.
  `profile_ok`, `org_partner` e `has_catalog` preservados.

### 1.2 Hashes PRE/POST fixos de pg_get_functiondef
- PostgreSQL local 17.9 REPRODUZ exatamente os 3 hashes PRE live a partir dos
  corpos live revisados (verificado antes de apurar os POST).
- Hashes POST fixos apurados no PG local e commitados (nunca regenerados
  pelos testes):
  - `public.get_b2b_user_role_for_partner(uuid,uuid)` → `27efcdaf40dc0e5287abd4cf418a6571`
  - `public.is_valid_b2b_partner_user(uuid,uuid)` → `93520101987e599280460d3dadcf3a9f`
    (reapurado após rev a1c27b3: folha passou a exigir count TOTAL de
    `user_roles` = 1, alinhado ao contrato E2 `b2b_commercial_context` —
    gestor+administrador ou qualquer 2+ roles falham fechado)
  - `platform_private.b2b_actor_scope(uuid)` → `09b184da91c59f8b1f9be72217f8c37e`
- A verificação inválida anterior (md5 de prosrc contra hash de
  pg_get_functiondef) foi eliminada: tudo usa `md5(pg_get_functiondef(oid))`.

### 1.3 Rollback estrito
- Exige o hash POST EXATO de CADA função ANTES de qualquer alteração; drift,
  ausência ou corpo alheio abortam sem escrever (não sobrescreve código alheio).
- Após restaurar, verifica os hashes PRE EXATOS.
- Guards de ACL/owner/search_path reais antes E depois, em candidata e
  rollback; transação atômica com `lock_timeout=5s` e `statement_timeout=60s`.
- Comparação de ACL/search_path normalizada (itens ordenados) para não depender
  da ordem de serialização do catálogo.

### 1.4 Harness executa arquivos completos
- `test-local.py` não extrai mais CREATEs: executa `candidate.sql.review` e
  `rollback.sql.review` COMPLETOS E INTACTOS via `psql -f` com
  `ON_ERROR_STOP=1` (guards, BEGIN/COMMIT, timeouts incluídos).
- Baseline fiel: corpos live exatos (reproduzem os hashes PRE) + ACLs reais
  (GRANT/REVOKE por role) + owner postgres + search_path idênticos.
- Testado: drift antes da candidata (rejeitado, baseline restaurado), drift
  antes do rollback (rejeitado), atomicidade (as outras funções permanecem nos
  hashes POST quando um guard rejeita), rollback exato por hashes, rollback
  sobre baseline PRE recusado.
- Prova atômica reforçada (rev a1c27b3): snapshot de hashes antes/depois da
  candidata recusada e antes/depois do rollback recusado, INCLUINDO a função
  adulterada; falha de PÓS provocada em CÓPIA TEMPORÁRIA do script completo
  (somente uma constante esperada do bloco pós alterada; originais intactos),
  com todos os corpos PRE preservados após a exceção.
- Cobertura adicional (rev a1c27b3): gestor+administrador (2 roles totais)
  NEGADO em cada um dos 3 helpers; positivo B2B legacy REAL (role
  parceiro_b2b, papel gestor, profile.org=ORG_LEGACY com
  partner_account_id=P_LEGACY, vínculo tenant=owner comercial ORG_OWNER e
  partner=P_LEGACY) com asserts count=1/user_partner=P_LEGACY/profile_ok/
  org_partner/partner_valid — distinto do U_LEGACY administrador sem vínculo,
  que prova apenas o ramo interno de org legacy.
- Stubs declarados: `has_role` lê tabela-fixture `user_roles` (sem RLS/JWT);
  `entitlements_for_user` stub com fixture. Nenhum trigger live desligado (o
  banco descartável não tem triggers).

### 1.5 Cobertura por helper e callers.md
- Negativos em CADA helper: revogado, tenant errado, owner NULL, parceiro
  inativo, parceiro deletado, 0 vínculos, 2 vínculos, papel inconsistente,
  usuário com DOIS papéis B2B.
- Positivos REAIS: gestor elegível, tecnico elegível, INTERNO (profile ativo
  em org sem partner, sem vínculo → profile_ok=true, partner_valid=false) e
  LEGACY REAL (profile.organization_id = ORG_LEGACY cujo partner_account_id =
  P_LEGACY → profile_ok=true, org_partner=P_LEGACY, partner_valid=true).
- Negativo: org inativa → profile_ok=false.
- `callers.md` corrigido: `validate_partner_user_client_fn` é trigger de
  `partner_user_clients` (`trg_validate_puc`, migração 20260702145433 linhas
  191/223-225), NÃO de `partner_users`.

## 2. Resultados

- Harness local: **71/71 checks PASS** (exit 0), incluindo guards, drift,
  atomicidade e rollback exato.
- Prova externa do defeito (auditor, produção, BEGIN+UPDATE guardado+ROLLBACK):
  sob `revoked_at` setado, os 3 helpers antigos continuaram concedendo
  role/valid/count=1; rollback confirmou link ativo. Isso é prova SQL do
  defeito, NÃO JWT.
- Código E1/E2 e hashes preservados; nenhum DDL novo feito.

## 3. Caminhos dos artefatos

- `scripts/b2b-helpers-revogacao/candidate.sql.review`
- `scripts/b2b-helpers-revogacao/rollback.sql.review`
- `scripts/b2b-helpers-revogacao/test-local.py`
- `scripts/b2b-helpers-revogacao/callers.md`

## 4. Limites honestos

- Harness local não prova JWT/RLS hosted nem `b2b_commercial_context`.
- Risco não é nulo: helpers corrigidos ainda NÃO aplicados em produção;
  monitor de época inativo (gate false); integração não homologada.
- As 3 assertions de autorização da suíte ampla (d51-4 ×2, d51-5) foram
  CORRIGIDAS em etapa posterior (somente testes, sem tocar runtime das Edges):
  d51-4 prova o wiring real `Configuracoes.tsx` → `usuariosListQuery.ts`
  (RPCs `tenant_admin_list_users`/`tenant_admin_set_user_active`, query key
  tenant/user, client RPC fake com erro e `user_id` divergente); d51-5 testa
  comportamentalmente o guard real `_shared/catalog-superadmin-guard.ts`
  (importado via alias `@edge-shared` no vitest) e a ordem antes do
  service-role em ambas as Edges. Suíte `src/test/security` 30/30 arquivos,
  427/427 testes; tsgo limpo. As demais 5 falhas pré-existentes da suíte
  ampla (não relacionadas a autorização) permanecem abertas.
- Correção de evidência: relatório anterior atribuiu d51-4 a
  `auth/useAuth.tsx`; a fonte real é a página `Configuracoes.tsx` delegando
  aos helpers de `src/lib/configuracoes/usuariosListQuery.ts`.
