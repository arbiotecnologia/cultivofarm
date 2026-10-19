# Monitor — confirmação em UMA viagem ao servidor (pacote contra PUBLICADO d58c1730)

Status: candidato para revisão independente. O agente NÃO aplicou SQL em nenhum banco e NÃO publicou.
Alvo exclusivo: Supabase `swzpzcwiasxmjutrmvkm` (guarda `fiscal_environment_marker`). Lease 15 s, folga 7,5 s,
carregador limitado d58 (20 s), gates, rotas e grants existentes: inalterados. Não toca contratos, portais, recebíveis, OS, lote.

## Por que
Pausas reais no bundle C3eJFnHn: par B rtt 10.854 ms; admin B 7.867 ms; residual B 7.519 ms; todas com lease −7…−11 ms.
A probe d58 faz 2 ondas sequenciais (h15/perfil/papéis → has_role/papéis/h15), então custa 2× a latência por chamada
(~3,8–5,4 s cada no real). Com lease medida do início da requisição, total ≥ ~7,5 s não renova a tempo.

## RPC autoritativa existente?
Não. Read-only hospedado (2026-10-19): `h15_actor_organization`, `has_role`, `technical_actor_ready`,
`fn_authz_uid_scope_ok` só devolvem booleano/uuid; nenhuma devolve identidade + tenant + papéis. `internal_actor_context_v1` ausente.

## Mudança mínima (`function.sql.review`)
`public.internal_actor_context_v1() RETURNS jsonb`, `LANGUAGE sql STABLE`, **SECURITY INVOKER**, `search_path ''`.
Uma única instrução (uma instantânea) para o PRÓPRIO `auth.uid()`:
`{v:1, user_id, organization_id: public.h15_actor_organization(), profile:{user_id, organization_id, ativo, senha_provisoria},
roles:[papéis ordenados], roles_confirmed: bool_and(public.has_role(uid, papel)) (false se 0 papéis)}`; sem `auth.uid()` → NULL.
- INVOKER: lê só o que o usuário já lê hoje pelas policies "Users can view own …"; chama as mesmas funções já concedidas.
  Não é DEFINER porque não precisa: nenhum privilégio novo, sem parâmetro (não consulta outro usuário).
- ACL final exata `{postgres=X/postgres,authenticated=X/postgres}`; PUBLIC/anon/service_role revogados.
- h15/has_role continuam aplicando perfil ativo, empresa ativa, readiness, convite em processamento e JWT `iat` antigo.
- Uma instantânea é mais forte que as 2 ondas: não há mistura de estados entre leituras.

## Frontend (`src/lib/authz/internalContextProbe.ts`, único arquivo de runtime)
Chama só a RPC. Erro/RPC ausente (PGRST202)/transporte → `internal_probe_unavailable` → monitor expira (`error`). **Sem fallback**
para a probe antiga. Decisão continua no cliente sobre conjunto EXATO esperado: `v===1`, `user_id`/`organization_id`
iguais aos esperados, perfil próprio ativo e não provisório, `roles_confirmed===true`, papéis strings sem duplicata = esperado.
Subconjunto/superconjunto/0 papéis/outro tenant/outra identidade/formato desconhecido → nega. Fingerprint idêntico ao d58.

## Ordem de implantação (obrigatória)
1. Revisão independente deste pacote (`SHA256SUMS.sql`, `frontend.patch`, `SHA256SUMS.candidate`).
2. Hospedado `swzpzcwiasxmjutrmvkm`: `preflight-readonly.sql` → deve imprimir `PRE_OK`.
3. Aplicar `candidate.sql.review` (transação: PRE → CREATE → REVOKE/GRANT → COMMENT → POST; aborta em qualquer desvio).
4. `postflight-readonly.sql` → `POST_OK`. Opcional: sessão real chama a RPC e confere só o próprio contexto.
5. Só então publicar o frontend. Publicar antes do SQL = todos os escopos internos monitorados pausam (falha fechada).

## Reversão
1. Frontend primeiro: `rollback.sh` (bytes exatos d58c1730 de 11 arquivos, remove adaptador de teste; verificado em cópia temporária).
2. Depois `rollback.sql.review`: exige POST exato, `DROP FUNCTION`, termina exigindo PRE exato.

## Evidências locais (não são homologação)
- Read-only hospedado: todas as condições do PRE verdadeiras (ref, PG17, 5 dependências md5/ACL/owner, policies, RLS, únicos, USAGE, alvo ausente).
- `test-local.py`: PostgreSQL 17 descartável, dependências recriadas byte-idênticas (md5 = hospedado), auth sintético por GUC:
  30/30 — pre/post/rollback/reaplicação recusada, par, residual nos 2 sentidos, superset, 0 papéis, inativo, provisório,
  empresa inativa, troca de tenant, `iat` antigo vs novo, convite processing, outro usuário, anon sem EXECUTE, STABLE/INVOKER/ACL.
- Vitest: `internalProbeLatency.test.ts` 40/40 (1 RPC por probe; d58 a 3,9 s/chamada = 7,8 s expira, candidato a 3,9 s estável 10 min;
  3 s estável 10 min para par/gestor/consultor; revogação parcial vista na confirmação seguinte; 8 s pausa; 15.000/15.008/20.000 ms
  timeout e resposta tardia não revive; RPC ausente pausa sem fallback; tenant/inativo/provisório/sem uid/outra identidade/formatos).
- Testes de integração existentes recebem `helpers/internalActorContextAdapter.ts` (fake da RPC a partir do transporte fake de cada
  arquivo). Asserções do colchete h15 final (2 chamadas) foram substituídas pela semântica de instantânea única; testes de RTT 3 s
  passaram a usar 3 s por RPC. Config+lib+hooks+guards+authz 869/869; config+security+saas 2288/2290 (2 falhas preexistentes de
  tipos legados/`ClienteDocumentosTab`, idênticas na baseline). tsgo app/node sem erros.

## Limites (honestos)
- Latência total ≥ 15 s continua bloqueada (correto). RTT sustentado ≳ 7 s também pausa: requisições são sequenciais e cada lease
  conta do início da própria requisição (RTT + intervalo mínimo + RTT ≤ 15 s). Isso é falha segura, não regressão.
- Uma mudança confirmada no banco depois da instantânea do servidor só é vista na confirmação seguinte (≤ lease). Igual ao d58 para
  mudanças após a 2ª onda; a 2ª onda d58 só pegava mudanças durante a 1ª.
- Fake de transporte ≠ JWT/RLS real. Sem homologação real; renovação natural estável, anexos e revogação real continuam pendentes.
