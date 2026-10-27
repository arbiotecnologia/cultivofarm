# catalog-label-conflicts-20261027 — INATIVO (review only)

Alvos LIVE (captura read-only 2026-10-27 16:20 UTC, ref `swzpzcwiasxmjutrmvkm`):

| função | OID | LIVE md5 | candidato md5 |
|---|---|---|---|
| `platform_update_catalog_label(uuid,timestamptz,text,text,uuid)` | 120766 | `75eaa1d0307e9033a6f3ba8e208ee488` | `fdf3adc335996bc4ff90f7a57b8f4370` |
| `platform_set_catalog_label_active(uuid,timestamptz,boolean,text,uuid)` | ver `live-functions.json` | `561d3175812dba477a538992d5d02a01` | `55493f9699ec039057915656355e35ae` |

ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, owner postgres, SECURITY DEFINER, `search_path=""` — inalterados.

## Delta (`delta-sql.diff`)
Em cada corpo, só dois RAISE mudam `40001 → PT409`: `catalog_label_conflict` (CAS `updated_at` stale) e `catalog_label_confirmation_failed`
(pós-condição do UPDATE). Nada muda em locks, autorização, RLS, ACL, dados ou auditoria.

## Dependência residual
`platform_private.catalog_entity_replay` (md5 `bc194d354de83bb0a362bddd0ceb66e6`) segue `40001 catalog_entity_conflict` para chave reutilizada
com outro pedido. Não alterado (helper compartilhado). O cliente trata 40001 e PT409 com a mesma mensagem de conflito.

## Arquivos
- `live-functions.json` / `live-extra.json`: fontes LIVE e pinos de dependências/tabelas (fingerprints de triggers/policies).
- `preflight-readonly.sql` / `postflight-readonly.sql`: guardas compactas (md5 + OID/ACL/owner/config/definer, sem repetir corpos). Não executados pelo agente.
- `candidate.sql.review`: transação com preflight → CREATE OR REPLACE → postflight. `rollback-conditioned.sql.review`: só candidato exato → LIVE exato.
- `test-local.py` / `results-local.json`: PostgreSQL descartável, 52 checks.
- `delta-frontend.diff`: `labelError` mapeia PT409 para conflito + teste.
- `LOCK-REVOCATION-REVIEW.md`: achado separado de revogação durante a espera.

## Evidência
- PG local (Auth SINTÉTICA, schema reduzido, corpos/helpers LIVE exatos): stale, no-op 22023, replay idempotente sem nova auditoria, chave reutilizada → 40001 residual,
  duas conexões (espera de lock observada; 1 vence, 1 conflito), rollback de pós-condição por trigger injetado localmente, negação admin tenant A/B (42501), anon sem EXECUTE, rollback reinstalável — LIVE (40001) e candidato (PT409).
- Frontend: sem retry automático após conflito (uma única chamada); revisão antiga enviada intacta; botão “Atualizar dados” manual; chaves de idempotência derivadas de `updated_at`.
- NÃO há homologação real JWT/RLS. Aplicação/publicação ficam com o auditor.

## Evidência independente do auditor (relato, não reproduzida pelo agente)
- Réplica do `catalogLabelsPanelFlow` com PT409 falhava no código anterior (mensagem genérica); `labelError` aceitando 40001 OU PT409 fez passar original+PT409.
- Sessões reais consultorA/adminB: 403/42501 nas duas RPCs. Baseline 7 rótulos hash `38fc19cca27fa97090f26b1c293d444e`, 32 auditorias intactas. Nada implantado.

## Teste de tela PT409 (local, QueryClient real, transporte simulado)
`catalogLabelsPanelFlow.test.tsx`: após PT409, exatamente 1 escrita; nenhuma releitura nem nova escrita automática em 300 ms; revisão enviada continua V1 e o leitor
mantém o valor antigo até o clique em "Atualizar dados"; só a nova ação do usuário envia V2. 40001 continua aceito (helper residual).

## Candidato adicional: gate de revogação (`revocation-gate/`, INATIVO) — bloqueia conclusão do lote até revisão
Substitui o PT409 isolado (preflight aceita LIVE exato ou PT409 exato). Corpos: PT409 + gate `cf_user_guards_v1.state` → autoridade fresca →
advisory → autoridade fresca → replay → linha → autoridade fresca, e `lock_timeout=3s`. md5: update `afb8fbcdc8df3a8829e1e82ebecaece1`,
active `0dce420a2309a03fb63ac1acbe100295`; config `["search_path=\"\"","lock_timeout=3s"]`; OID/ACL/owner/assinatura inalterados.
- `assemble-gate.py`, `live-gate-deps.json` (corpos LIVE de has_role/is_platform_superadmin/access_ready/acquire_gate/acquire_invitation_gate),
  `preflight-gate-readonly.sql`, `candidate-gate.sql.review`, `postflight-gate-readonly.sql`, `rollback-containment.sql.review` (deny-only: REVOKE EXECUTE de
  authenticated; não restaura corpo vulnerável), `test-gate.py`/`results-gate-local.json` (65 checks, Auth sintética).
- Pins extras: fingerprints dos triggers de gate em user_roles/profiles/convites e ACL+singleton do estado do gate.
- Frontend: `labelError` mapeia 55P03/PT503 para "ocupado, nada gravado", sem retry automático (teste adicionado).
- Detalhes, semântica de ordenação e riscos residuais: `LOCK-REVOCATION-REVIEW.md`. Nada aplicado/publicado.
