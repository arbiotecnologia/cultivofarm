# Foundation de cache de autorização (mesma identidade) — 2026-10-17

Recorte autorizado após instalação do principal v3. Sem troca de vínculos, sem
SQL hospedado, sem publicação, sem abrir gate de associação.

## 1. Reconciliação do principal v3 (fato instalado)

- Migration `20261016235551 user_client_principal_current_links_statement_sync`
  instalada pelo auditor; MD5 live `1d053564ccd5fa672a10ec87d5cb0baa`.
- Ajuste único no preflight: comparação do trigger por
  `tgfoid='public.sync_user_cliente_principal()'::regprocedure`, `tgnargs=0`,
  `tgqual IS NULL`, `octet_length(tgargs)=0` (live omite prefixo de schema no
  `pg_get_triggerdef`). Espelhado em `scripts/user-links-principal/candidate.sql.review`.
- Índice live `uq_user_clientes_principal UNIQUE(user_id) WHERE principal`
  NÃO estava no harness; espelhado. Correção de alegação anterior: UPDATE
  marcando segundo `principal=true` é NEGADO (23505) — o índice verifica
  unicidade antes do trigger AFTER STATEMENT. Harness corrigido: troca de
  principal só via revogação/vigência. **40/40 checks PASS** em PostgreSQL
  isolado (guards reais, FK cascade, writer aninhado, 2 conexões).
- Modo associação futuro terá de resolver troca de principal sem violar o
  índice e sem flags/GUC setáveis — pendência registrada.

## 2. SQL candidato (FORA de migrations, NÃO aplicado)

`scripts/authz-cache/candidate.sql.review` — MD5 `422ea82954e291c58aed7f8de5abfd81`,
SHA-256 `cc09ac36db1f5f824fadf654a9505d21d87543ecf61493d1da0ff0d10274d774`.

- `public.get_my_authz_fingerprint()`: self-only, sem parâmetro de
  usuário/tenant; deriva `auth.uid()`; não confia em JWT metadata.
- Fingerprint opaco = md5(`profile.updated_at` monotônico + roles + vínculos
  `user_clientes` com estado completo + `partner_users`). `updated_at`
  captura A→B→A (cliente_id sozinho não basta).
- Flag `v` por vínculo computada com `now()`: expiração temporal muda o
  fingerprint mesmo sem DML.
- Elegibilidade atual via resolver canônico `get_cliente_ids_for_user`
  (fonte única de vigência/revogação); ACL fechada (REVOKE PUBLIC/anon,
  EXECUTE authenticated/service_role); STABLE SECURITY DEFINER, search_path fixo.
- Rollback: `DROP FUNCTION` — função nova, sem dados/triggers, contenção completa.

Harness `scripts/authz-cache/test-local.py`: **14/14 checks PASS** em
PostgreSQL isolado — negação sem sessão, ACL anon negada, elegibilidade,
mudança de fingerprint por vínculo/revogação/vigência temporal/roles/
updated_at (ABA)/partner, self-only entre identidades, determinismo.
UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, policies completas, resolver live integral.

## 3. Frontend (gate próprio FECHADO)

- `src/lib/authz/authzEpochGate.ts`: `AUTHZ_CACHE_FOUNDATION_ENABLED = false`.
- `src/lib/authz/authzEpochMonitor.ts`: monitor único por AuthProvider.
  Polling 10s apenas visível+online+lease válida; lease máx 15s medida desde
  o INÍCIO do request (resposta atrasada não renova lease vencida);
  foco/visibility/online revalidam antes de mostrar; erro/offline/timeout
  expiram e ocultam; mudança de fingerprint notifica epoch change uma vez por
  época; geração por request descarta respostas antigas (ABA).
- Integração em `src/hooks/useAuth.tsx` atrás do gate: epoch change →
  geração++, `queryClient.cancelQueries()+clear()`, `clearActivePortalContext()`,
  `refresh()`; expire → cancela consultas e limpa seleção de portal. Callback
  de auth permanece síncrono; sem chamadas Supabase dentro dele; sem
  BroadcastChannel entre sessões (cada sessão mantém o próprio monitor).

Testes `src/test/config/authzEpochMonitor.test.ts` (fake clock + promises):
11/11 — troca de vínculo mesmo uid/org/role, duas sessões sem Broadcast,
expiração temporal, erro, offline, retorno de foco, resposta atrasada/ABA,
logout, ineligible. Regressão F2: **52/52 PASS** nos 3 arquivos.
Lint focal: 0 erros (4 warnings padrão do arquivo, pré-existentes).
Build OK; `git diff --check` limpo.

## 4. Limites declarados

- Não finge revogação instantânea offline nem de bytes já baixados/URL
  assinada — anexos/signed URLs são o próximo recorte.
- Autorização SQL continua validando estado atual independente da UI.
- Gate de associação permanece fechado; common F2 e V0 instalados preservados;
  SMTP/Auth/senhas/fiscal/comercial intocados.
- RPC candidato NÃO aplicado: enquanto o gate estiver fechado o monitor não é
  criado; abrir o gate sem a função instalada faz o fetcher falhar e expirar
  (fail-closed, oculta dados) — comportamento seguro, mas o gate só deve abrir
  após a migration ser aplicada e revisada.
